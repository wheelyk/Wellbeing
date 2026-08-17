import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // While AuthProvider's mount-time rehydration attempt is still in flight, `isAuthenticated`
  // is always false regardless of whether a valid session cookie actually exists (state hasn't
  // been populated yet either way) - redirecting to /login on that basis would send someone
  // with a perfectly valid session there anyway, just because the check hadn't resolved yet.
  // Rendering nothing for this brief moment (rather than the real page, or Login) avoids both a
  // flash of the wrong content and an incorrect redirect.
  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
