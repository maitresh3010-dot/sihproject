const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

async function analyzeViaAI(buffer, filename, category = "general") {
  try {
    const form = new FormData();
    form.append("file", new Blob([buffer]), filename || "package.jpg");
    form.append("category", category || "general");
    const ctrl = new AbortController();
    // Python OCR needs headroom for large phone photos (multi-pass Tesseract).
    // Keep in sync with the AI-service OCR deadline (~55s) + preprocess margin.
    const t = setTimeout(() => ctrl.abort(), 70000);
    const res = await fetch(`${AI_URL}/analyze`, { method: "POST", body: form, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`AI service ${res.status}`);
    return await res.json();
  } catch (e) {
    return null; // caller falls back to local engine
  }
}

module.exports = { analyzeViaAI };
