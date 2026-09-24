import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, PasswordInput } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await login(email, password); nav("/"); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card login-card" onSubmit={submit}>
        <h1 className="login-title">LEGALMET AI</h1>
        <p className="login-tag">Welcome back — sign in to scan products and review compliance.</p>
        {err && <Alert tone="bad" title="Couldn't sign you in">{err} Double-check your email and password, then try again.</Alert>}
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@department.gov" />
        <label className="lbl" htmlFor="password">Password</label>
        <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Your password" />
        <button className="btn login-btn" disabled={busy}>{busy ? "Signing you in…" : "Sign in"}</button>
        <p style={{ textAlign: "center", marginBottom: 0 }}>
          <button type="button" className="link-btn" onClick={() => setForgot(!forgot)}>Forgot password?</button>
        </p>
        {forgot && <p className="muted" style={{ textAlign: "center", fontSize: 13 }}>Contact your administrator to reset your password.</p>}
        <p className="muted" style={{ textAlign: "center", fontSize: 13 }}>New here? <Link to="/register">Create an account</Link></p>
      </form>
    </div>
  );
}
