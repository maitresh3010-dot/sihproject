const fs = require("fs");
const path = require("path");
const storage = require("./storage");

const RULES_FILE = path.join(__dirname, "..", "..", "ai-service", "rules", "default_rules.json");

// Detections below this confidence are too uncertain to pass automatically.
const CONFIDENCE_THRESHOLD = 0.5;

const STATUS_LABELS = {
  COMPLIANT: "Compliant",
  POTENTIAL_VIOLATION: "Potential Violation",
  MANUAL_REVIEW: "Manual Review Required",
  UNABLE_TO_VERIFY: "Unable to Verify",
};

// Product categories shown on the Scan page. Labels only — legal
// applicability is controlled by the rule database, never hard-coded here.
const PRODUCT_CATEGORIES = [
  { id: "general", label: "Other" },
  { id: "food", label: "Food" },
  { id: "beverages", label: "Beverages" },
  { id: "cosmetics", label: "Cosmetics" },
  { id: "pharmaceuticals", label: "Pharmaceuticals" },
  { id: "household", label: "Household Goods" },
  { id: "electrical", label: "Electrical Products" },
];

function categoryLabel(id) {
  const c = PRODUCT_CATEGORIES.find((x) => x.id === (id || "").toLowerCase());
  return c ? c.label : "Other";
}

async function loadRules() {
  const custom = await storage.getCustomRules();
  if (custom && Array.isArray(custom) && custom.length) return custom;
  try {
    return JSON.parse(fs.readFileSync(RULES_FILE, "utf-8"));
  } catch {
    return [];
  }
}

async function saveRules(rules) { return storage.setCustomRules(rules); }

const lowerList = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).toLowerCase());

// Accept the canonical rule schema, verified source records
// (requirement/sourcePage/sourceDocument/status/applicableTo) and legacy
// keys (id/label/required/appliesTo).
function normalizeRule(r) {
  const validationType = String(r.validationType || (r.required ? "REQUIRED" : "OPTIONAL")).toUpperCase();
  const category = String(r.category || "GENERAL");
  const appliesTo = lowerList(r.appliesTo || r.applicableTo);
  // Scope = product-category applicability. A grouping label such as
  // "Declaration" is NOT a scope — only known product categories or an
  // explicit appliesTo/applicableTo list restrict a rule.
  const known = PRODUCT_CATEGORIES.map((c) => c.id);
  let scope = "GENERAL";
  if (appliesTo.length) scope = appliesTo.length === 1 ? appliesTo[0].toUpperCase() : "MULTI";
  else if (known.includes(category.toLowerCase())) scope = category.toUpperCase();
  const statusActive = !r.status || String(r.status).toLowerCase() === "active";
  const sourceBits = [r.sourceDocument, r.sourcePage != null && r.sourcePage !== "" ? `p.${r.sourcePage}` : null].filter(Boolean);
  return {
    ruleId: r.ruleId || r.id,
    name: r.name || r.label || r.ruleId || r.id,
    field: r.field || null,
    anyOf: r.anyOf || [],
    description: r.description || r.requirement || "",
    requirement: r.requirement || null,
    category,
    scope,
    appliesTo,
    validationType,
    requiredFor: lowerList(r.requiredFor),
    severity: String(r.severity || "MEDIUM").toUpperCase(),
    active: r.active !== false && statusActive,
    source: r.source || sourceBits.join(", ") || "Legal Metrology reference material",
    sourceDocument: r.sourceDocument || null,
    sourcePage: r.sourcePage != null ? r.sourcePage : null,
    status: r.status || (r.active === false ? "inactive" : "active"),
  };
}

function found(value, confidence, ocrConf) {
  const empty = value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
  if (empty) return { value: null, confidence: 0, status: "NOT_FOUND" };
  return { value: typeof value === "string" ? value.trim() : value, confidence: Math.round(Math.min(0.99, confidence * ocrConf) * 100) / 100, status: "FOUND" };
}
const missing = () => ({ value: null, confidence: 0, status: "NOT_FOUND" });

const DATE = "(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|\\d{4}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\\s\\-\\.]+\\d{2,4}|\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\s+\\d{2,4}|\\b(?:0?[1-9]|1[0-2])[\\/\\-.]\\d{4}\\b)";

