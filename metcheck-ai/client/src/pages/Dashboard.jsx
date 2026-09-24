import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { EmptyState } from "../components/ui";
import { reportService } from "../services/reportService";
import { fmtDate, shortId, declVal } from "../utils/formatters";

function TrendChart({ trend = [] }) {
  const W = 560, H = 180, P = 28;
  const max = Math.max(1, ...trend.map((t) => t.total));
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, trend.length - 1);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const line = (k) => trend.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t[k]).toFixed(1)}`).join(" ");
  if (!trend.length) return <p className="muted">No data yet.</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Compliance trend">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" />
      ))}
      <path d={`${line("total")} L${x(trend.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`} fill="#dbeafe" />
      <path d={line("total")} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
      <path d={line("violations")} fill="none" stroke="var(--danger)" strokeWidth="2" strokeDasharray="5 3" />
      {trend.map((t, i) => <circle key={i} cx={x(i)} cy={y(t.total)} r="3" fill="var(--primary)"><title>{`${t.date}: ${t.total} inspections, ${t.compliant} compliant`}</title></circle>)}
      <text x={P} y={H - 8} fontSize="10" fill="var(--muted)">{trend[0]?.date}</text>
      <text x={W - P} y={H - 8} fontSize="10" fill="var(--muted)" textAnchor="end">{trend[trend.length - 1]?.date}</text>
    </svg>
  );
}

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { reportService.summary().then(setS).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="card"><span className="badge bad">{err}</span></div>;
  if (!s) return <div className="card">Loading dashboard…</div>;
  const maxDist = Math.max(1, ...(s.distribution || []).map((d) => d.count));

  return (
    <div className="grid">
      <div>
        <h2 style={{ margin: 0 }}>LegalMet AI</h2>
        <p className="muted" style={{ margin: "4px 0 0" }}>Legal Metrology Compliance Platform</p>
      </div>

      <div className="grid stats">
        <StatCard label="Total Inspections" value={s.total} tone="violet" />
        <StatCard label="Compliant" value={s.compliant} tone="teal" />
        <StatCard label="Potential Violations" value={s.potentialViolation} tone="rose" />
        <StatCard label="Manual Review" value={s.manualReview} tone="amber" />
      </div>

      <div className="grid two">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Compliance trend</h3>
          <p className="muted" style={{ fontSize: 12 }}>Inspections per day, last 14 days (red dashed = potential violations).</p>
          <TrendChart trend={s.trend} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Violation distribution</h3>
          {(s.distribution || []).map((d) => (
            <div key={d.label} className="dist-row">
              <span className="dist-lbl">{d.label}</span>
              <div className="dist-bar"><div className="dist-fill" style={{ width: `${(100 * d.count) / maxDist}%` }} /></div>
              <span className="dist-n">{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row"><h3 style={{ margin: 0 }}>Recent inspections</h3><div style={{ flex: 1 }} /><Link to="/scan" className="btn">+ Scan a product</Link></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Inspection ID</th><th>Product</th><th>Category</th><th>Date</th><th>Score</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{(s.recent || []).map((r) => (
            <tr key={r.id}>
              <td>{shortId(r.id)}</td>
              <td>{declVal(r.declarations, "productName", "product_name")}</td>
              <td>{r.categoryLabel || r.category || "—"}</td>
              <td>{fmtDate(r.createdAt)}</td>
              <td>{r.score}%</td>
              <td><StatusBadge value={r.verdict} /></td>
              <td><Link to={`/scan/${r.id}`}>View Inspection</Link></td>
            </tr>
          ))}
          {!s.recent?.length && <tr><td colSpan={7} className="muted">No inspections yet.</td></tr>}</tbody>
        </table></div>
      </div>
      {!s.total && (
        <EmptyState title="No inspections found" body="Start your first product inspection to see results here." actionLabel="Scan Product" to="/scan" />
      )}
      <div className="disclaimer">LegalMet AI provides AI-assisted screening. Results are advisory (Compliant / Potential Violation / Manual Review Required / Unable to Verify) and not legally binding.</div>
    </div>
  );
}
