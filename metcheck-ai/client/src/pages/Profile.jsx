import { useAuth } from "../context/AuthContext";
export default function Profile() {
  const { user } = useAuth();
  return <div className="grid"><h2 style={{ margin: 0 }}>Profile</h2>
    <div className="card"><p><strong>Name:</strong> {user?.name}</p><p><strong>Email:</strong> {user?.email}</p><p><strong>Role:</strong> {user?.role}</p></div></div>;
}
