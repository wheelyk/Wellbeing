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
