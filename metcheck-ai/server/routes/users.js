const express = require("express");
const { authRequired, roleRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/", authRequired, roleRequired("ADMIN"), asyncHandler(userController.list));
router.post("/", authRequired, roleRequired("ADMIN"), asyncHandler(userController.create));
router.put("/:id", authRequired, roleRequired("ADMIN"), asyncHandler(userController.update));
router.delete("/:id", authRequired, roleRequired("ADMIN"), asyncHandler(userController.remove));

module.exports = router;
