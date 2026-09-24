const mongoose = require("mongoose");

// Persisted report metadata. The full report content is built on demand by
// services/reportBuilder.js and cached here per inspection.
const reportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true, index: true },
  inspectionId: { type: String, required: true, index: true },
  generatedBy: String,
  format: { type: String, default: "json" },
  content: mongoose.Schema.Types.Mixed,
  createdAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.models.McReport || mongoose.model("McReport", reportSchema);
