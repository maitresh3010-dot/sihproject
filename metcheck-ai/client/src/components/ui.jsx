import { createContext, useCallback, useContext, useState } from "react";
import { Link } from "react-router-dom";
import LoadingScanner from "./LoadingScanner";
import UploadBox from "./UploadBox";

// Reusable primitives — single source of styling (see index.css).
export function Button({ variant = "primary", ...props }) {
  const cls = variant === "primary" ? "btn" : variant === "danger" ? "btn danger" : "btn secondary";
  return <button className={cls} {...props} />;
}
export function Input(props) { return <input className="input" {...props} />; }
export function Select({ children, ...props }) { return <select className="input" {...props}>{children}</select>; }
export function TextArea(props) { return <textarea className="input" {...props} />; }
export function Badge({ tone = "", children }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Card({ children, className = "" }) { return <div className={`card ${className}`}>{children}</div>; }
export function Modal({ title, onClose, children, actions }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
        {actions && <div className="row" style={{ marginTop: 12 }}>{actions}</div>}
      </div>
    </div>
  );
}
export function Table({ columns, rows, empty = "No records found.", renderRow }) {
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => renderRow(r, i))}
        {!rows.length && <tr><td colSpan={columns.length} className="muted">{empty}</td></tr>}
      </tbody>
    </table></div>
  );
}
export function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <div className="pager" role="navigation" aria-label="Pagination">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</Button>
      {nums.map((n, i) => n === "…" ? <span key={i} className="muted">…</span>
        : <Button key={i} variant={n === page ? "primary" : "secondary"} onClick={() => onPage(n)} aria-current={n === page}>{n}</Button>)}
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next →</Button>
    </div>
  );
}
export function Loader({ text }) { return <LoadingScanner text={text || "Loading…"} />; }
export function ImageUploader(props) {
  // Thin wrapper so all uploads share one component.
  return <UploadBox {...props} />;
}

// --- Toasts ---
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// --- Empty states (§31) ---
export function EmptyState({ title, body, actionLabel, onAction, to }) {
  return (
    <div className="card empty">
      <div className="empty-art" aria-hidden="true"><span /></div>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {to
        ? <Link className="btn" to={to}>{actionLabel}</Link>
        : actionLabel && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

// --- Friendly feedback primitives (display only) ---
// Alert: titled error/info card that tells the user what happened AND what to do.
export function Alert({ tone = "bad", title, children }) {
  return (
    <div className={`alert ${tone}`} role="alert">
      <span className="alert-ic" aria-hidden="true">{tone === "bad" ? "!" : tone === "warn" ? "!" : "i"}</span>
      <div><strong className="alert-title">{title}</strong>{children && <div className="alert-body">{children}</div>}</div>
    </div>
  );
}
// HelpTip: short guidance box for first-time users.
export function HelpTip({ title = "Good to know", children }) {
  return (
    <div className="tip">
      <span className="tip-ic" aria-hidden="true">?</span>
      <div><strong className="tip-title">{title}</strong><div className="tip-body">{children}</div></div>
    </div>
  );
}
// PasswordInput: password field with a show/hide eye-icon toggle.
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pwd-wrap">
      <input className="input" type={show ? "text" : "password"} {...props} />
      <button type="button" className="pwd-toggle pwd-icon" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
// PageHeader: consistent title + plain-language subtitle + optional actions.
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div><h2 className="page-title">{title}</h2>{subtitle && <p className="page-sub">{subtitle}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}
