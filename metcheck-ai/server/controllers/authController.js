const bcrypt = require("bcryptjs");
const storage = require("../services/storage");
const { sign, normalizeRole, ROLES } = require("../middleware/auth");
const { ApiError } = require("../utils/errors");

const safe = (u) => { const { password: _p, ...rest } = u; return rest; };

async function register(req, res) {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) throw ApiError.badRequest("Name, email and password are required.");
  if (await storage.findUserByEmail(email)) throw new ApiError(409, "This email is already registered.", "EMAIL_TAKEN");
  const hash = await bcrypt.hash(password, 10);
  const user = { id: `u_${Date.now()}`, name, email, role: normalizeRole(role), active: true, password: hash, createdAt: new Date().toISOString() };
  await storage.addUser(user);
  const s = safe(user);
  res.status(201).json({ user: s, token: sign(s) });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) throw ApiError.badRequest("Email and password are required.");
  let user;
  try {
    user = await storage.findUserByEmail(email);
  } catch {
    throw ApiError.unavailable("Account service is unavailable. Please try again.");
  }
  if (!user || !(await bcrypt.compare(password || "", user.password))) {
    throw new ApiError(401, "Incorrect email or password.", "INVALID_CREDENTIALS");
  }
  if (user.active === false) throw new ApiError(403, "Account deactivated. Contact an administrator.", "ACCOUNT_DISABLED");
  const s = safe(user);
  if (s.role !== normalizeRole(s.role)) { s.role = normalizeRole(s.role); await storage.updateUser(s.id, { role: s.role }); }
  res.json({ user: s, token: sign(s) });
}

function me(req, res) {
  res.json({ user: req.user, roles: ROLES });
}

module.exports = { register, login, me };
