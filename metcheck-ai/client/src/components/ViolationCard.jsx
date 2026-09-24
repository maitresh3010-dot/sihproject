import { API_BASE } from "../services/api";

export function confidenceBand(conf) {
  if (conf == null) return "—";
  if (conf >= 0.85) return "High";
  if (conf >= 0.6) return "Medium";
  return "Low";
}

const ACTIONS = {
  fail: "Manual verification recommended.",
  low_confidence: "Low-confidence detection — confirm visually against the package.",
  review: "Officer review recommended — confirm visually against the package.",
};

// Advisory issue card only — never states a legal conclusion.
export default function ViolationCard({ check, evidenceSrc, evidenceLabel }) {
  const isFail = check.status === "fail";
  const title = isFail ? "Potential Violation" : "Manual Review";
  const cls = isFail ? "bad" : "warn";
  const detected = check.value != null && check.value !== "";
  const note = check.note === "low_confidence" ? ACTIONS.low_confidence : ACTIONS[isFail ? "fail" : "review"];
  const url = evidenceSrc
    ? (evidenceSrc.startsWith("http") || evidenceSrc.startsWith("blob:") || evidenceSrc.startsWith("data:") ? evidenceSrc : `${API_BASE}${evidenceSrc}`)
    : null;
  return (
    <div className="card issue">
      <div className="row"><span className={`badge ${cls}`}>{title}</span></div>
      <h4 className="issue-title">{check.name || check.label}</h4>
      <dl className="issue-dl">
        <div><dt>Rule:</dt><dd>{check.ruleId || check.rule_id || "—"}</dd></div>
        <div><dt>Status:</dt><dd>{detected ? `Detected${check.note === "low_confidence" ? " (low confidence)" : ""}` : "Not detected"}</dd></div>
        <div><dt>Confidence:</dt><dd>{detected && check.confidence != null ? confidenceBand(check.confidence) : "—"}</dd></div>
        <div><dt>Evidence:</dt><dd>{url ? <span className="ev">{evidenceLabel || "Package image"} <img src={url} alt="Evidence thumbnail" /></span> : (evidenceLabel || "Package image")}</dd></div>
        <div><dt>Recommended Action:</dt><dd>{note}</dd></div>
      </dl>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Advisory screening result — not a legal determination.</p>
    </div>
  );
}
