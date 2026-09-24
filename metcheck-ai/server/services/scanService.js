/**
 * Scan pipeline service: upload -> OCR -> extraction -> rule validation -> analysis.
 * Tries the Python AI service first; falls back to the built-in engine when the
 * AI service is unreachable (OCR failure / AI unavailable never breaks a scan —
 * the result honestly reports UNABLE_TO_VERIFY when nothing is detected).
 */
const fs = require("fs");
const path = require("path");
const { loadRules, extractDeclarations, evaluate, compareEcommerce } = require("./ruleEngine");
const { analyzeViaAI } = require("./ocrService");
const { ApiError } = require("../utils/errors");

async function analyze({ files = [], manualText = "", category = "general", listing = null }) {
  const rules = await loadRules();
  const text = (manualText || "").trim();
  const cat = (category || "general").toLowerCase();
  const first = files[0];

  let ocr_text = text, ocr_words = [], engine = "manual";
  let declarations = null, readability = null, ocrDims = null, aiReachable = false;
  let ocrWarning = null, ocrLegible = true;
  const stages = [];

  if (first) {
    stages.push("image_processing");
    let buf;
    try {
      buf = fs.readFileSync(first.path);
    } catch {
      throw ApiError.badRequest("Could not read the uploaded image. Please upload it again.", "INVALID_IMAGE");
    }
    const ai = await analyzeViaAI(buf, first.originalname, cat);
    if (ai && ai.declarations) {
      aiReachable = true;
      stages.push("ocr", "extraction");
      ocr_text = ai.ocr_text || text;
      ocr_words = ai.ocr_words || [];
      engine = ai.ocr_engine || "ai-service";
      declarations = ai.declarations;
      readability = ai.readability || null;
      ocrWarning = ai.warning || null;
      ocrLegible = ai.legible !== false;
      if (ai.image_width && ai.image_height) ocrDims = { w: ai.image_width, h: ai.image_height };
    }
  }
  if (!declarations) {
    if (ocr_text) stages.push("ocr", "extraction");
    declarations = extractDeclarations(ocr_text || "");
  }
  stages.push("rule_validation", "compliance_analysis");
  const result = evaluate(declarations, rules, cat);
  if (!ocr_text && !first) { result.verdict = "Unable to Verify"; result.status = "UNABLE_TO_VERIFY"; result.score = 0; }

  return {
    ocr_text, ocr_engine: engine, ocr_words: (ocr_words || []).slice(0, 300),
    ocr_image: ocrDims, readability, aiReachable,
    warning: ocrWarning, legible: ocrLegible,
    declarations, checks: result.checks, score: result.score,
    status: result.status, verdict: result.verdict, missing: result.missing,
    passed: result.passed, failed: result.failed, manualReview: result.manualReview,
    scoreDetail: result.scoreDetail,
    comparison: compareEcommerce(declarations, listing),
    listing: listing || null, category: cat, stages,
    note: "AI-assisted screening only. Not a legally binding determination.",
  };
}

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
}

module.exports = { analyze, slug };
