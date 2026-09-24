import { createWorker } from "tesseract.js";
import { scanService } from "./scanService";

// Canonical pipeline stages shown in the scanning UI.
export const STAGES = [
  { id: "uploaded", label: "Image uploaded" },
  { id: "quality", label: "Image quality checked" },
  { id: "ocr", label: "Text detected" },
  { id: "extract", label: "Extracting declarations" },
  { id: "rules", label: "Applying compliance rules" },
  { id: "result", label: "Generating result" },
];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Real, fast, client-side quality gate: resolution, brightness and blur estimate.
// Runs in milliseconds — no artificial delay.
// NOTE: blur is measured on a ~320px working copy preserving aspect ratio.
// The old 64x64 squashed thumbnail destroyed edge detail, so even sharp
// photos scored a tiny Laplacian variance and clear images were flagged blurry.
export async function checkImageQuality(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    // Working copy: fit longest side to 320px, keep aspect ratio.
    const LONG = 320;
    const scale = Math.min(1, LONG / Math.max(w, h));
    const S_W = Math.max(2, Math.round(w * scale));
    const S_H = Math.max(2, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = S_W; canvas.height = S_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S_W, S_H);
    const px = ctx.getImageData(0, 0, S_W, S_H).data;
    const gray = new Float32Array(S_W * S_H);
    let sum = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      gray[j] = g; sum += g;
    }
    const avg = sum / gray.length;
    let vSum = 0;
    for (let j = 0; j < gray.length; j++) vSum += (gray[j] - avg) ** 2;
    const contrast = Math.sqrt(vSum / gray.length);
    // Variance of Laplacian (blur estimate) on the working copy.
    let lapMean = 0;
    const vals = [];
    for (let y = 1; y < S_H - 1; y++) {
      for (let x = 1; x < S_W - 1; x++) {
        const c = gray[y * S_W + x];
        const l = gray[(y - 1) * S_W + x] + gray[(y + 1) * S_W + x] + gray[y * S_W + x - 1] + gray[y * S_W + x + 1] - 4 * c;
        vals.push(l); lapMean += l;
      }
    }
    lapMean /= Math.max(1, vals.length);
    let lap = 0;
    for (const v of vals) lap += (v - lapMean) ** 2;
    const blurScore = vals.length ? lap / vals.length : 0;

    const warnings = [];
    if (Math.min(w, h) < 300) warnings.push(`Low resolution (${w}×${h}) — small text may be unreadable.`);
    if (avg < 45) warnings.push("Image looks very dark — declarations may be missed.");
    if (avg > 225) warnings.push("Image looks overexposed — declarations may be missed.");
    // Only call it blurry when there IS texture to judge (contrast check).
    // Flat/uniform shots (plain wall, sky) naturally have low Laplacian
    // variance even when perfectly in focus — flag those as low-contrast instead.
    if (contrast < 12) {
      warnings.push("Image looks flat / low-contrast — text may be hard to read.");
    } else if (blurScore < 25) {
      warnings.push("Image may be blurry — OCR accuracy could be low.");
    }
    return { file: file.name, ok: warnings.length === 0, width: w, height: h, brightness: Math.round(avg), contrast: Math.round(contrast * 10) / 10, blurScore: Math.round(blurScore * 10) / 10, warnings };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Orchestrates a compliance scan, reporting REAL milestones via onStage(id, state, detail, progress).
 * States: pending | active | done | warn.
 *
 * Where the work happens (replaceable seams):
 *  - quality gate ......... checkImageQuality() above (browser, milliseconds)
 *  - OCR .................. server POST /api/inspections/scan FIRST (Python AI
 *                           service: native Tesseract, ~2-5s). Browser
 *                           Tesseract.js runs ONLY as a fallback when the
 *                           server finds no text (server/services/ocrService.js
 *                           tries the Python AI service, else local engine).
 *  - extraction + rules ... same server request (AI service when reachable,
 *                           else the built-in engine).
 * To go full "real AI service": point AI_SERVICE_URL at the FastAPI service and
 * ensure Tesseract is installed there — no client change needed.
 */
