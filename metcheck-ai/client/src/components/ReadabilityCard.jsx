const STATUS_CLS = { READABLE: "ok", POTENTIAL_ISSUE: "warn", MANUAL_REVIEW: "bad", UNABLE: "info" };

export default function ReadabilityCard({ readability }) {
  if (!readability) {
    return (
      <div className="card"><h3 style={{ marginTop: 0 }}>Readability</h3>
        <p><span className="badge">Unable to determine</span></p>
        <p className="muted" style={{ fontSize: 13 }}>No readability measurements available for this inspection.</p></div>
    );
  }
  const m = readability.metrics || {};
  return (
    <div className="card"><h3 style={{ marginTop: 0 }}>Readability</h3>
      <p><span className={`badge ${STATUS_CLS[readability.status] || "info"}`}>{readability.label || readability.status}</span></p>
      <div className="tbl-wrap"><table className="tbl"><tbody>
        <tr><td>OCR confidence</td><td>{m.ocr_confidence != null ? `${Math.round(m.ocr_confidence * 100)}%` : "—"}</td></tr>
        <tr><td>Median character height</td><td>{m.median_char_height_px ? `${m.median_char_height_px} px` : "—"}</td></tr>
        <tr><td>Image resolution</td><td>{m.resolution ? `${m.resolution.width}×${m.resolution.height} px` : "—"}</td></tr>
        <tr><td>Blur (focus score)</td><td>{m.blur_score ?? "—"}</td></tr>
        <tr><td>Contrast</td><td>{m.contrast ?? "—"}</td></tr>
      </tbody></table></div>
      {(readability.issues || []).map((iss, i) => <p key={i} className="muted" style={{ fontSize: 13 }}>• {iss}</p>)}
      {readability.fontSize && <div className="disclaimer">{readability.fontSize.note}</div>}
    </div>
  );
}
