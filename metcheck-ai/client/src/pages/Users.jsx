import { useEffect, useState } from "react";
import LoadingScanner from "../components/LoadingScanner";
import { userService } from "../services/userService";

export default function Users() {
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "OFFICER" });
  const [busy, setBusy] = useState(false);
  const load = () => userService.list().then(setUsers).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const create = async (e) => {
    e.preventDefault(); setMsg(""); setBusy(true);
    try {
      await userService.create(form);
      setForm({ name: "", email: "", password: "", role: "OFFICER" });
      setMsg("User created."); load();
    } catch (ex) { setMsg(ex.message); }
    setBusy(false);
  };
  const changeRole = async (id, role) => {
    setMsg("");
    try { await userService.setRole(id, role); load(); }
    catch (e) { setMsg(e.message); }
  };
  const toggleActive = async (u) => {
    setMsg("");
    try { await userService.setActive(u.id, !(u.active !== false)); load(); }
    catch (e) { setMsg(e.message); }
  };
  const remove = async (id) => {
    if (!confirm("Delete this user?")) return;
    try { await userService.remove(id); load(); }
    catch (e) { setMsg(e.message); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid">
      <h2 style={{ margin: 0 }}>Manage users</h2>
      {msg && <div><span className="badge info">{msg}</span></div>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Create user</h3>
        <form onSubmit={create} className="grid form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div><label className="lbl">Name</label><input className="input" value={form.name} onChange={set("name")} required /></div>
          <div><label className="lbl">Email</label><input className="input" type="email" value={form.email} onChange={set("email")} required /></div>
          <div><label className="lbl">Password</label><input className="input" type="password" value={form.password} onChange={set("password")} required /></div>
          <div><label className="lbl">Role</label>
            <select className="input" value={form.role} onChange={set("role")}>
              <option value="ADMIN">ADMIN</option><option value="OFFICER">OFFICER</option><option value="VIEWER">VIEWER</option>
            </select></div>
          <div><button className="btn" style={{ marginTop: 26 }}>{busy ? "Creating…" : "Create User"}</button></div>
        </form>
      </div>
      {!users && !msg && <LoadingScanner text="Loading users…" />}
      {users && (
      <div className="card"><div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>{users.map((u) => (
          <tr key={u.id}>
            <td>{u.name}</td><td>{u.email}</td>
            <td>
              <select className="input" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                <option value="ADMIN">ADMIN</option><option value="OFFICER">OFFICER</option><option value="VIEWER">VIEWER</option>
              </select>
            </td>
            <td>{u.active !== false ? <span className="badge ok">Active</span> : <span className="badge">Inactive</span>}</td>
            <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
            <td><div className="row">
              <button className="link-btn" onClick={() => toggleActive(u)}>{u.active !== false ? "Deactivate" : "Activate"}</button>
              <button className="link-btn" onClick={() => remove(u.id)}>Delete</button>
            </div></td>
          </tr>
        ))}
        {!users.length && <tr><td colSpan={6} className="muted">No users.</td></tr>}</tbody>
      </table></div></div>
      )}
    </div>
  );
}
