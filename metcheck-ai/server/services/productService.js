const storage = require("./storage");
const { slug } = require("./scanService");

function declVal(d, key) {
  const f = d?.[key];
  if (f && typeof f === "object") return f.value || "";
  return f || "";
}

function productIdFor(rec) {
  const d = rec.declarations || {};
  return slug(`${declVal(d, "productName") || declVal(d, "product_name") || "unknown"}-${declVal(d, "manufacturer") || ""}`);
}

// Maintain the product repository entry for an inspection.
async function syncFromInspection(rec) {
  const d = rec.declarations || {};
  const all = await storage.listInspections();
  const pid = rec.productId || productIdFor(rec);
  const mine = all.filter((r) => (r.productId || productIdFor(r)) === pid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const last = mine[0] || rec;
  const ld = last.declarations || {};
  await storage.upsertProduct({
    productId: pid,
    name: declVal(ld, "productName") || declVal(ld, "product_name") || "Unknown product",
    manufacturer: declVal(ld, "manufacturer"),
    category: last.category || "general",
    categoryLabel: last.categoryLabel || "",
    inspectionCount: mine.length,
    lastInspection: last.createdAt,
    lastStatus: last.status,
    lastVerdict: last.verdict,
    lastScore: last.score,
    avgScore: mine.length ? Math.round(mine.reduce((s, r) => s + (r.score || 0), 0) / mine.length) : 0,
    officer: last.officer,
    updatedAt: new Date().toISOString(),
  });
  return pid;
}

async function list({ q } = {}) {
  // One-time backfill: legacy inspections saved before productId existed.
  const all = await storage.listInspections();
  for (const r of all) {
    if (!r.productId) {
      await storage.updateInspection(r.id, { productId: productIdFor(r) });
      await syncFromInspection({ ...r, productId: productIdFor(r) });
    }
  }
  let products = await storage.listProducts();
  // Backfill from inspections when the repository is empty (e.g. legacy data).
  if (!products.length) {
    const seen = new Set();
    for (const r of all) {
      const pid = r.productId || productIdFor(r);
      if (!seen.has(pid)) { seen.add(pid); await syncFromInspection(r); }
    }
    products = await storage.listProducts();
  }
  if (q) {
    const needle = q.toLowerCase();
    products = products.filter((p) => `${p.name} ${p.manufacturer}`.toLowerCase().includes(needle));
  }
  return products;
}

async function getWithHistory(productId) {
  const { ApiError } = require("../utils/errors");
  const product = await storage.findProduct(productId);
  if (!product) throw ApiError.notFound("Product not found.", "PRODUCT_NOT_FOUND");
  const all = await storage.listInspections();
  const history = all
    .filter((r) => (r.productId || productIdFor(r)) === productId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return { product, history };
}

module.exports = { list, getWithHistory, syncFromInspection, productIdFor };
