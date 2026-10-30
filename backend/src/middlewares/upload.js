const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/AppError');

const thuMucTepTaiLen = path.join(__dirname, '../../uploads');
const storage = multer.diskStorage({
  destination: thuMucTepTaiLen,
  filename: (_req, tep, goiLai) =>
    goiLai(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(tep.originalname).toLowerCase()}`),
});

const taiTep = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, tep, goiLai) =>
    /^image\/(jpe?g|png|webp)$/.test(tep.mimetype) ? goiLai(null, true) : goiLai(AppError.duLieuKhongHopLe('Chỉ nhận ảnh jpg/png/webp')),
});

const layDuongDanTep = (tep) => (tep ? `/tep-tai-len/${tep.filename}` : null);
module.exports = { taiTep, layDuongDanTep, thuMucTepTaiLen };
