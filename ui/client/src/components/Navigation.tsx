import { NavLink } from "react-router-dom";
import "./Navigation.css";

const navItems = [
  { to: "/home", label: "Home" },
  { to: "/authorities", label: "Authorities" },
  { to: "/audit-log", label: "Audit Log" },
  { to: "/coverage-map", label: "Coverage Map" },
  { to: "/settings", label: "Settings" },
];

export function Navigation() {
  return (
    <nav className="nav">
      <div className="nav-brand">Open Authority</div>
      <ul className="nav-links">
        {navItems.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
