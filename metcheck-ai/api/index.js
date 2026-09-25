const app = require("../server/server");

module.exports = async (req, res) => {
  await app.ready;
  return app(req, res);
};