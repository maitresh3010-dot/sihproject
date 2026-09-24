import { useAuth } from "../context/AuthContext";
export default function Navbar({ onMenu }) {
  const { user } = useAuth();
  const initial = String(user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <header className="topbar">
      <button className="btn secondary menu-btn" onClick={onMenu} aria-label="Menu">☰</button>
      <div className="brand">LegalMet AI<small>Legal Metrology Compliance Platform</small></div>
      <div className="spacer" />
      {user && (
        <span className="row" style={{ gap: 8 }}>
          <span className="avatar" aria-hidden="true">{initial}</span>
          <span className="muted" style={{ fontSize: 13 }}>{user.name}</span>
          <span className="role-pill">{user.role}</span>
        </span>
      )}
    </header>
  );
}
