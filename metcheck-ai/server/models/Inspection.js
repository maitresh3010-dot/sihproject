const mongoose = require("mongoose");

const inspectionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  inspectionId: String, // alias of id
  productId: { type: String, index: true },
  officer: { type: String, required: true, index: true },
  officerId: String, // alias of officer (email)
  officerName: String,
  category: { type: String, default: "general" },
  categoryLabel: String,
  image: String,
  images: [String],
  ocr_text: String,
  ocr_engine: String,
  ocr_words: [mongoose.Schema.Types.Mixed],
  ocr_image: mongoose.Schema.Types.Mixed,
  readability: mongoose.Schema.Types.Mixed,
  declarations: mongoose.Schema.Types.Mixed,
  checks: [mongoose.Schema.Types.Mixed],
  score: Number,
  status: String,
  verdict: String,
  missing: [String],
  passed: [String],
  failed: [String],
  manualReview: [String],
  scoreDetail: mongoose.Schema.Types.Mixed,
  quality: mongoose.Schema.Types.Mixed,
  comparison: mongoose.Schema.Types.Mixed,
  listing: mongoose.Schema.Types.Mixed,
  location: String,
  remarks: String,
  demo: { type: Boolean, default: false },
  stages: [String],
  note: String,
  createdAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.models.McInspection || mongoose.model("McInspection", inspectionSchema);
