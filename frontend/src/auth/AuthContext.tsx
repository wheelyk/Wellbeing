import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  apiFetch,
  onAuthFailure,
  rehydrateSession,
  setAccessToken as setClientAccessToken,
} from "../api/client";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: string;
  // Computed server-side from an ADMIN_EMAIL env var, not a stored role (see backend's
  // lib/isAdmin.ts) - there's exactly one admin account, confirmed with the project owner.
  // Gates RequireAdmin.tsx and the admin-only link in Settings.
  isAdmin: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
}

interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  // True only until the mount-time rehydration attempt below finishes (success or failure) -
  // lets RequireAuth tell "we haven't checked whether a session cookie exists yet" apart from
  // "we checked, and there genuinely isn't one," so it doesn't redirect a real, still-valid
  // session to /login just because that check hasn't resolved yet.
  isLoading: boolean;
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  // Merges a partial update into the current session user - for a field the server just
  // confirmed changed (e.g. the four category toggles in SettingsPage) without a full
  // rehydrateSession() round-trip. A no-op if called with no session user (shouldn't happen from
  // any RequireAuth-guarded page, but avoids a crash if it ever is).
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, accessToken: null });
  const [isLoading, setIsLoading] = useState(true);

  // If a background API call's access token expired and the refresh attempt also failed
  // (e.g. the refresh cookie itself expired or was revoked), the session is genuinely over.
  // Clearing state here is what makes RequireAuth notice and redirect to /login on whatever
  // page the user happens to be on - not just on their next explicit action.
  useEffect(() => onAuthFailure(() => setState({ user: null, accessToken: null })), []);

  // On first mount (e.g. right after a browser refresh, when this component's own state has
  // just been rebuilt from nothing), try to turn a still-valid httpOnly refresh cookie back
  // into a real session - without this, a page reload always shows Login even when the user's
  // session is still genuinely valid, since nothing here previously read the one piece of
  // evidence the browser was already holding onto.
  useEffect(() => {
    let cancelled = false;
    rehydrateSession<AuthUser>().then((result) => {
      if (cancelled) return;
      if (result) {
        setState({ user: result.user, accessToken: result.accessToken });
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const data = await apiFetch<{ user: AuthUser; accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuth: true,
    });
    setClientAccessToken(data.accessToken);
    setState({ user: data.user, accessToken: data.accessToken });
  }, []);

  const register = useCallback(
    async (input: RegisterInput) => {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
        skipAuth: true,
      });
      // Register doesn't issue tokens itself - log in immediately after with the same
      // credentials so a new user lands straight on the dashboard.
      await login({ email: input.email, password: input.password });
    },
    [login],
  );

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST", skipAuth: true }).catch(() => {});
    setClientAccessToken(null);
    setState({ user: null, accessToken: null });
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setState((prev) => (prev.user ? { ...prev, user: { ...prev.user, ...patch } } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.user && state.accessToken),
      isLoading,
      register,
      login,
      logout,
      updateUser,
    }),
    [state, isLoading, register, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
