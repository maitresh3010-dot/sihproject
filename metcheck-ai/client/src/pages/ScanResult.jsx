import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import ComplianceScore from "../components/ComplianceScore";
import DeclarationTable from "../components/DeclarationTable";
import ViolationCard from "../components/ViolationCard";
import ProductImage from "../components/ProductImage";
import ReadabilityCard from "../components/ReadabilityCard";
import EcommerceComparison from "../components/EcommerceComparison";
import LoadingScanner from "../components/LoadingScanner";
import { Alert } from "../components/ui";
import { scanService } from "../services/scanService";
import { generateInspectionPdf } from "../services/reportPdf";
import { fmtDate, declVal } from "../utils/formatters";

export default function ScanResult() {
  const { id } = useParams();
  const loc = useLocation();
  const [rec, setRec] = useState(loc.state || null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (!rec && id) scanService.get(id).then(setRec).catch((e) => setErr(e.message)); }, [id]); // eslint-disable-line
  if (err) return <div className="card"><span className="badge bad">{err}</span></div>;
  if (!rec) return <LoadingScanner text="Loading result…" />;
  const images = rec.images?.length ? rec.images : rec.image ? [rec.image] : [];
  const product = declVal(rec.declarations, "productName", "product_name");
  const issues = (rec.checks || []).filter((c) => c.status !== "pass");
  // Plain-language verdict guide (display only — the verdict itself is unchanged).
  const VERDICT_GUIDE = {
    "Compliant": { tone: "ok", title: "All good — no issues found", next: "Every required declaration was detected and passed. You can save or share the report — no further action needed." },
    "Potential Violation": { tone: "bad", title: "Needs attention — possible violation", next: "One or more required declarations failed or are missing. Review each issue card below against the physical pack, then record your decision." },
    "Manual Review Required": { tone: "warn", title: "Please double-check — a human look is needed", next: "Some items couldn't be decided automatically (often small or unclear text). Verify them on the pack yourself before deciding." },
    "Unable to Verify": { tone: "info", title: "We couldn't verify this product", next: "No usable text was detected. Retake the photo closer, steadier and glare-free — or type the declarations in manually — and scan again." },
  };
  const guide = VERDICT_GUIDE[rec.verdict];
  return (
    <div className="grid">
      <div className="row no-print">
        <Link to="/inspections">← All inspections</Link>
        <div style={{ flex: 1 }} />
        {rec.categoryLabel && <span className="badge info">{rec.categoryLabel}</span>}
        <button className="btn" disabled={pdfBusy} onClick={async () => { setPdfBusy(true); try { await generateInspectionPdf(rec); } finally { setPdfBusy(false); } }}>
          {pdfBusy ? "Preparing PDF…" : "Generate PDF"}</button>
        <button className="btn secondary" onClick={() => window.print()}>Generate report</button>
      </div>

      {/* Top section */}
      <div className="card hero">
        <div>
          <h1 className="hero-title">{product === "—" ? "Unknown product" : product}</h1>
          <div className="row"><StatusBadge value={rec.verdict} />
            {rec.demo && <span className="badge demo-badge">Demo Mode — demonstration data</span>}
            <span className="muted" style={{ fontSize: 13 }}>Inspection {rec.id} · Saved {fmtDate(rec.createdAt)}</span></div>
        </div>
        <ComplianceScore score={rec.score} detail={rec.scoreDetail} />
      </div>
      <div className="print-head">
        <h2 style={{ margin: 0 }}>LegalMet AI — Inspection report</h2>
        <p className="muted">{product} · {rec.verdict} ({rec.score}%) · {fmtDate(rec.createdAt)} · Officer {rec.officerName || rec.officer}</p>
      </div>

      {guide && <Alert tone={guide.tone} title={`${guide.title} (score ${rec.score}%)`}>{guide.next}</Alert>}

      <div className="card"><h3 style={{ marginTop: 0 }}>Declarations</h3><DeclarationTable declarations={rec.declarations} /></div>

      {(rec.warning || rec.legible === false) && (
        <div className="card" style={{ borderLeft: "4px solid var(--warning)" }}>
          <strong>Photo unclear — result may be incomplete.</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {rec.warning || "Text detected but unreadable (fragments only)."} For a reliable scan, retake the photo
            straight-on, fill the frame with the declaration panel, hold steady and avoid glare.
          </p>
        </div>
      )}

      <div>
        <h3>Violations &amp; manual review ({issues.length})</h3>
        {!issues.length && <div className="card"><span className="badge ok">No issues — all checks passed.</span></div>}
        <div className="grid two">{issues.map((c) => (
          <ViolationCard key={c.ruleId || c.rule_id} check={c} evidenceSrc={images[0]} evidenceLabel="Back-label image" />
        ))}</div>
        <div className="disclaimer">Advisory screening results only — not a legal determination.</div>
      </div>

      <div className="grid two">
        <div className="card"><h3 style={{ marginTop: 0 }}>Product Image</h3>
          {images.map((src, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {images.length > 1 && <p className="muted">Image {i + 1}</p>}
              <ProductImage src={src} words={i === 0 ? rec.ocr_words : []} dims={i === 0 ? rec.ocr_image : null} declarations={rec.declarations} />
            </div>
          ))}
          {rec.ocr_text && <details><summary style={{ cursor: "pointer", fontSize: 14 }}>OCR text</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "var(--background)", padding: 10, borderRadius: 8 }}>{rec.ocr_text}</pre></details>}
          {(rec.quality || []).flatMap((q) => q.warnings || []).map((w, i) => (
            <p key={i} style={{ margin: "4px 0" }}><span className="badge warn">Image quality: {w}</span></p>
          ))}
        </div>
        <ReadabilityCard readability={rec.readability} />
      </div>

      {rec.comparison && <EcommerceComparison comparison={rec.comparison} />}
    </div>
  );
}
