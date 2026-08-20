import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

// Same four routes/labels as NavBar's own desktop nav (kept as a separate literal, not a shared
// import, since the two components' markup - a horizontal row of text links vs. a bottom tab bar
// with stacked icon+label buttons - is different enough that sharing the array wouldn't save much
// and would couple two independently-styled components together).
const links = [
  { to: "/dashboard", label: "Home", icon: "🏠" },
  { to: "/history", label: "History", icon: "🕘" },
  { to: "/trends", label: "Trends", icon: "📈" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

interface BottomNavProps {
  // An optional 5th item docked in the middle of the bar, raised above its top edge (see
  // QuickAddFab, the only thing this is ever passed as - and DashboardPage, the only page that
  // passes it). Splits the four nav links either side of it (two, then the action, then two)
  // rather than appending it as a plain 5th flex-1 tab, so it reads as a distinct docked action
  // rather than just another destination. Omitted entirely on every other page, which keeps
  // rendering the plain 4-tab row exactly as before - Quick Add has only ever made sense on the
  // Dashboard (each of its four target sections lives there - see dashboardQuickAddEvent.ts),
  // so there's nothing for it to do anywhere else.
  centerAction?: ReactNode;
}

function NavLinkItem({ link }: { link: (typeof links)[number] }) {
  return (
    <NavLink
      to={link.to}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
          isActive ? "text-brand" : "text-text-muted hover:text-text"
        }`
      }
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {link.icon}
      </span>
      {link.label}
    </NavLink>
  );
}

// The primary navigation surface on mobile - fixed to the bottom of the viewport (thumb-reachable
// on a phone, unlike a top bar) and hidden from `md:` up, where NavBar's own top nav takes over
// instead (see NavBar.tsx's comment on the same breakpoint). Reuses the exact NavLink/isActive
// pattern NavBar already uses for its own links, so "which route is active" is determined the
// same way in both places.
export function BottomNav({ centerAction }: BottomNavProps = {}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center border-t border-border bg-surface md:hidden"
    >
      {centerAction ? (
        <>
          {links.slice(0, 2).map((link) => (
            <NavLinkItem key={link.to} link={link} />
          ))}
          <div className="flex flex-1 items-center justify-center self-stretch">
            {centerAction}
          </div>
          {links.slice(2).map((link) => (
            <NavLinkItem key={link.to} link={link} />
          ))}
        </>
      ) : (
        links.map((link) => <NavLinkItem key={link.to} link={link} />)
      )}
    </nav>
  );
}
