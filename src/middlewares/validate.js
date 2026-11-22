const AppError = require('../utils/AppError');

module.exports = (cacLuocDo) => (req, _res, next) => {
  for (const tenPhanDuLieu of ['body', 'query', 'params']) {
    if (!cacLuocDo[tenPhanDuLieu]) continue;
    const ketQua = cacLuocDo[tenPhanDuLieu].safeParse(req[tenPhanDuLieu]);
    if (!ketQua.success) {
      const chiTiet = ketQua.error.issues.map((loi) => ({
        truong: loi.path.join('.'),
        thongBao: loi.message,
      }));
      return next(AppError.duLieuKhongHopLe('Dữ liệu không hợp lệ', chiTiet));
    }
    Object.defineProperty(req, tenPhanDuLieu, {
      value: ketQua.data,
      writable: true,
      configurable: true,
    });
  }
  next();
};