// Declaration extraction: OCR text -> {value, confidence, status} per field.
// OCR-error tolerant (mirrors ai-service/extraction/declarations.py).
// Undetected fields are null / 0 / NOT_FOUND — information is never invented.
function extractDeclarations(text, ocrConfidence = 1) {
  const raw = text || "";
  const t = raw.replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n+/g, "\n");
  const oc = Math.max(0, Math.min(1, ocrConfidence || 1));
  const out = {};
  const clean = (s, lim = 120) => (s || "").replace(/\s+/g, " ").replace(/^[\s:–—\-|]+|[\s:–—\-|]+$/g, "").trim().slice(0, lim);
  const LABEL_LINE = /MRP|M\.?\s*R\.?\s*P|Maximum\s+Retail|Net\s*(Qty|Quty|Quantity|Wt)|Mfg|Mfd|Manufactured|Pkd|Packed|Exp|Best\s*before|Use\s*by|Consumer|Customer|Helpline|Toll|Imported|Marketed|Country\s*of|Made\s*in|FSSAI/i;
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  let pname = null;
  for (const ln of lines.slice(0, 8)) {
    if (LABEL_LINE.test(ln)) continue;
    if (ln.replace(/[^A-Za-z]/g, "").length >= 3) { pname = ln.slice(0, 100); break; }
  }
  if (!pname) {
    let best = "";
    for (const ln of lines) {
      if (LABEL_LINE.test(ln)) continue;
      if (ln.length > best.length && ln.replace(/[^A-Za-z]/g, "").length >= 3) best = ln;
    }
    if (best) pname = best.slice(0, 100);
  }
  out.productName = found(pname, 0.6, oc);
  const grab = (re) => { const m = t.match(re); return m ? (m[1] !== undefined ? m[1] : m[0]) : null; };
  const isBareDate = (s) => /^[\d/.\- ]+$/.test(s || "");
  let mfr = grab(/Manufactured\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})/i);
  out.manufacturer = found(mfr ? clean(mfr, 100) : null, 0.9, oc);
  if (out.manufacturer.status === "NOT_FOUND") {
    const m2 = t.match(/(?:M\s*f\s*g|M\s*f\s*d|Mfg\.?|Mfd\.?|MFG|MFD|Manufactured)\s*(?:by|date|on)?\s*[:\-]?\s*([A-Z][^\n,]{2,100})/);
    if (m2 && !isBareDate(m2[1])) out.manufacturer = found(clean(m2[1], 100), 0.75, oc);
  }
  const pk = grab(/(?:P\s*k\s*d|Pkd\.?|Packed|Packer|Packing)\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})/i);
  out.packer = pk && !isBareDate(pk) ? found(clean(pk, 100), 0.9, oc) : missing();
  const im = grab(/(?:Imported?|Importer)\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})/i);
  out.importer = im && !isBareDate(im) ? found(clean(im, 100), 0.9, oc) : missing();
  if (out.manufacturer.status === "NOT_FOUND") {
    const mkt = grab(/(?:Marketed|Mktd\.?)\s*(?:by)?\s*[:\-]?\s*([^\n,]{3,100})/i);
    if (mkt) out.manufacturer = found(clean(mkt, 100), 0.8, oc);
  }
  const NET_L = "(?:N\\s*[eao]\\s*t|N\\s*e\\s*r|N\\s*c\\s*t|Net|Ner|Nct)";
  const QTY_W = "(?:Qty|Quty|Qly|Qnt|Oty|Oly|Quantity|Wt|Weight|Content)";
  const UNIT = "(?:kgs?|grams?|gms?|g\\b|ml|ltr\\.?|ltrs?|litres?|liters?|l\\b|mg|kg|cm|m\\b|pcs|pieces?|packets?|pouches?|nos?\\.?|tablets?|capsules?|bars?)";
  const qtyLabeled = grab(new RegExp(NET_L + "\\s*" + QTY_W + "?\\s*[\\.\\:\\-]?\\s*(\\d+\\.?\\d*\\s*(?:x\\s*\\d+\\.?\\d*\\s*)?" + UNIT + ")", "i"));
  out.netQuantity = qtyLabeled
    ? found(clean(qtyLabeled, 40), 0.95, oc)
    : found(((v) => v ? clean(v, 40) : null)(grab(new RegExp("(\\d+\\.?\\d*\\s*(?:x\\s*\\d+\\.?\\d*\\s*)?" + UNIT + ")", "i"))), 0.8, oc);
  const MRP_L = "(?:M\\s*[\\.\\- _]?\\s*R\\s*[\\.\\- _]?\\s*P|Maximum\\s+Retail\\s+Price|Max\\s*\\.?\\s*Retail\\s+Price|Retail\\s+Price)";
  const PRICE = "((?:Rs\\.?|₹|INR|RS\\.?)?\\s*\\d[\\d,\\s]*\\.?\\d*\\s*(?:\\/\\s*-|/-)?\\s*(?:Rs\\.?|₹|INR)?(?:\\s*inclusive\\s+of\\s+all\\s+taxes)?)";
  let mrpM = t.match(new RegExp(MRP_L + "\\s*\\.?\\s*(?:is|:| RS| Rs)?\\s*[:\\-]?\\s*" + PRICE, "i"));
  if (mrpM && /\d/.test(mrpM[1])) {
    out.mrp = found(clean(mrpM[1], 60), /Rs|₹|INR/i.test(mrpM[1]) ? 0.98 : 0.9, oc);
  } else {
    const fuzzy = t.match(new RegExp("(?:[MHN]\\s*[\\.\\- _]?\\s*[RX]\\s*[\\.\\- _]?\\s*[PF])\\s*[:\\-]?\\s*" + PRICE, "i"));
    if (fuzzy && /\d/.test(fuzzy[1])) out.mrp = found(clean(fuzzy[1], 60), 0.7, oc);
    else {
      const rs = t.match(/\b(?:Rs\.?|₹|INR)\s*\d[\d,\s]*\.?\d*/i);
      out.mrp = rs ? found(clean(rs[0], 60), 0.65, oc) : missing();
    }
  }
  out.manufacturingDate = found(grab(new RegExp("(?:M\\s*f\\s*g|M\\s*f\\s*d|Mfg\\.?|Mfd\\.?|MFG|MFD|Manufactured)(?:\\s*(?:date|on|by))?\\s*[:\\-]?\\s*" + DATE, "i")), 0.9, oc);
  const pkdFull = grab(new RegExp("(?:P\\s*k\\s*d|Pkd\\.?|Packed|Packer|Packing|Pack(?:ed|aging)?\\s*(?:date|on)?)\\s*[:\\-]?\\s*" + DATE, "i"));
  if (pkdFull && !/(?:manufact|mfg|mfd)/i.test(pkdFull)) out.packingDate = found(pkdFull.trim(), 0.9, oc);
  else {
    const pkdOnly = grab(new RegExp("\\bPkd\\b[^:\\n]*[:\\-][^\\n]*?" + DATE, "i"));
    out.packingDate = found(pkdOnly ? pkdOnly.trim() : null, 0.9, oc);
  }
  out.importDate = found(grab(new RegExp("(?:Imported?\\s*(?:on|date)?)\\s*[:\\-]?\\s*" + DATE, "i")), 0.9, oc);
  const cc = t.match(/(Consumer\s*care[^\n]{0,10}[:\-][^\n]{2,140}|Customer\s*care[^\n]{0,10}[:\-][^\n]{2,140}|Consumer\s*care[^\n]{2,140}|Customer\s*care[^\n]{2,140}|Helpline[^\n]{0,20}[:\-]?[^\n]{1,60}|Help\s*line[^\n]{0,20}[:\-]?[^\n]{1,60}|Toll[\s\-]*free[^\n]{1,60}|1800[\s\-]?\d[\d\s\-]{5,}|care@[^\s,;]+|support@[^\s,;]+|customercare@[^\s,;]+|info@[^\s,;]+|\b[6-9]\d{9}\b)/i);
  out.consumerCare = found(cc ? clean(cc[0], 160) : null, 0.9, oc);
  let addr = null, aconf = 0.8;
  for (const ln of lines) { if (/\b[1-9]\d{5}\b/.test(ln)) { addr = ln.slice(0, 180); aconf = 0.9; break; } }
  if (!addr) {
    const am = grab(/([^\n]{5,100}(?:Street|Road|Rood|Nagar|Industrial|Plot|Gujarat|Maharashtra|Delhi|Mumbai|Pune|Chennai|Kolkata|Bengaluru|Bangalore|Hyderabad|Anand|India|Park|Area|Phase|Limited|Ltd|Pvt)[^\n]{0,80})/i);
    if (am) addr = clean(am, 180);
  }
  out.address = found(addr, aconf, oc);
  out.expiry = found(((v) => v ? clean(v, 80) : null)(grab(/(?:Exp(?:iry|iry)?(?:\s*date)?|Best\s*before|Use\s*by|Best Before)\s*[:\-]?\s*([^\n]{1,60})/i)), 0.85, oc);
  out.countryOrigin = found(((v) => v ? clean(v, 40) : null)(grab(/(?:Country\s*of\s*(?:origin)?|Made\s*in|Origin|Product\s*of)\s*:?\s*([A-Za-z ]{2,40})/i)), 0.9, oc);
  const others = [];
  for (const re of [/(Country\s*of\s*(?:origin)?\s*:?\s*[A-Za-z ]{2,40})/gi, /(FSSAI[^\n]{1,40})/gi, /(Lic\.?\s*No\.?[^\n]{1,30})/gi, /(Batch\s*(?:No\.?|Number)?\s*[:\-]?[^\n]{1,30})/gi, /(Lot\s*(?:No\.?|Number)?\s*[:\-]?[^\n]{1,30})/gi, /((?:www\.|https?:\/\/)[^\s,;]+)/gi, /((?:customercare|support|info|care)@[^\s,;]+)/gi]) {
    let m; while ((m = re.exec(t)) !== null) { const v = clean(m[1], 120); if (v && !others.includes(v)) others.push(v); }
  }
  out.otherDeclarations = others.length ? found(others, 0.8, oc) : missing();
  return out;
}

