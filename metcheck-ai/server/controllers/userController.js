const bcrypt = require("bcryptjs");
const storage = require("../services/storage");
const { normalizeRole, ROLES } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");

const safe = (u) => { const { password: _p, ...rest } = u; return { active: rest.active !== false, ...rest }; };

async function list(req, res) {
  res.json((await storage.listUsers()).map((u) => ({ ...safe(u), role: normalizeRole(u.role) })));
}

async function create(req, res) {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) throw ApiError.badRequest("Name, email and password are required.");
  if (await storage.findUserByEmail(email)) throw new ApiError(409, "This email is already registered.", "EMAIL_TAKEN");
  const hash = await bcrypt.hash(password, 10);
  const user = { id: `u_${Date.now()}`, name, email, role: normalizeRole(role), active: true, password: hash, createdAt: new Date().toISOString() };
  await storage.addUser(user);
  res.status(201).json(safe(user));
}

async function update(req, res) {
  if (req.user.id === req.params.id && req.body.role) throw ApiError.badRequest("You cannot change your own role.");
  const patch = {};
  if (req.body.role) {
    if (!ROLES.includes(String(req.body.role).toUpperCase())) throw ApiError.badRequest(`Role must be one of: ${ROLES.join(", ")}.`, "INVALID_ROLE");
    patch.role = normalizeRole(req.body.role);
  }
  if (typeof req.body.active === "boolean") {
    if (req.user.id === req.params.id) throw ApiError.badRequest("You cannot deactivate yourself.");
    patch.active = req.body.active;
  }
  const u = await storage.updateUser(req.params.id, patch);
  if (!u) throw ApiError.notFound("User not found.", "USER_NOT_FOUND");
  res.json(safe(u));
}

async function remove(req, res) {
  if (req.user.id === req.params.id) throw ApiError.badRequest("You cannot delete yourself.");
  const ok = await storage.deleteUser(req.params.id);
  if (!ok) throw ApiError.notFound("User not found.", "USER_NOT_FOUND");
  res.json({ ok: true });
}

module.exports = { list, create, update, remove };
