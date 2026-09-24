import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/", label: "Dashboard", roles: ["ADMIN", "OFFICER", "VIEWER"], color: "#7c3aed" },
  { to: "/scan", label: "Scan Product", roles: ["ADMIN", "OFFICER"], color: "#0ea5e9" },
  { to: "/inspections", label: "Inspections", roles: ["ADMIN", "OFFICER", "VIEWER"], color: "#0d9488" },
  { to: "/products", label: "Products", roles: ["ADMIN", "OFFICER", "VIEWER"], color: "#f59e0b" },
  { to: "/reports", label: "Reports", roles: ["ADMIN", "OFFICER", "VIEWER"], color: "#f43f5e" },
  { to: "/rules", label: "Rules", roles: ["ADMIN"], color: "#6366f1" },
  { to: "/users", label: "Users", roles: ["ADMIN"], color: "#14b8a6" },
  { to: "/profile", label: "Profile", roles: ["ADMIN", "OFFICER", "VIEWER"], color: "#a855f7" },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const role = String(user?.role || "").toUpperCase();
  const out = () => { logout(); nav("/login"); onClose && onClose(); };
  return (
    <nav className={`sidebar${open ? " open" : ""}`}>
      {LINKS.filter((l) => l.roles.includes(role)).map((l) => (
        <NavLink key={l.to} to={l.to} end={l.to === "/"} onClick={onClose}><span className="dot" style={{ "--dot": l.color }} aria-hidden="true" />{l.label}</NavLink>
      ))}
      <button className="btn secondary" style={{ marginTop: 8 }} onClick={out}>Logout</button>
      <div className="disclaimer" style={{ marginTop: "auto" }}>AI-assisted screening only. Not legally binding.</div>
    </nav>
  );
}
