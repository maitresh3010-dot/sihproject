import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, PasswordInput } from "../components/ui";
export default function Register() {
  const { register } = useAuth(); const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "OFFICER" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); setErr(""); try { await register(form); nav("/"); } catch (ex) { setErr(ex.message); } };
  return <div className="auth-wrap"><form className="card auth-card" onSubmit={submit}>
    <h2 style={{ margin: 0 }}>Join LegalMet AI</h2><p className="muted">Create your account in under a minute — officers scan products, viewers explore results.</p>
    {err && <Alert tone="bad" title="Couldn't create your account">{err} Check the details below and try again.</Alert>}
    <label className="lbl">Your name</label><input className="input" value={form.name} onChange={set("name")} required placeholder="e.g. Priya Sharma" />
    <label className="lbl">Email</label><input className="input" type="email" value={form.email} onChange={set("email")} required placeholder="you@department.gov" />
    <label className="lbl">Choose a password</label><PasswordInput value={form.password} onChange={set("password")} required placeholder="At least 8 characters is safest" />
    <label className="lbl">I am joining as</label><select className="input" value={form.role} onChange={set("role")}><option value="OFFICER">Enforcement officer — scan & inspect</option><option value="VIEWER">Viewer — browse results only</option><option value="ADMIN">Admin — manage users & rules</option></select>
    <div style={{ marginTop: 14 }}><button className="btn" style={{ width: "100%" }}>Create my account</button></div>
    <p className="muted" style={{ textAlign: "center" }}>Already have an account? <Link to="/login">Sign in</Link></p>
  </form></div>;
}
