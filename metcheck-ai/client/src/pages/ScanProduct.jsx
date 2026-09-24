import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createWorker } from "tesseract.js";
import UploadBox from "../components/UploadBox";
import { Alert, HelpTip, PageHeader } from "../components/ui";
import { scanService } from "../services/scanService";
import { STAGES, runComplianceScan } from "../services/scanPipeline";
import { DEMO_PRODUCTS, renderDemoLabelImage } from "../services/demoData";

const FALLBACK_CATEGORIES = [
  { id: "general", label: "Other" },
  { id: "food", label: "Food" },
  { id: "cosmetics", label: "Cosmetics" },
  { id: "household", label: "Household Goods" },
  { id: "electrical", label: "Electrical Products" },
];

const STEPS = [
  { label: "Add photos", hint: "Upload a clear photo of the declaration panel" },
  { label: "Describe product", hint: "Pick a category so the right checks run" },
  { label: "Review & scan", hint: "Confirm details, then start the scan" },
];

export default function ScanProduct() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState([]);
  const [manualText, setManualText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [category, setCategory] = useState("general");
  const [listing, setListing] = useState({ productName: "", mrp: "", netQuantity: "", manufacturer: "", otherInfo: "" });
  const [showListing, setShowListing] = useState(false);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanStages, setScanStages] = useState({});
  const [err, setErr] = useState("");
  const [demoId, setDemoId] = useState(null);
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => { scanService.categories().then(setCategories).catch(() => {}); }, []);

  const runBrowserOcr = async () => {
    if (!files.length) { setErr("Please add a photo first — the auto-reader needs an image to read from."); return; }
    setOcrBusy(true); setErr("");
    try {
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(files[0]);
      await worker.terminate();
      setManualText(data.text || "");
    } catch (e) { setErr(`The auto-reader couldn't read this photo (${e.message}). No problem — just type or paste the package text yourself.`); }
    setOcrBusy(false);
  };

  const next = () => {
    setErr("");
    if (step === 0 && !files.length && !manualText.trim()) { setErr("We need something to check — please add at least one package photo, or type the package text in the box below."); return; }
    setStep(step + 1);
  };

  const submit = async () => {
    setBusy(true); setErr(""); setScanStages({});
    try {
      const { rec } = await runComplianceScan({
        files, manualText, category,
        listing: showListing ? listing : null,
        location: location.trim() || null,
        demo: !!demoId,
        onStage: (id, state, detail, progress) =>
          setScanStages((prev) => ({ ...prev, [id]: { state, detail, progress } })),
      });
      nav(`/scan/${rec.id}`, { state: rec });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const loadDemo = async (demo) => {
    setDemoBusy(true); setErr("");
    try {
      const img = await renderDemoLabelImage(demo);
      setFiles([img]); setManualText(demo.labelText); setCategory(demo.category); setDemoId(demo.id);
    } catch (e) { setErr(`Could not prepare demo: ${e.message}`); }
    setDemoBusy(false);
  };
  const doneCount = STAGES.filter((s) => ["done", "warn"].includes(scanStages[s.id]?.state)).length;

  return (
    <div className="grid">
      <PageHeader title="Scan a product" subtitle="Three quick steps — photos, a few details, then your compliance result. Takes about a minute." />
      <div className="steps no-print">
        {STEPS.map((s, i) => (
          <div key={s.label} className={`step${i === step ? " active" : ""}${i < step ? " done" : ""}`} title={s.hint}>
            <span className="step-n">{i < step ? "✓" : i + 1}</span>
            <span>{s.label}<small className="muted" style={{ display: "block", fontWeight: 400, fontSize: 11 }}>{s.hint}</small></span>
          </div>
        ))}
      </div>
      {err && <Alert tone="bad" title="Something needs your attention">{err} Please fix it and try again.</Alert>}

      {step === 0 && (
        <div className="card">
          <div className="row"><h3 style={{ margin: 0 }}>1. Add package photos</h3><div style={{ flex: 1 }} />
            {demoId && <span className="badge demo-badge">Demo Mode — demonstration data</span>}</div>
          <p className="muted" style={{ margin: "6px 0 12px" }}>Photograph the side of the pack that lists MRP, net quantity and manufacturer details.</p>
          <UploadBox files={files} onFiles={(f) => { setFiles(f); setDemoId(null); }} />
          <HelpTip title="Tips for a clear photo">
            <ul>
              <li>Fill the frame with the declaration panel — the closer, the better.</li>
              <li>Hold the phone straight and steady, in good light; avoid glare and shadows.</li>
              <li>If text looks small or blurry, move closer and retake rather than zooming.</li>
            </ul>
          </HelpTip>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn secondary" onClick={runBrowserOcr} disabled={!files.length || ocrBusy}>
              {ocrBusy ? "Reading text…" : "Auto-read text from photo"}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>Reads the text on your device so you can check it below.</span>
          </div>
          <label className="lbl">Package text <span className="muted" style={{ fontWeight: 400 }}>(check it — the result is only as good as this text)</span></label>
          <textarea className="input" rows={7} value={manualText} onChange={(e) => setManualText(e.target.value)}
            placeholder="The text from your photo appears here. You can also type or paste the MRP, net quantity, manufacturer name and other declarations manually…" />
          <div className="row" style={{ marginTop: 14 }}>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={next}>Continue to category →</button>
          </div>
        </div>
      )}

      {step === 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Demo Mode — sample products for presentation</h3>
          <p className="muted">No camera or AI service needed. The sample input is simulated, but extraction, rules and scoring run for real. Results are always labeled as demonstration data.</p>
          <div className="demo-grid">
            {DEMO_PRODUCTS.map((d) => (
              <button key={d.id} className={`card demo-card${demoId === d.id ? " selected" : ""}`} disabled={demoBusy} onClick={() => loadDemo(d)}>
                <strong>{d.name}</strong>
                <p className="muted" style={{ fontSize: 12 }}>{d.expected}</p>
                <span className="badge demo-badge">{demoId === d.id ? "Loaded ✓" : demoBusy ? "Loading…" : "Load demo"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>2. Describe your product</h3>
          <p className="muted" style={{ marginTop: 0 }}>This picks which compliance checks run. Not sure? “Other” works for everything.</p>
          <label className="lbl">Product category</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <label className="lbl">Where was this inspected? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Market yard, Pune" />
          <label className="row" style={{ fontSize: 14, marginTop: 12 }}>
            <input type="checkbox" checked={showListing} onChange={(e) => setShowListing(e.target.checked)} />
            Also compare with the online listing <span className="muted">(optional — for e-commerce checks)</span>
          </label>
          {showListing && (
            <div className="grid form-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
              {[["productName", "Online product name"], ["mrp", "Online MRP"], ["netQuantity", "Online quantity"], ["manufacturer", "Online manufacturer"]].map(([k, l]) => (
                <div key={k}><label className="lbl">{l}</label><input className="input" value={listing[k]} onChange={(e) => setListing({ ...listing, [k]: e.target.value })} /></div>
              ))}
              <div style={{ gridColumn: "1 / -1" }}><label className="lbl">Other information (informational only)</label>
                <input className="input" value={listing.otherInfo} onChange={(e) => setListing({ ...listing, otherInfo: e.target.value })} placeholder="e.g. seller name, URL notes" /></div>
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn secondary" onClick={() => setStep(0)}>← Back</button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={next}>Continue to review →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{busy ? "Analyzing your product…" : "3. Ready when you are"}</h3>
          {!busy && <p className="muted" style={{ marginTop: 0 }}>Look over the summary below, then start the scan. It usually takes under a minute for a clear photo.</p>}
          <div className="chips">
            <span className="chip">{files.length} photo{files.length === 1 ? "" : "s"}</span>
            <span className="chip teal">{categories.find((c) => c.id === category)?.label}</span>
            {location.trim() && <span className="chip amber">{location.trim()}</span>}
            {(manualText.trim() || files.length > 0) && <span className="chip">{manualText.trim() ? `${manualText.trim().length} characters of text` : "Text will be read from photo"}</span>}
          </div>
          {!busy ? (
            <div className="row">
              <button className="btn secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn" onClick={submit}>Start Compliance Scan</button>
            </div>
          ) : (
            <div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${(100 * doneCount) / STAGES.length}%` }} /></div>
              <div className="scan-steps">
                {STAGES.map((s) => {
                  const st = scanStages[s.id]?.state || "pending";
                  const detail = scanStages[s.id]?.detail;
                  const prog = scanStages[s.id]?.progress;
                  const icon = st === "done" ? "✓" : st === "warn" ? "⚠" : st === "active" ? "●" : "○";
                  return (
                    <div key={s.id} className={`srow ${st}`}>
                      <span className="sdot">{icon}</span>
                      <div style={{ flex: 1 }}>
                        {s.label}
                        {typeof detail === "string" && detail && <div className="sdetail">{detail}</div>}
                        {Array.isArray(detail) && detail.map((q, i) => q.warnings?.map((w, j) => (
                          <div key={`${i}-${j}`} className="sdetail warn">⚠ {q.file}: {w}</div>
                        )))}
                        {st === "active" && typeof prog === "number" && (
                          <div className="progress-track slim"><div className="progress-fill" style={{ width: `${Math.round(prog * 100)}%` }} /></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="disclaimer" style={{ marginTop: 12 }}>Results are AI-assisted and advisory only — not a legally binding determination.</div>
        </div>
      )}
    </div>
  );
}
