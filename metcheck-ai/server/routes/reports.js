const express = require("express");
const { authRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const reportController = require("../controllers/reportController");

const router = express.Router();

router.get("/summary", authRequired, asyncHandler(reportController.summary));
router.get("/export.csv", authRequired, asyncHandler(reportController.exportCsv));
router.get("/:id", authRequired, asyncHandler(reportController.get));

module.exports = router;
