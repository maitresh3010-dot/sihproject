const express = require("express");
const { authRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const dashboardController = require("../controllers/dashboardController");

const router = express.Router();

// GET /api/dashboard — enforcement overview.
router.get("/", authRequired, asyncHandler(dashboardController.get));

module.exports = router;
