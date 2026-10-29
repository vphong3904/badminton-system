// middlewares/approvedOwner.js
const { query } = require('../config/db');
const AppError = require('../utils/AppError');
module.exports = async (req, res, next) => {
  const [h] = await query('SELECT TrangThaiDuyet FROM HoSoChuSan WHERE MaNguoiDung=?', [req.user.id]);
  if (!h || h.TrangThaiDuyet !== 'approved') throw new AppError('OWNER_NOT_APPROVED', 403, 'Hồ sơ chưa được duyệt');
  next();
};