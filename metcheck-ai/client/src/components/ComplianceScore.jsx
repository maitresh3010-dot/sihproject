export default function ComplianceScore({ score, detail }) {
  const c = score >= 85 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)";
  const r = 52, circ = 2 * Math.PI * r;
  return (
    <div className="row">
      <svg className="score-ring" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={c} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (circ * (score || 0)) / 100} transform="rotate(-90 60 60)" />
        <text x="60" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)">{score}%</text>
      </svg>
      <div><strong>Compliance Score</strong>
        {detail
          ? <p className="muted" style={{ margin: 4 }}>Applicable checks: {detail.applicable} · Passed: {detail.passed} · Potential violations: {detail.failed}</p>
          : <p className="muted" style={{ margin: 4 }}>Share of required checks passed.</p>}
      </div>
    </div>
  );
}
