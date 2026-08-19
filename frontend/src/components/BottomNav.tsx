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

// The primary navigation surface on mobile - fixed to the bottom of the viewport (thumb-reachable
// on a phone, unlike a top bar) and hidden from `md:` up, where NavBar's own top nav takes over
// instead (see NavBar.tsx's comment on the same breakpoint). Reuses the exact NavLink/isActive
// pattern NavBar already uses for its own links, so "which route is active" is determined the
// same way in both places.
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-border bg-surface md:hidden"
    >
      {links.map((link) => (
        <NavLink
          key={link.to}
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
      ))}
    </nav>
  );
}
