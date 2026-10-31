const cauHinh = require('../config/env');
const AppError = require('./AppError');

function taoAnhQrUrl(noiDungChuyenKhoan, soTien) {
  if (!cauHinh.sepayTaiKhoan || !cauHinh.sepayNganHang) {
    throw new AppError(503, 'Chưa cấu hình tài khoản nhận thanh toán SePay', 'PAYMENT_NOT_CONFIGURED');
  }
  const thamSo = new URLSearchParams({
    acc: cauHinh.sepayTaiKhoan,
    bank: cauHinh.sepayNganHang,
    amount: String(soTien),
    des: noiDungChuyenKhoan,
  });
  return `https://qr.sepay.vn/img?${thamSo.toString()}`;
}

module.exports = { taoAnhQrUrl };
