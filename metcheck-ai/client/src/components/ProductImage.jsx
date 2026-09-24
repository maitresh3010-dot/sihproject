import { useMemo, useState } from "react";
import { API_BASE } from "../services/api";
import { shortDeclLabel } from "./DeclarationTable";

const HIGHLIGHT_FIELDS = ["mrp", "netQuantity", "net_quantity", "manufacturer", "packer", "importer", "productName", "product_name"];

function tokens(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9₹.\s]/gi, " ").split(/\s+/).filter((w) => w.length > 1);
}

// Matches OCR words against detected declaration values -> labeled boxes.
function useHighlights(declarations, words, dims) {
  return useMemo(() => {
    if (!declarations || !words?.length || !dims?.w || !dims?.h) return [];
    const out = [];
    for (const [field, decl] of Object.entries(declarations)) {
      const st = decl?.status || (decl?.present ? "FOUND" : "NOT_FOUND");
      if (st !== "FOUND" || decl.value == null) continue;
      const toks = new Set(tokens(Array.isArray(decl.value) ? decl.value.join(" ") : decl.value));
      if (!toks.size) continue;
      for (const w of words) {
        const clean = String(w.text || "").toLowerCase().replace(/[^a-z0-9₹.]/gi, "");
        if (clean.length > 1 && toks.has(clean) && w.box) {
          out.push({
            field, label: shortDeclLabel(field),
            left: (w.box.x / dims.w) * 100, top: (w.box.y / dims.h) * 100,
            width: Math.max(0.5, (w.box.w / dims.w) * 100), height: Math.max(1, (w.box.h / dims.h) * 100),
          });
        }
      }
    }
    return out.slice(0, 80);
  }, [declarations, words, dims]);
}

export default function ProductImage({ src, words = [], dims = null, declarations = null, label = "Product Image" }) {
  const [tab, setTab] = useState("original");
  const url = src ? (src.startsWith("http") || src.startsWith("blob:") || src.startsWith("data:") ? src : `${API_BASE}${src}`) : null;
  const highlights = useHighlights(declarations, words, dims);
  const canAnnotate = highlights.length > 0;
  if (!url) return <p className="muted">No image.</p>;
  const missing = declarations ? HIGHLIGHT_FIELDS.filter((f) => {
    const d = declarations[f];
    if (!d) return false;
    const st = d.status || (d.present ? "FOUND" : "NOT_FOUND");
    return st !== "FOUND";
  }).map(shortDeclLabel).filter((v, i, a) => a.indexOf(v) === i) : [];

  return (
    <div>
      <div className="row no-print" style={{ marginBottom: 8 }}>
        <div className="tabs">
          <button className={`tab${tab === "original" ? " active" : ""}`} onClick={() => setTab("original")}>Original</button>
          <button className={`tab${tab === "annotated" ? " active" : ""}`} onClick={() => canAnnotate && setTab("annotated")} disabled={!canAnnotate}
            title={canAnnotate ? "Show detected text regions" : "No OCR regions available for this image"}>Annotated</button>
        </div>
      </div>
      <div className="overlay-wrap">
        <img src={url} alt={label} />
        {tab === "annotated" && highlights.map((b, i) => (
          <span key={i} className="hl-box" title={`${b.label}: detected region`}
            style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` }}>
            <em>{b.label}</em>
          </span>
        ))}
      </div>
      {tab === "annotated" && (
        <div className="legend">
          {[...new Set(highlights.map((h) => h.label))].map((l) => <span key={l} className="badge ok">{l}</span>)}
          {missing.map((m) => <span key={m} className="badge bad">{m} — not detected</span>)}
        </div>
      )}
    </div>
  );
}
