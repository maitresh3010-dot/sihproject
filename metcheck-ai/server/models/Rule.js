const mongoose = require("mongoose");

const ruleSchema = new mongoose.Schema({
  ruleId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  field: { type: String, default: null },
  anyOf: { type: [String], default: [] },
  description: { type: String, default: "" },
  requirement: { type: String, default: null },
  category: { type: String, default: "GENERAL" },
  applicableTo: { type: [String], default: [] },
  validationType: { type: String, enum: ["REQUIRED", "OPTIONAL"], default: "REQUIRED" },
  severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
  active: { type: Boolean, default: true },
  status: { type: String, default: "active" },
  source: { type: String, default: "Legal Metrology reference material" },
  sourceDocument: { type: String, default: null },
  sourcePage: { type: mongoose.Schema.Types.Mixed, default: null },
  requiredFor: { type: [String], default: [] },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.models.McRule || mongoose.model("McRule", ruleSchema);
