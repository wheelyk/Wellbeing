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
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <nav className="flex gap-4">
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
        <div className="flex items-center gap-3">
          {user && <span className="text-sm text-text-muted">{user.displayName}</span>}
          <Button variant="secondary" onClick={() => logout()}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
