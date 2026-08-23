import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

// Mirrors RequireAuth.tsx's exact shape, checking `user?.isAdmin` instead of `isAuthenticated`.
// Nested *inside* a RequireAuth route (see App.tsx), so by the time this ever renders,
// authentication itself is already settled - the only new question here is whether this
// specific account is the one hardcoded admin (see backend's lib/isAdmin.ts). Redirects to
// Dashboard, not Login, since a non-admin authenticated user isn't unauthenticated - "you're
// logged in, but this page isn't for you" is a different case from "you're not logged in at
// all," and sending them back to their own Dashboard reflects that.
export function RequireAdmin() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user?.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
