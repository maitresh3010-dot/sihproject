const express = require("express");
const { authRequired, roleRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const upload = require("../middleware/upload");
const scanController = require("../controllers/scanController");

const router = express.Router();

// POST /api/scans — run the full compliance scan (analysis + saved inspection).
router.post("/", authRequired, roleRequired("ADMIN", "OFFICER"),
  upload.fields([{ name: "images", maxCount: 5 }, { name: "image", maxCount: 1 }]),
  asyncHandler(scanController.create));

// GET /api/scans/:id — fetch a completed scan result.
router.get("/:id", authRequired, asyncHandler(scanController.get));

module.exports = router;
