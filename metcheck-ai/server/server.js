require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { errorMiddleware, notFoundMiddleware } = require("./utils/errors");

const app = express();
// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// Restrictive CORS: comma-separated origins from env (defaults to the Vite dev client)
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
// Strip MongoDB operator injection ($, .) from request data
app.use(mongoSanitize());
// Brute-force protection on auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth", authLimiter);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "legalmet-server" }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/products", require("./routes/products"));
app.use("/api/inspections", require("./routes/inspections"));
app.use("/api/scans", require("./routes/scans"));
app.use("/api/rules", require("./routes/rules"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/dashboard", require("./routes/dashboard"));

app.use(notFoundMiddleware);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET) console.warn("WARNING: JWT_SECRET is not set — using an insecure dev default. Set it in server/.env.");

app.ready = require("./services/storage").init();
if (require.main === module) {
  app.ready.finally(() => app.listen(PORT, () => console.log(`LegalMet server on :${PORT}`)));
}

module.exports = app;
