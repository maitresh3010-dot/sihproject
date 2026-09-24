/**
 * Storage abstraction: MongoDB (via Mongoose) when MONGO_URI is configured
 * and reachable, otherwise JSON-file storage. Same async API either way.
 */
const mongoose = require("mongoose");
const { readJson, writeJson, dataFile } = require("../utils/store");
const McUser = require("../models/User");
const McInspection = require("../models/Inspection");
const McRuleSet = require("../models/RuleSet");
const McRule = require("../models/Rule");
const McProduct = require("../models/Product");
const McReport = require("../models/Report");

let mongoReady = false;

async function init() {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.log("MONGO_URI not set — using file storage."); return; }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    mongoReady = true;
    console.log("Connected to MongoDB.");
  } catch (e) {
    mongoReady = false;
    console.log(`MongoDB unreachable (${e.message}) — using file storage.`);
  }
}

const useMongo = () => mongoReady && mongoose.connection.readyState === 1;

// ---- Users ----
async function listUsers() {
  if (useMongo()) return McUser.find({}).lean();
  return readJson(dataFile("users.json"), []);
}
async function findUserByEmail(email) {
  if (useMongo()) return McUser.findOne({ email: String(email).toLowerCase() }).lean();
  return readJson(dataFile("users.json"), []).find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}
async function addUser(user) {
  if (useMongo()) { await McUser.create(user); return user; }
  const users = readJson(dataFile("users.json"), []);
  users.push(user); writeJson(dataFile("users.json"), users);
  return user;
}
async function updateUser(id, patch) {
  if (useMongo()) return McUser.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean();
  const users = readJson(dataFile("users.json"), []);
  const i = users.findIndex((u) => u.id === id);
  if (i < 0) return null;
  users[i] = { ...users[i], ...patch };
  writeJson(dataFile("users.json"), users);
  return users[i];
}
async function deleteUser(id) {
  if (useMongo()) { const r = await McUser.deleteOne({ id }); return r.deletedCount > 0; }
  const users = readJson(dataFile("users.json"), []);
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  writeJson(dataFile("users.json"), next);
  return true;
}

// ---- Inspections ----
async function listInspections() {
  if (useMongo()) return McInspection.find({}).sort({ createdAt: -1 }).lean();
  return readJson(dataFile("inspections.json"), []);
}
async function addInspection(rec) {
  if (useMongo()) { await McInspection.create(rec); return rec; }
  const all = readJson(dataFile("inspections.json"), []);
  all.unshift(rec); writeJson(dataFile("inspections.json"), all);
  return rec;
}
async function findInspection(id) {
  if (useMongo()) return McInspection.findOne({ id }).lean();
  return readJson(dataFile("inspections.json"), []).find((r) => r.id === id) || null;
}
async function deleteInspection(id) {
  if (useMongo()) { const r = await McInspection.deleteOne({ id }); return r.deletedCount > 0; }
  const all = readJson(dataFile("inspections.json"), []);
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  writeJson(dataFile("inspections.json"), next);
  return true;
}
async function updateInspection(id, patch) {
  if (useMongo()) return McInspection.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean();
  const all = readJson(dataFile("inspections.json"), []);
  const i = all.findIndex((r) => r.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch };
  writeJson(dataFile("inspections.json"), all);
  return all[i];
}

// ---- Rules (per-rule documents in MongoDB, array in file mode) ----
async function getCustomRules() {
  if (useMongo()) {
    const docs = await McRule.find({}).sort({ ruleId: 1 }).lean();
    return docs.length ? docs.map(({ _id, __v, ...r }) => r) : null;
  }
  return readJson(dataFile("rules.json"), null);
}
async function setCustomRules(rules) {
  if (useMongo()) {
    await McRule.deleteMany({});
    if (rules.length) await McRule.insertMany(rules.map((r) => ({ ...r, updatedAt: new Date().toISOString() })));
    return rules;
  }
  writeJson(dataFile("rules.json"), rules);
  return rules;
}

// ---- Products ----
async function listProducts() {
  if (useMongo()) return McProduct.find({}).sort({ updatedAt: -1 }).lean();
  return readJson(dataFile("products.json"), []);
}
async function upsertProduct(product) {
  if (useMongo()) {
    await McProduct.findOneAndUpdate({ productId: product.productId }, { $set: product }, { upsert: true });
    return product;
  }
  const all = readJson(dataFile("products.json"), []);
  const i = all.findIndex((p) => p.productId === product.productId);
  if (i < 0) all.push(product); else all[i] = product;
  writeJson(dataFile("products.json"), all);
  return product;
}
async function findProduct(productId) {
  if (useMongo()) return McProduct.findOne({ productId }).lean();
  return readJson(dataFile("products.json"), []).find((p) => p.productId === productId) || null;
}

// ---- Reports ----
async function getReport(inspectionId) {
  if (useMongo()) return McReport.findOne({ inspectionId }).sort({ createdAt: -1 }).lean();
  const all = readJson(dataFile("reports.json"), []);
  return [...all].reverse().find((r) => r.inspectionId === inspectionId) || null;
}
async function saveReport(report) {
  if (useMongo()) { await McReport.create(report); return report; }
  const all = readJson(dataFile("reports.json"), []);
  all.push(report); writeJson(dataFile("reports.json"), all);
  return report;
}

module.exports = {
  init, useMongo,
  listUsers, findUserByEmail, addUser, updateUser, deleteUser,
  listInspections, addInspection, findInspection, deleteInspection, updateInspection,
  getCustomRules, setCustomRules,
  listProducts, upsertProduct, findProduct,
  getReport, saveReport,
};
