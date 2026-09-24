const storage = require("../services/storage");
const productService = require("../services/productService");
const { categoryLabel } = require("../services/ruleEngine");
const { visibleInspections } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");

async function list(req, res) {
  const { q, verdict, status, category, page = 1, limit = 20 } = req.query;
  let all;
  try {
    all = visibleInspections(await storage.listInspections(), req.user);
  } catch {
    throw ApiError.unavailable("Inspection records are unavailable right now. Please try again.");
  }
  const wantStatus = status || (verdict ? ({ Compliant: "COMPLIANT", "Potential Violation": "POTENTIAL_VIOLATION", "Manual Review Required": "MANUAL_REVIEW", "Unable to Verify": "UNABLE_TO_VERIFY" })[verdict] : null);
  if (wantStatus) all = all.filter((r) => (r.status || "UNABLE_TO_VERIFY") === wantStatus);
  if (category) all = all.filter((r) => (r.category || "general") === category);
  if (q) {
    const needle = String(q).toLowerCase();
    all = all.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
  }
  const p = Math.max(1, parseInt(page)), l = Math.min(100, parseInt(limit) || 20);
  res.json({ total: all.length, page: p, items: all.slice((p - 1) * l, p * l) });
}

async function get(req, res) {
  const rec = await storage.findInspection(req.params.id);
  if (!rec) throw ApiError.notFound("Inspection not found.", "INSPECTION_NOT_FOUND");
  if (!visibleInspections([rec], req.user).length) throw ApiError.forbidden();
  res.json(rec);
}

// POST /api/inspections — save a client-supplied analysis as an inspection.
async function create(req, res) {
  const { scan } = req.body || {};
  if (!scan || typeof scan !== "object" || !scan.declarations) {
    throw ApiError.badRequest("A scan analysis object with declarations is required.", "INVALID_SCAN");
  }
  const now = new Date().toISOString();
  const rec = {
    ...scan,
    id: `insp_${Date.now()}`, inspectionId: `insp_${Date.now()}`,
    officer: req.user.email, officerId: req.user.email, officerName: req.user.name,
    createdAt: now,
    category: (scan.category || "general").toLowerCase(),
    categoryLabel: categoryLabel(scan.category || "general"),
    location: typeof req.body.location === "string" ? req.body.location.slice(0, 200) : (scan.location || null),
    remarks: typeof req.body.remarks === "string" ? req.body.remarks.slice(0, 2000) : null,
  };
  rec.productId = productService.productIdFor(rec);
  await storage.addInspection(rec);
  await productService.syncFromInspection(rec);
  res.status(201).json(rec);
}

async function update(req, res) {
  const rec = await storage.findInspection(req.params.id);
  if (!rec) throw ApiError.notFound("Inspection not found.", "INSPECTION_NOT_FOUND");
  if (req.user.role !== "ADMIN" && rec.officer !== req.user.email) throw ApiError.forbidden();
  const patch = {};
  if (typeof req.body.remarks === "string") patch.remarks = req.body.remarks.slice(0, 2000);
  if (typeof req.body.location === "string") patch.location = req.body.location.slice(0, 200);
  res.json(await storage.updateInspection(req.params.id, patch));
}

async function remove(req, res) {
  const rec = await storage.findInspection(req.params.id);
  if (!rec) throw ApiError.notFound("Inspection not found.", "INSPECTION_NOT_FOUND");
  if (req.user.role !== "ADMIN" && rec.officer !== req.user.email) throw ApiError.forbidden();
  await storage.deleteInspection(req.params.id);
  res.json({ ok: true });
}

module.exports = { list, get, create, update, remove };
