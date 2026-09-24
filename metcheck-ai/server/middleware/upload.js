const multer = require("multer");
const path = require("path");
const fs = require("fs");
const dir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(dir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname || ".jpg")}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/image\/(jpeg|png|webp|jpg)/.test(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files allowed"));
}});
module.exports = upload;
