const AppError = require('../utils/AppError');
const cauHinh = require('../config/env');

const khongTimThayDuongDan = (yeuCau, _phanHoi, goiTiep) => {
  goiTiep(AppError.khongTimThay(`Không tìm thấy đường dẫn ${yeuCau.method} ${yeuCau.originalUrl}`));
};

const xuLyLoi = (loi, _yeuCau, phanHoi, _goiTiep) => {
  let loiHienThi = loi;
  if (loi.code === 'ER_DUP_ENTRY') loiHienThi = AppError.biTrung('Dữ liệu đã tồn tại');
  else if (loi.code === 'LIMIT_FILE_SIZE') loiHienThi = AppError.duLieuKhongHopLe('Tệp quá lớn (tối đa 5MB)');
  else if (loi.type === 'entity.parse.failed') loiHienThi = AppError.duLieuKhongHopLe('JSON không hợp lệ');
  if (!(loiHienThi instanceof AppError)) {
    console.error(loi);
    loiHienThi = new AppError(500, 'Lỗi máy chủ', 'INTERNAL');
  }
  phanHoi.status(loiHienThi.maTrangThai).json({
    thanhCong: false,
    loi: {
      maLoi: loiHienThi.maLoi,
      thongBao: loiHienThi.message,
      chiTiet: loiHienThi.chiTiet,
      ...(cauHinh.moiTruong !== 'production' && loiHienThi.maTrangThai === 500
        ? { nganXep: loi.stack }
        : {}),
    },
  });
};

module.exports = { khongTimThayDuongDan, xuLyLoi };
