const reportController = require("./reportController");

// GET /api/dashboard — enforcement overview (alias shape of the report summary).
async function get(req, res) {
  return reportController.summary(req, res);
}

module.exports = { get };
