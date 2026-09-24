const path = require("path");
const storage = require("../services/storage");
const scanService = require("../services/scanService");
const productService = require("../services/productService");
const { categoryLabel } = require("../services/ruleEngine");
const { visibleInspections } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");

// POST /api/scans — run the full compliance scan pipeline (analysis + saved inspection).
async function create(req, res) {
  const manualText = (req.body.manualText || "").trim();
  const category = (req.body.category || "general").toLowerCase();
  let listing = null;
  try {
    listing = req.body.listing ? JSON.parse(req.body.listing) : null;
  } catch {
    throw ApiError.badRequest("The listing field is not valid JSON.", "INVALID_LISTING");
  }
  let quality = null;
  try {
    quality = req.body.quality ? JSON.parse(req.body.quality) : null;
  } catch {
    throw ApiError.badRequest("The quality field is not valid JSON.", "INVALID_QUALITY");
  }
  const location = (req.body.location || "").trim() || null;
  const demo = req.body.demo === "true" || req.body.demo === true;
  const files = [...((req.files && req.files.images) || []), ...((req.files && req.files.image) || [])];

  const out = await scanService.analyze({ files, manualText, category, listing });
  const images = files.map((f) => `/uploads/${path.basename(f.path)}`);
  const rec = {
    id: `insp_${Date.now()}`,
    inspectionId: `insp_${Date.now()}`,
    officer: req.user.email, officerId: req.user.email, officerName: req.user.name,
    createdAt: new Date().toISOString(),
    category, categoryLabel: categoryLabel(category),
    image: images[0] || null, images,
    ocr_text: out.ocr_text, ocr_engine: out.ocr_engine, ocr_words: out.ocr_words,
    ocr_image: out.ocr_image, readability: out.readability,
    warning: out.warning || null, legible: out.legible !== false,
    declarations: out.declarations, checks: out.checks, score: out.score,
    status: out.status, verdict: out.verdict, missing: out.missing,
    passed: out.passed, failed: out.failed, manualReview: out.manualReview,
    scoreDetail: out.scoreDetail,
    comparison: out.comparison, listing: out.listing,
    quality, location, remarks: null, stages: out.stages,
    demo: demo || false,
    note: out.note,
  };
  rec.productId = productService.productIdFor(rec);
  await storage.addInspection(rec);
  await productService.syncFromInspection(rec);
  res.status(201).json(rec);
}

// GET /api/scans/:id — fetch a completed scan result.
async function get(req, res) {
  const rec = await storage.findInspection(req.params.id);
  if (!rec) throw ApiError.notFound("Scan result not found.", "SCAN_NOT_FOUND");
  const allowed = visibleInspections([rec], req.user).length > 0;
  if (!allowed) throw ApiError.forbidden();
  res.json(rec);
}

module.exports = { create, get };
