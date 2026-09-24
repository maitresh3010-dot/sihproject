export default function LoadingScanner({ text }) {
  return <div className="card"><p><strong>{text || "Scanning package…"}</strong></p><div className="scanline" /><p className="muted">Running OCR and rule checks.</p></div>;
}
