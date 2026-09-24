const { loadRules, saveRules, normalizeRule } = require("../services/ruleEngine");
const { PRODUCT_CATEGORIES } = require("../services/ruleEngine");
const { ApiError } = require("../utils/errors");

async function list(req, res) {
  res.json(await loadRules());
}

function cleanOne(raw) {
  const r = normalizeRule(raw || {});
  if (!r.ruleId) throw ApiError.badRequest("Each rule needs a ruleId (e.g. LM-009).", "INVALID_RULE");
  if (!r.field && !r.anyOf.length) throw ApiError.badRequest(`Rule ${r.ruleId} needs a field or anyOf.`, "INVALID_RULE");
  if (!["REQUIRED", "OPTIONAL"].includes(r.validationType)) throw ApiError.badRequest(`Rule ${r.ruleId} has an invalid validationType.`, "INVALID_RULE");
  if (!["LOW", "MEDIUM", "HIGH"].includes(r.severity)) throw ApiError.badRequest(`Rule ${r.ruleId} has an invalid severity.`, "INVALID_RULE");
  return {
    ruleId: r.ruleId, name: r.name, field: r.field, anyOf: r.anyOf,
    description: r.description, category: r.category,
    requirement: r.requirement || null,
    applicableTo: r.appliesTo && r.appliesTo.length ? r.appliesTo : undefined,
    validationType: r.validationType, severity: r.severity, active: r.active,
    source: r.source, sourceDocument: r.sourceDocument || null,
    sourcePage: r.sourcePage != null ? r.sourcePage : null,
    status: r.status || (r.active === false ? "inactive" : "active"),
    requiredFor: r.requiredFor,
  };
}

async function replaceAll(req, res) {
  const { rules } = req.body || {};
  if (!Array.isArray(rules) || !rules.length) throw ApiError.badRequest("A non-empty rules array is required.", "INVALID_RULE");
  res.json(await saveRules(rules.map(cleanOne)));
}

async function create(req, res) {
  const rules = await loadRules();
  const rule = cleanOne(req.body || {});
  if (rules.some((r) => (r.ruleId || r.id) === rule.ruleId)) {
    throw new ApiError(409, `Rule ${rule.ruleId} already exists.`, "RULE_EXISTS");
  }
  res.status(201).json(await saveRules([...rules.map((r) => cleanOne(r)), rule]));
}

async function update(req, res) {
  const rules = await loadRules();
  const idx = rules.findIndex((r) => (r.ruleId || r.id) === req.params.id);
  if (idx < 0) throw ApiError.notFound("Rule not found.", "RULE_NOT_FOUND");
  const merged = cleanOne({ ...normalizeRule(rules[idx]), ...req.body, ruleId: req.params.id });
  rules[idx] = merged;
  res.json(await saveRules(rules.map((r) => (r.ruleId ? r : cleanOne(r)))));
}

async function remove(req, res) {
  const rules = await loadRules();
  if (!rules.some((r) => (r.ruleId || r.id) === req.params.id)) throw ApiError.notFound("Rule not found.", "RULE_NOT_FOUND");
  res.json(await saveRules(rules.filter((r) => (r.ruleId || r.id) !== req.params.id).map((r) => (r.ruleId ? r : cleanOne(r)))));
}

function categories(req, res) {
  res.json(PRODUCT_CATEGORIES);
}

module.exports = { list, replaceAll, create, update, remove, categories };
