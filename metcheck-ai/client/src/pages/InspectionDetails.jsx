import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import StatusBadge from "../components/StatusBadge";
import ComplianceScore from "../components/ComplianceScore";
import DeclarationTable from "../components/DeclarationTable";
import ViolationCard from "../components/ViolationCard";
import ProductImage from "../components/ProductImage";
import ReadabilityCard from "../components/ReadabilityCard";
import EcommerceComparison from "../components/EcommerceComparison";
import LoadingScanner from "../components/LoadingScanner";
import { scanService } from "../services/scanService";
import { generateInspectionPdf } from "../services/reportPdf";
import { fmtDate, shortId, declVal } from "../utils/formatters";

export default function InspectionDetails() {
  const { id } = useParams(); const nav = useNavigate();
  const { user } = useAuth();
  const [rec, setRec] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [saved, setSaved] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    scanService.get(id).then((r) => { setRec(r); setRemarks(r.remarks || ""); })
      .catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [id]);
  if (loading) return <LoadingScanner text="Loading inspection…" />;
  if (err) return <div className="card"><span className="badge bad">{err}</span></div>;
  if (!rec) return <div className="card"><span className="badge bad">Inspection not found.</span></div>;

  const canDelete = user && (user.role === "ADMIN" || (user.role === "OFFICER" && rec.officer === user.email));
  const canEdit = canDelete;
  const images = rec.images?.length ? rec.images : rec.image ? [rec.image] : [];
  const product = declVal(rec.declarations, "productName", "product_name");
  const fails = (rec.checks || []).filter((c) => c.status === "fail");
  const reviews = (rec.checks || []).filter((c) => c.status === "review");
  const passes = (rec.checks || []).filter((c) => c.status === "pass");

  const saveRemarks = async () => {
    setSaved("");
    try { const u = await scanService.update(id, { remarks }); setRec(u); setSaved("Remarks saved — included in the PDF report."); }
    catch (e) { setSaved(e.message); }
  };
  const downloadPdf = async () => {
    setPdfBusy(true);
    try { await generateInspectionPdf({ ...rec, remarks }); }
    finally { setPdfBusy(false); }
  };

  return (
    <div className="grid">
      <div className="row no-print"><Link to="/inspections">← Back</Link><div style={{ flex: 1 }} />
        {rec.categoryLabel && <span className="badge info">{rec.categoryLabel}</span>}
        <button className="btn" onClick={downloadPdf} disabled={pdfBusy}>{pdfBusy ? "Preparing PDF…" : "Generate PDF"}</button>
        <button className="btn secondary" onClick={() => window.print()}>Print</button>
        {canDelete && <button className="btn danger" onClick={async () => { if (confirm("Delete inspection?")) { await scanService.remove(id); nav("/inspections"); } }}>Delete</button>}</div>

      <div className="card hero">
        <div>
          <h1 className="hero-title">{product === "—" ? "Unknown product" : product}</h1>
          <div className="row"><StatusBadge value={rec.verdict} />
            {rec.demo && <span className="badge demo-badge">Demo Mode — demonstration data</span>}
            <span className="muted" style={{ fontSize: 13 }}>
              Inspection ID {shortId(rec.id)} · Officer {rec.officer} · {fmtDate(rec.createdAt)}
              {rec.location ? ` · ${rec.location}` : ""}
            </span></div>
        </div>
        <ComplianceScore score={rec.score} detail={rec.scoreDetail} />
      </div>

      <div className="grid two">
        <div className="card"><h3 style={{ marginTop: 0 }}>Inspection details</h3>
          <div className="tbl-wrap"><table className="tbl"><tbody>
            <tr><td>Inspection ID</td><td>{rec.id}</td></tr>
            <tr><td>Product</td><td>{product}</td></tr>
            <tr><td>Officer</td><td>{rec.officerName || rec.officer} ({rec.officer})</td></tr>
            <tr><td>Date</td><td>{fmtDate(rec.createdAt)}</td></tr>
            <tr><td>Location</td><td>{rec.location || "—"}</td></tr>
          </tbody></table></div></div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Officer remarks (editable — included in PDF)</h3>
          <textarea className="input" rows={5} value={remarks} disabled={!canEdit}
            onChange={(e) => setRemarks(e.target.value)} placeholder="Add verification notes…" />
          {canEdit && <div className="row" style={{ marginTop: 8 }}><button className="btn secondary" onClick={saveRemarks}>Save Changes</button>
            {saved && <span className="muted" style={{ fontSize: 13 }}>{saved}</span>}</div>}
        </div>
      </div>

      <div className="card"><h3 style={{ marginTop: 0 }}>Extracted declarations</h3><DeclarationTable declarations={rec.declarations} /></div>

      <div>
        <h3>Rules checked ({(rec.checks || []).length}) · Passed ({passes.length}) · Potential violations ({fails.length}) · Manual review ({reviews.length})</h3>
        {!!fails.length && <><h4>Potential violations</h4><div className="grid two">{fails.map((c) => (
          <ViolationCard key={c.ruleId || c.rule_id} check={c} evidenceSrc={images[0]} evidenceLabel="Back-label image" />))}</div></>}
        {!!reviews.length && <><h4>Manual review items</h4><div className="grid two">{reviews.map((c) => (
          <ViolationCard key={c.ruleId || c.rule_id} check={c} evidenceSrc={images[0]} evidenceLabel="Back-label image" />))}</div></>}
        <details><summary style={{ cursor: "pointer" }}>Passed checks ({passes.length})</summary>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Rule</th><th>Detected value</th></tr></thead>
            <tbody>{passes.map((c) => <tr key={c.ruleId || c.rule_id}><td>{c.name || c.label} ({c.ruleId || c.rule_id})</td>
              <td>{Array.isArray(c.value) ? c.value.join("; ") : c.value || "—"}</td></tr>)}</tbody></table></div></details>
        <div className="disclaimer">Advisory screening results only — not a legal determination.</div>
      </div>

      <div className="grid two">
        <div className="card"><h3 style={{ marginTop: 0 }}>Evidence Images</h3>
          {images.map((src, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <ProductImage src={src} words={i === 0 ? rec.ocr_words : []} dims={i === 0 ? rec.ocr_image : null} declarations={rec.declarations} />
            </div>
          ))}
          {!images.length && <p className="muted">No images.</p>}
        </div>
        <ReadabilityCard readability={rec.readability} />
      </div>

      {rec.comparison && <EcommerceComparison comparison={rec.comparison} />}
      <div className="disclaimer">{rec.note}</div>
    </div>
  );
}
