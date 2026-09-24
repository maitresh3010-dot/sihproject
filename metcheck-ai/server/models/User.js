const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["ADMIN", "OFFICER", "VIEWER"], default: "OFFICER" },
  active: { type: Boolean, default: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.models.McUser || mongoose.model("McUser", userSchema);