export async function runComplianceScan({ files = [], manualText = "", category = "general", listing = null, location = null, demo = false, onStage }) {
  const emit = (id, state, detail = null, progress = null) => onStage && onStage(id, state, detail, progress);
  STAGES.forEach((s) => emit(s.id, "pending"));

  // 1. Upload validated (files already type/size-checked by UploadBox)
  emit("uploaded", "active");
  if (!files.length && !manualText.trim()) throw new Error("Upload an image or paste package text.");
  emit("uploaded", "done", files.length ? `${files.length} image(s) ready` : "Text-only scan");

  // 2. Real image quality check
  const qualities = [];
  if (files.length) {
    emit("quality", "active");
    for (let i = 0; i < files.length; i++) {
      qualities.push(await checkImageQuality(files[i]));
      emit("quality", "active", null, (i + 1) / files.length);
    }
    emit("quality", qualities.every((q) => q.ok) ? "done" : "warn", qualities);
  } else {
    emit("quality", "done", "No image — skipped");
  }

  // Preprocess an image for the FALLBACK browser OCR: downscale large photos
  // (Tesseract.js is much slower than the server's native Tesseract, so keep
  // the input small), upscale tiny ones, grayscale + contrast stretch.
  // Returns a Blob suitable for Tesseract.js. Only used when the server
  // could not detect any text.
  async function preprocessForOcr(file) {
    try {
      const bmp = await createImageBitmap(file);
      const srcW = bmp.width, srcH = bmp.height;
      const longSide = Math.max(srcW, srcH);
      // Cap at 1600px for speed; upscale only if below 1200px.
      let scale = 1;
      if (longSide > 1600) scale = 1600 / longSide;
      else if (longSide < 1200) scale = Math.min(1200 / longSide, 1600 / longSide);
      const W = Math.max(1, Math.round(srcW * scale)), H = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, W, H);
      bmp.close();
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      // grayscale + autocontrast (percentile stretch, robust to glare spots)
      const gray = new Uint8ClampedArray(W * H);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
      let lo = 255, hi = 0;
      const hist = new Array(256).fill(0);
      for (const g of gray) hist[Math.round(g)]++;
      let acc = 0, total = gray.length;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc / total > 0.02) { lo = i; break; } }
      acc = 0;
      for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc / total > 0.02) { hi = i; break; } }
      if (hi <= lo) { hi = lo + 1; }
      for (let j = 0; j < gray.length; j++) {
        let v = ((gray[j] - lo) / (hi - lo)) * 255;
        v = v < 0 ? 0 : v > 255 ? 255 : v;
        d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
      // JPEG is far faster to encode/decode than PNG at these sizes.
      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      return blob || file;
    } catch {
      return file;
    }
  }

  // 3–6. Text detection + extraction + rules.
  //
  // Speed design: the server's native Tesseract is 5–10x faster than the
  // browser's Tesseract.js, so the server scan goes FIRST (it OCRs the image
  // itself via the Python AI service). Browser OCR runs ONLY as a fallback
  // when the server found no text — previously it always ran first and
  // blocked every scan for tens of seconds.
  let text = (manualText || "").trim();
  let rec;
  if (text) {
    emit("ocr", "done", `${text.length} characters provided`);
    emit("extract", "active");
    rec = await scanService.scan(files, text, { category, listing, quality: qualities, location, demo });
    emit("extract", "done");
  } else if (files.length) {
    emit("ocr", "active", "Detecting text…");
    emit("extract", "active");
    // Heartbeat so the UI never looks frozen on slow/large photos, plus a
    // hard cap so a hung server can never stall the scan forever.
    const heartbeat = setInterval(() => emit("ocr", "active", "Detecting text… still working (large photo can take ~1 min)…"), 15000);
    try {
      rec = await scanService.scan(files, "", { category, listing, quality: qualities, location, demo });
    } catch (e) {
      emit("ocr", "warn", e.message || "Text detection failed — continuing");
      emit("extract", "done");
      throw e;
    } finally {
      clearInterval(heartbeat);
    }
    text = (rec.ocr_text || "").trim();
    if (text) {
      emit("ocr", "done", `${text.length} characters detected`);
      emit("extract", "done");
    } else {
      // Server found nothing — fall back to on-device OCR, then re-scan once.
      // Bounded: 60s cap + guaranteed worker termination, so this fallback
      // can never wedge the pipeline at "Text detected" either.
      emit("ocr", "active", "Server found no text — trying on-device OCR…", 0);
      let worker = null;
      try {
        const ocrInput = await preprocessForOcr(files[0]);
        const withTimeout = (p, ms, label) => Promise.race([
          p,
          new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
        ]);
        // tesseract.js v5: createWorker(langs, oem, options). The old
        // 2-arg call passed the options object as `oem` and could hang.
        worker = await withTimeout(createWorker("eng", 1, {
          logger: (m) => { if (m.status === "recognizing text" && m.progress != null) emit("ocr", "active", `On-device OCR… ${Math.round(m.progress * 100)}%`, m.progress); },
        }), 30000, "On-device OCR startup");
        // PSM 6 (uniform text block) reads packaging far better than the default.
        try { await worker.setParameters({ tessedit_pageseg_mode: "6" }); } catch { /* older tesseract.js */ }
        const { data } = await withTimeout(worker.recognize(ocrInput), 60000, "On-device OCR");
        text = (data.text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter((l, i, a) => l || i === 0 || a[i - 1]).join("\n").trim();
      } catch (e) {
        emit("ocr", "warn", `On-device OCR unavailable (${e.message}) — continuing`);
      } finally {
        if (worker) { try { await worker.terminate(); } catch { /* already dead */ } }
      }
      if (text) {
        emit("ocr", "done", `${text.length} characters detected (on-device)`);
        const firstId = rec.id;
        rec = await scanService.scan(files, text, { category, listing, quality: qualities, location, demo });
        // Remove the superseded empty first scan so history stays clean.
        if (firstId) scanService.remove(firstId).catch(() => {});
        emit("extract", "done");
      } else {
        emit("ocr", "warn", "No text detected — recorded as Unable to Verify if server finds nothing");
        emit("extract", "done");
      }
    }
  } else {
    emit("ocr", "warn", "No text to verify");
    emit("extract", "active");
    rec = await scanService.scan(files, text, { category, listing, quality: qualities, location, demo });
    emit("extract", "done");
  }
  emit("rules", "done", `${(rec.checks || []).length} checks evaluated`);
  emit("result", "done", rec.verdict);

  return { rec, text, qualities };
}
