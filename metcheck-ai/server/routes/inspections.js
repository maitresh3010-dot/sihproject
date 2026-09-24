const express = require("express");
const { authRequired, roleRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const upload = require("../middleware/upload");
const inspectionController = require("../controllers/inspectionController");
const scanController = require("../controllers/scanController");

const router = express.Router();
const scanUpload = upload.fields([{ name: "images", maxCount: 5 }, { name: "image", maxCount: 1 }]);

// Legacy alias: run-and-save scan (prefer POST /api/scans).
router.post("/scan", authRequired, roleRequired("ADMIN", "OFFICER"), scanUpload, asyncHandler(scanController.create));

router.get("/", authRequired, asyncHandler(inspectionController.list));
router.post("/", authRequired, roleRequired("ADMIN", "OFFICER"), asyncHandler(inspectionController.create));
router.get("/:id", authRequired, asyncHandler(inspectionController.get));
router.put("/:id", authRequired, roleRequired("ADMIN", "OFFICER"), asyncHandler(inspectionController.update));
router.delete("/:id", authRequired, roleRequired("ADMIN", "OFFICER"), asyncHandler(inspectionController.remove));

module.exports = router;
