import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && roles.length && !roles.map((r) => r.toUpperCase()).includes(String(user.role).toUpperCase())) {
    return (
      <div className="card">
        <h2>Not authorized</h2>
        <p className="muted">Your role ({user.role}) does not have permission to access this page.</p>
      </div>
    );
  }
  return children;
}
