const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  productId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  manufacturer: { type: String, default: "" },
  category: { type: String, default: "general" },
  categoryLabel: { type: String, default: "" },
  inspectionCount: { type: Number, default: 0 },
  lastInspection: { type: String, default: null },
  lastStatus: { type: String, default: null },
  lastVerdict: { type: String, default: null },
  lastScore: { type: Number, default: null },
  avgScore: { type: Number, default: null },
  officer: { type: String, default: null },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.models.McProduct || mongoose.model("McProduct", productSchema);
