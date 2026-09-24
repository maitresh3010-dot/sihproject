const storage = require("../services/storage");
const reportBuilder = require("../services/reportBuilder");
const { visibleInspections } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");

const scoped = async (user) => {
  try {
    return visibleInspections(await storage.listInspections(), user);
  } catch {
    throw ApiError.unavailable("Report data is unavailable right now. Please try again.");
  }
};

function bucketFor(field) {
  if (field === "mrp") return "MRP issue";
  if (field === "netQuantity" || field === "net_quantity") return "Net quantity issue";
  if (["manufacturer", "packer", "importer", "address", "countryOrigin"].includes(field)) return "Manufacturer details";
  if (field === "consumerCare" || field === "consumer_care") return "Consumer care";
  return "Missing declaration";
}

async function summary(req, res) {
  const all = await scoped(req.user);
  const byStatus = (v) => all.filter((r) => (r.status || "UNABLE_TO_VERIFY") === v).length;

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const trend = days.map((date) => {
    const rows = all.filter((r) => (r.createdAt || "").slice(0, 10) === date);
    return {
      date,
      total: rows.length,
      compliant: rows.filter((r) => (r.status || "") === "COMPLIANT").length,
      violations: rows.filter((r) => (r.status || "") === "POTENTIAL_VIOLATION").length,
    };
  });

  const dist = {
    "Missing declaration": 0, "MRP issue": 0, "Net quantity issue": 0,
    "Manufacturer details": 0, "Consumer care": 0, "Readability": 0, "Other": 0,
  };
  for (const r of all) {
    for (const c of r.checks || []) {
      if (c.status !== "fail") continue;
      const b = bucketFor(c.field);
      dist[dist[b] !== undefined ? b : "Other"]++;
    }
    const words = (r.ocr_words || []).filter((w) => w.conf > 0);
    if (words.length > 5) {
      const avg = words.reduce((s, w) => s + w.conf, 0) / words.length;
      if (avg < 60) dist["Readability"]++;
    }
  }

  const byCategory = {};
  for (const r of all) { const c = r.categoryLabel || r.category || "Other"; byCategory[c] = (byCategory[c] || 0) + 1; }

  res.json({
    total: all.length,
    compliant: byStatus("COMPLIANT"),
    potentialViolation: byStatus("POTENTIAL_VIOLATION"),
    manualReview: byStatus("MANUAL_REVIEW"),
    unable: byStatus("UNABLE_TO_VERIFY"),
    byCategory, trend,
    distribution: Object.entries(dist).map(([label, count]) => ({ label, count })),
    avgScore: all.length ? Math.round(all.reduce((s, r) => s + (r.score || 0), 0) / all.length) : 0,
    recent: all.slice(0, 8),
  });
}

async function exportCsv(req, res) {
  const all = await scoped(req.user);
  const rows = [["id", "date", "officer", "category", "verdict", "score", "product", "mrp", "net_qty", "missing"].join(",")];
  for (const r of all) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const d = r.declarations || {};
    const dv = (k) => (d[k] && typeof d[k] === "object" ? d[k].value : d[k]) ?? "";
    rows.push([r.id, r.createdAt, r.officer, q(r.categoryLabel || r.category || ""), q(r.verdict), r.score,
      q(dv("productName") || dv("product_name")), q(dv("mrp")), q(dv("netQuantity") || dv("net_quantity")),
      q((r.missing || []).join("; "))].join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=legalmet-report.csv");
  res.send(rows.join("\n"));
}

// GET /api/reports/:id — structured report for one inspection (JSON; PDF is rendered client-side).
async function get(req, res) {
  const rec = await storage.findInspection(req.params.id);
  if (!rec) throw ApiError.notFound("Inspection not found — report cannot be generated.", "REPORT_FAILED");
  if (!visibleInspections([rec], req.user).length) throw ApiError.forbidden();
  try {
    const report = await reportBuilder.getOrBuild(req.params.id, req.user.email);
    res.json(report.content);
  } catch (e) {
    if (e.status) throw e;
    throw new ApiError(500, "Report generation failed. Please try again.", "REPORT_FAILED");
  }
}

module.exports = { summary, exportCsv, get };
