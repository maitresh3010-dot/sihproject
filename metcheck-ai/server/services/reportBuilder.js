const { fmtDate } = require("./format");
const { ApiError } = require("../utils/errors");
const storage = require("./storage");

// Builds the professional inspection report (also used for PDF content on the client).
function buildReport(rec, generatedBy) {
  if (!rec) throw ApiError.notFound("Inspection not found — report cannot be generated.", "REPORT_FAILED");
  const d = rec.declarations || {};
  const dv = (k) => {
    const f = d[k];
    if (f && typeof f === "object") return Array.isArray(f.value) ? f.value.join("; ") : f.value || "—";
    return f || "—";
  };
  const dates = [dv("manufacturingDate"), dv("packingDate"), dv("importDate")].filter((v) => v !== "—");
  return {
    title: "LEGAL METROLOGY COMPLIANCE INSPECTION REPORT",
    app: "LegalMet AI",
    inspectionId: rec.id,
    date: rec.createdAt,
    officer: rec.officerName || rec.officer,
    location: rec.location || null,
    product: {
      name: dv("productName") !== "—" ? dv("productName") : (d.product_name?.value || "—"),
      manufacturer: dv("manufacturer"),
      category: rec.categoryLabel || rec.category,
    },
    summary: { score: rec.score, status: rec.status, verdict: rec.verdict, detail: rec.scoreDetail || null },
    declarations: {
      mrp: dv("mrp"), netQuantity: dv("netQuantity") !== "—" ? dv("netQuantity") : (d.net_quantity?.value || "—"),
      manufacturer: dv("manufacturer"), date: dates.length ? dates.join("; ") : "—",
      consumerCare: dv("consumerCare") !== "—" ? dv("consumerCare") : (d.consumer_care?.value || "—"),
    },
    violations: (rec.checks || []).filter((c) => c.status === "fail")
      .map((c, i) => ({ n: i + 1, rule: c.ruleId || c.rule_id, name: c.name || c.label })),
    manualReview: (rec.checks || []).filter((c) => c.status === "review")
      .map((c, i) => ({ n: i + 1, rule: c.ruleId || c.rule_id, name: c.name || c.label })),
    remarks: rec.remarks || null,
    evidenceImages: rec.images?.length ? rec.images : rec.image ? [rec.image] : [],
    disclaimer: "This report is an AI-assisted inspection aid. Final regulatory determination should be made by the authorized enforcement authority.",
    generatedBy: generatedBy || null,
    generatedAt: new Date().toISOString(),
  };
}

async function getOrBuild(inspectionId, generatedBy) {
  const rec = await storage.findInspection(inspectionId);
  if (!rec) throw ApiError.notFound("Inspection not found — report cannot be generated.", "REPORT_FAILED");
  const content = buildReport(rec, generatedBy);
  const report = {
    reportId: `rep_${Date.now()}`,
    inspectionId,
    generatedBy: generatedBy || null,
    format: "json",
    content,
    createdAt: new Date().toISOString(),
  };
  await storage.saveReport(report);
  return report;
}

module.exports = { buildReport, getOrBuild };
