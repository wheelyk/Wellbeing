const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// Lets AuthContext know a session has ended for reasons the client detected on its own
// (a failed background refresh) rather than an explicit logout() call, so it can clear its
// user/token state - which is what makes RequireAuth actually redirect to /login. Without
// this, clearing the module-level accessToken above is invisible to React: the app would
// keep rendering as if still logged in until the next full page load.
type AuthFailureListener = () => void;
let authFailureListeners: AuthFailureListener[] = [];

export function onAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.push(listener);
  return () => {
    authFailureListeners = authFailureListeners.filter((l) => l !== listener);
  };
}

function notifyAuthFailure(): void {
  authFailureListeners.forEach((listener) => listener());
}

// Concurrent 401s (e.g. two requests firing at once with an expired token) must not each
// trigger their own refresh call - they'd race to rotate the refresh cookie and only one
// would win. Sharing a single in-flight refresh promise means every caller waits on the
// same attempt instead.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          accessToken = null;
          notifyAuthFailure();
          return null;
        }
        const data = (await res.json()) as { accessToken: string };
        accessToken = data.accessToken;
        return data.accessToken;
      })
      .catch(() => {
        accessToken = null;
        notifyAuthFailure();
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Attempts to turn a still-valid httpOnly refresh cookie into a real session on app startup -
// e.g. after a browser refresh, when React state (including the in-memory access token above)
// has just been wiped and rebuilt from scratch, but the cookie a previous login set is still
// sitting in the browser, unexpired. Deliberately not routed through the same refreshPromise
// deduplication `refreshAccessToken` uses below: that mechanism exists for concurrent *retries*
// of already-in-flight requests hitting a 401 together, a scenario that can't happen yet at the
// single explicit call site this is used from (AuthProvider's mount effect, before anything
// else has had a chance to make a request at all).
export async function rehydrateSession<TUser>(): Promise<{
  user: TUser;
  accessToken: string;
} | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user: TUser; accessToken: string };
    accessToken = data.accessToken;
    return data;
  } catch {
    return null;
  }
}

interface RequestOptions extends RequestInit {
  /** Skip attaching the access token and skip the refresh-on-401 retry (for auth endpoints themselves). */
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options;

  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

  let res = await doFetch(skipAuth ? null : accessToken);

  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.message ?? "Request failed",
      body?.error?.code,
      body?.error?.details,
    );
  }

  return body as T;
}

export interface DownloadedFile {
  blob: Blob;
  /** The filename the server suggested via Content-Disposition, if it sent one. */
  filename: string | null;
}

// A variant of apiFetch for endpoints that return a raw downloadable file (e.g. GET /api/export)
// rather than a JSON body - reuses the exact same access-token-attach + refresh-on-401-retry
// logic apiFetch already has above (see its own comments for why: concurrent 401s must share one
// refresh attempt, not each trigger their own), but returns the raw Blob instead of parsing the
// response as JSON, and surfaces the server's suggested filename rather than the caller having to
// invent one.
export async function apiFetchFile(
  path: string,
  options: RequestOptions = {},
): Promise<DownloadedFile> {
  const { skipAuth, headers, ...rest } = options;

  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });

  let res = await doFetch(skipAuth ? null : accessToken);

  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    // An error response from this kind of endpoint is still JSON (see errorHandler.ts and
    // export.ts's own 404 case) - parsed the same way apiFetch's own error path does, rather
    // than trying to treat an error body as a downloadable file.
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.message ?? "Request failed",
      body?.error?.code,
      body?.error?.details,
    );
  }

  // Content-Disposition looks like `attachment; filename="welltrack-export-2026-08-19.json"` -
  // this pulls just the quoted filename back out.
  const filenameMatch = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/);

  return {
    blob: await res.blob(),
    filename: filenameMatch?.[1] ?? null,
  };
}
