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
        {/* Below `md:`, primary navigation lives in the fixed BottomNav tab bar instead (see
            BottomNav.tsx) - a phone-width screen doesn't have room for both a top nav and a
            bottom nav, and a bottom tab bar is the more thumb-reachable of the two. This top bar
            stays slim on mobile (just the brand mark + account actions) and only grows the same
            four links back in, as a conventional desktop top nav, from `md:` up - the same
            underlying routes/workflow either way, just a different chrome for the screen size. */}
        <div className="flex min-w-0 items-center gap-6">
          <span className="shrink-0 text-lg font-semibold text-brand">WellTrack</span>
          <nav className="hidden shrink-0 gap-4 md:flex">
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
        </div>
        {/* This originally guarded against the nav links (shrink-0, never shrinking) leaving only
            a sliver of width for the name on a narrow phone screen. The nav links are now hidden
            below `md:` (see above), so that specific crowding only recurs once they reappear at
            `md:` and up - but truncate/min-w-0 stay as a defensive fallback regardless of screen
            width, and hiding the name below `sm` (640px) is still the simplest way to guarantee
            it never renders as an unreadable few-pixel-wide smear. Log out itself is never
            hidden - it must stay reachable at every width. */}
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
