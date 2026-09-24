const express = require("express");
const { authRequired, roleRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const ruleController = require("../controllers/ruleController");

const router = express.Router();

router.get("/categories", authRequired, ruleController.categories);
router.get("/", authRequired, roleRequired("ADMIN"), asyncHandler(ruleController.list));
router.post("/", authRequired, roleRequired("ADMIN"), asyncHandler(ruleController.create));
router.put("/", authRequired, roleRequired("ADMIN"), asyncHandler(ruleController.replaceAll));
router.put("/:id", authRequired, roleRequired("ADMIN"), asyncHandler(ruleController.update));
router.delete("/:id", authRequired, roleRequired("ADMIN"), asyncHandler(ruleController.remove));

module.exports = router;
