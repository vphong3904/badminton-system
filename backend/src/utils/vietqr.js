const cauHinh = require('../config/env');
const AppError = require('./AppError');

// Thông tin tài khoản nhận tiền hiển thị cho khách (lấy từ .env).
function layTaiKhoanNhan() {
  if (!cauHinh.nganHang.maNganHang || !cauHinh.nganHang.soTaiKhoan) {
    throw new AppError(503, 'Chưa cấu hình tài khoản nhận thanh toán', 'PAYMENT_NOT_CONFIGURED');
  }
  return cauHinh.nganHang;
}

// Ảnh QR VietQR (img.vietqr.io, không cần khoá API): mở app ngân hàng quét là tự điền
// số tài khoản, số tiền và nội dung chuyển khoản.
function taoAnhQrUrl(noiDungChuyenKhoan, soTien) {
  const taiKhoan = layTaiKhoanNhan();
  const url = new URL(
    `https://img.vietqr.io/image/${encodeURIComponent(taiKhoan.maNganHang)}-${encodeURIComponent(taiKhoan.soTaiKhoan)}-compact2.png`);
  url.searchParams.set('amount', String(soTien));
  url.searchParams.set('addInfo', noiDungChuyenKhoan);
  if (taiKhoan.chuTaiKhoan) url.searchParams.set('accountName', taiKhoan.chuTaiKhoan);
  return url.toString();
}

module.exports = { taoAnhQrUrl, layTaiKhoanNhan };
