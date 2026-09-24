const mongoose = require("mongoose");

// A violation is a failed rule check on an inspection. Violations are stored
// embedded on the Inspection document (see checks with status "fail"); this
// schema documents the shape and is reused by reports.
const violationSchema = new mongoose.Schema({
  ruleId: String,
  name: String,
  field: String,
  severity: String,
  status: { type: String, default: "fail" },
  value: mongoose.Schema.Types.Mixed,
  confidence: Number,
  inspectionId: String,
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false });

module.exports = mongoose.models.McViolation || mongoose.model("McViolation", violationSchema);
module.exports.schema = violationSchema;
