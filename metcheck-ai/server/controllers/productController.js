const storage = require("../services/storage");
const productService = require("../services/productService");
const { ApiError } = require("../utils/errors");

async function list(req, res) {
  res.json(await productService.list({ q: req.query.q }));
}

async function get(req, res) {
  const { product, history } = await productService.getWithHistory(req.params.id);
  res.json({ ...product, history });
}

module.exports = { list, get };
