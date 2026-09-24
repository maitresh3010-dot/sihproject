const mongoose = require("mongoose");

// Singleton document holding the configurable rule database.
const ruleSetSchema = new mongoose.Schema({
  _id: { type: String, default: "rules" },
  rules: [mongoose.Schema.Types.Mixed],
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.models.McRuleSet || mongoose.model("McRuleSet", ruleSetSchema);
