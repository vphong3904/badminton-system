const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/AppError');

const dir = path.join(__dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: dir,
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^image\/(jpe?g|png|webp)$/.test(file.mimetype) ? cb(null, true) : cb(AppError.badRequest('Chỉ nhận ảnh jpg/png/webp')),
});

const fileUrl = (file) => (file ? `/uploads/${file.filename}` : null);
module.exports = { upload, fileUrl, uploadDir: dir };
