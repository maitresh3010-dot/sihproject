const express = require("express");
const { authRequired } = require("../middleware/auth");
const { asyncHandler } = require("../utils/errors");
const productController = require("../controllers/productController");

const router = express.Router();

router.get("/", authRequired, asyncHandler(productController.list));
router.get("/:id", authRequired, asyncHandler(productController.get));

module.exports = router;
