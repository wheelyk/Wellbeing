import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./Button";

const links = [
  { to: "/dashboard", label: "Home" },
  { to: "/history", label: "History" },
  { to: "/trends", label: "Trends" },
  { to: "/settings", label: "Settings" },
];

export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <nav className="flex shrink-0 gap-4">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? "text-brand" : "text-text-muted hover:text-text"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        {/* The nav links above are shrink-0 (never shrink), so on a narrow phone screen there's
            often only a sliver of width left for the name - even with truncate/min-w-0 (which
            still stop it from breaking the layout, so they stay as a defensive fallback), a
            genuinely long name can render as an unreadable few-pixel-wide smear rather than a
            readable "Jane…" Simplest fix that's also a common mobile pattern: hide the name
            entirely below `sm` (640px) and only show it once there's realistically room for it.
            Log out itself is never hidden - it must stay reachable at every width. */}
        <div className="flex min-w-0 items-center gap-3">
          {user && (
            <span className="hidden min-w-0 truncate text-sm text-text-muted sm:block">
              {user.displayName}
            </span>
          )}
          <Button variant="secondary" onClick={() => logout()} className="shrink-0">
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
