const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "metrcheck_dev_secret_change_me";

const ROLES = ["ADMIN", "OFFICER", "VIEWER"];

// Permission matrix
const PERMISSIONS = {
  ADMIN: ["dashboard", "scan", "products", "inspections", "rules:manage", "reports", "users"],
  OFFICER: ["dashboard", "scan", "products", "inspections:own", "reports"],
  VIEWER: ["dashboard", "products", "inspections", "reports"],
};

function normalizeRole(r) {
  const up = String(r || "OFFICER").toUpperCase();
  return ROLES.includes(up) ? up : "OFFICER";
}

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, role: normalizeRole(user.role), name: user.name }, SECRET, { expiresIn: "7d" });
}
function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  try { req.user = jwt.verify(token, SECRET); req.user.role = normalizeRole(req.user.role); next(); }
  catch { return res.status(401).json({ error: "Session expired. Please sign in again.", code: "UNAUTHENTICATED" }); }
}
function roleRequired(...roles) {
  const want = roles.map(normalizeRole);
  return (req, res, next) => {
    if (!req.user || !want.includes(normalizeRole(req.user.role))) return res.status(403).json({ error: "Your role does not have permission for this action.", code: "FORBIDDEN" });
    next();
  };
}
function permRequired(...perms) {
  return (req, res, next) => {
    const mine = PERMISSIONS[normalizeRole(req.user && req.user.role)] || [];
    if (!perms.every((p) => mine.includes(p))) return res.status(403).json({ error: "Your role does not have permission for this action.", code: "FORBIDDEN" });
    next();
  };
}
// Inspection visibility: ADMIN all, OFFICER own, VIEWER all (read-only).
function visibleInspections(all, user) {
  if (!user) return [];
  if (normalizeRole(user.role) === "OFFICER") return all.filter((r) => r.officer === user.email);
  return all;
}
module.exports = { sign, authRequired, roleRequired, permRequired, normalizeRole, visibleInspections, ROLES, PERMISSIONS };
