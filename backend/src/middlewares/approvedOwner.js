const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const xuLyBatDongBo = require('../utils/asyncHandler');

module.exports = xuLyBatDongBo(async (req, _res, next) => {
  const [[hoSo]] = await pool.query(
    'SELECT TrangThaiDuyet FROM HoSoChuSan WHERE MaNguoiDung=?',
    [req.nguoiDung.maNguoiDung]);
  if (!hoSo || hoSo.TrangThaiDuyet !== 'approved') {
    throw AppError.khongDuQuyen('Hồ sơ chưa được duyệt');
  }
  next();
});