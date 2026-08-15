import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, onAuthFailure, setAccessToken as setClientAccessToken } from "../api/client";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: string;
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
  register: (input: RegisterInput) => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, accessToken: null });

  // If a background API call's access token expired and the refresh attempt also failed
  // (e.g. the refresh cookie itself expired or was revoked), the session is genuinely over.
  // Clearing state here is what makes RequireAuth notice and redirect to /login on whatever
  // page the user happens to be on - not just on their next explicit action.
  useEffect(() => onAuthFailure(() => setState({ user: null, accessToken: null })), []);

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

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: Boolean(state.user && state.accessToken),
      register,
      login,
      logout,
    }),
    [state, register, login, logout],
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
