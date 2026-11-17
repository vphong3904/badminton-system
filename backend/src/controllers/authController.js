const dichVu = require('../services/authService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');
const { DANH_SACH_NGAN_HANG } = require('../utils/nganHang');
const AppError = require('../utils/AppError');

exports.dangKyKhachHang = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  daTao(phanHoi, await dichVu.dangKy('customer', yeuCau.body));
});
exports.dangKyChuSan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  daTao(phanHoi, await dichVu.dangKy('owner', yeuCau.body));
});
exports.layDanhSachNganHang = (_yeuCau, phanHoi) => thanhCong(phanHoi, DANH_SACH_NGAN_HANG);
exports.dangNhapDiDong = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.dangNhap(
    yeuCau.body.email, yeuCau.body.matKhau, ['customer']));
});
exports.dangNhapWeb = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.dangNhap(
    yeuCau.body.email, yeuCau.body.matKhau, ['owner', 'admin']));
});
exports.layThongTinCaNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.layNguoiDung(yeuCau.nguoiDung.maNguoiDung));
});
exports.capNhatThongTinCaNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.capNhatThongTin(yeuCau.nguoiDung.maNguoiDung, yeuCau.body));
});
exports.capNhatAnhDaiDien = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  if (!yeuCau.file) throw AppError.duLieuKhongHopLe('Thiếu tệp ảnh (trường "tepAnh")');
  thanhCong(phanHoi, await dichVu.capNhatAnhDaiDien(yeuCau.nguoiDung.maNguoiDung, yeuCau.file));
});
exports.doiMatKhau = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  await dichVu.doiMatKhau(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.body.matKhauCu, yeuCau.body.matKhauMoi);
  thanhCong(phanHoi, { thongBao: 'Đổi mật khẩu thành công' });
});
