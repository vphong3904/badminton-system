const AppError = require('../utils/AppError');

module.exports = (...cacVaiTro) => (yeuCau, _phanHoi, goiTiep) => {
  if (!cacVaiTro.includes(yeuCau.nguoiDung.vaiTro)) {
    throw new AppError(403, 'Không đủ quyền', 'FORBIDDEN');
  }
  goiTiep();
};