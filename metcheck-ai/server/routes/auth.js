const express = require("express");
const { authRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/register", asyncHandler(authController.register));
router.post("/login", asyncHandler(authController.login));
router.get("/me", authRequired, authController.me);

module.exports = router;
