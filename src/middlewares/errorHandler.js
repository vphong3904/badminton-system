const AppError = require('../utils/AppError');
const cauHinh = require('../config/env');

const khongTimThayDuongDan = (yeuCau, _phanHoi, goiTiep) => {
  goiTiep(AppError.khongTimThay(`Không tìm thấy đường dẫn ${yeuCau.method} ${yeuCau.originalUrl}`));
};

// Lỗi kết nối/ngắt/quá tải MySQL: báo 503 thay vì 500 chung chung.
const MA_LOI_CSDL_KHONG_SAN_SANG = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'EPIPE',
  'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ER_CON_COUNT_ERROR', 'ER_SERVER_SHUTDOWN', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR',
]);

const xuLyLoi = (loi, _yeuCau, phanHoi, _goiTiep) => {
  let loiHienThi = loi;
  if (loi.code === 'ER_DUP_ENTRY') loiHienThi = AppError.biTrung('Dữ liệu đã tồn tại');
  else if (loi.code === 'LIMIT_FILE_SIZE') loiHienThi = AppError.duLieuKhongHopLe('Tệp quá lớn (tối đa 5MB)');
  else if (MA_LOI_CSDL_KHONG_SAN_SANG.has(loi.code)) {
    console.error('Cơ sở dữ liệu không sẵn sàng:', loi.code, loi.message);
    loiHienThi = AppError.khongSanSang();
  } else if (loi.type === 'entity.parse.failed') loiHienThi = AppError.duLieuKhongHopLe('JSON không hợp lệ');
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