function lookup(fields, rule) {
  const keys = [...(rule.field ? [rule.field] : []), ...(rule.anyOf || [])];
  let best = null;
  for (const k of keys) {
    const f = (fields || {})[k];
    if (f && typeof f === "object") {
      const present = f.status ? f.status === "FOUND" : !!f.present;
      const score = (present ? 1 : 0) + (f.confidence || 0) / 10;
      if (!best || score > best.score) best = { key: k, f, score };
    }
  }
  return best || { key: rule.field, f: { value: null, confidence: 0, status: "NOT_FOUND" }, score: -1 };
}

// Rule validation: declarations + category + active rules ->
// {checks, passed, failed, manualReview, score, status, scoreDetail}.
function evaluate(fields, rules, category) {
  const cat = (category || "general").toLowerCase();
  const checks = [], passed = [], failed = [], manual = [];
  for (const raw of rules || []) {
    const r = normalizeRule(raw);
    if (!r.active) continue;
    if (r.scope !== "GENERAL" && r.scope !== "MULTI" && r.scope.toLowerCase() !== cat) continue;
    if (r.scope === "MULTI" && !r.appliesTo.includes(cat)) continue;
    const { key, f } = lookup(fields, r);
    const isFound = f.status ? f.status === "FOUND" : !!f.present;
    const conf = f.confidence != null ? f.confidence : (isFound ? 0.9 : 0);
    const required = r.validationType === "REQUIRED" || r.requiredFor.includes(cat);
    let status, ok, note;
    if (required && isFound && conf < CONFIDENCE_THRESHOLD) { status = "review"; ok = false; note = "low_confidence"; }
    else if (!required) { status = isFound ? "pass" : "review"; ok = true; note = undefined; }
    else if (isFound) { status = "pass"; ok = true; note = undefined; }
    else { status = "fail"; ok = false; note = undefined; }
    const check = { ruleId: r.ruleId, name: r.name, field: key, required, severity: r.severity, passed: ok, status, value: f.value != null ? f.value : null, confidence: conf, description: r.description, source: r.source };
    if (note) check.note = note;
    checks.push(check);
    if (status === "pass") passed.push(r.ruleId);
    else if (status === "fail") failed.push(r.ruleId);
    else manual.push(r.ruleId);
  }
  const applicable = checks.filter((c) => c.required).length;
  const reqPass = checks.filter((c) => c.required && c.status === "pass").length;
  const score = applicable ? Math.round((100 * reqPass) / applicable) : 0;
  const hasFields = !!(fields && Object.values(fields).some((v) => v && typeof v === "object" && (v.status ? v.status === "FOUND" : !!v.present)));
  let status;
  if (!hasFields) status = "UNABLE_TO_VERIFY";
  else if (failed.length) status = "POTENTIAL_VIOLATION";
  else if (score === 100 && !manual.length) status = "COMPLIANT";
  else if (manual.length || score >= 70) status = "MANUAL_REVIEW";
  else status = "UNABLE_TO_VERIFY";
  return {
    checks, passed, failed, manualReview: manual, score, status,
    verdict: STATUS_LABELS[status],
    scoreDetail: { applicable, passed: reqPass, failed: failed.length },
    missing: checks.filter((c) => c.status === "fail").map((c) => c.name),
  };
}

function compareEcommerce(declarations, listing) {
  if (!listing) return null;
  const rows = [];
  const norm = (s) => (s || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
  const val = (d) => (d && typeof d === "object" ? d.value : d);
  const pairs = [
    ["productName", listing.productName || listing.product_name],
    ["mrp", listing.mrp],
    ["netQuantity", listing.netQuantity || listing.net_quantity],
    ["manufacturer", listing.manufacturer],
  ];
  for (const [field, lv] of pairs) {
    const dv = val(declarations?.[field]);
    const match = norm(dv) && norm(lv) ? norm(dv) === norm(lv) || norm(dv).includes(norm(lv)) || norm(lv).includes(norm(dv)) : null;
    rows.push({ field, package_value: dv || null, listing_value: lv || null, match });
  }
  // Free-form extra listing info is informational only — never auto-compared.
  if (listing.otherInfo) rows.push({ field: "otherInfo", package_value: null, listing_value: listing.otherInfo, match: null, info: true });
  return rows;
}

module.exports = { loadRules, saveRules, normalizeRule, extractDeclarations, evaluate, compareEcommerce, PRODUCT_CATEGORIES, categoryLabel, STATUS_LABELS, CONFIDENCE_THRESHOLD };
