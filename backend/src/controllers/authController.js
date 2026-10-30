const dichVu = require('../services/authService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');

exports.dangKyKhachHang = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  daTao(phanHoi, await dichVu.dangKy('customer', yeuCau.body));
});
exports.dangKyChuSan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  daTao(phanHoi, await dichVu.dangKy('owner', yeuCau.body));
});
exports.dangNhapDiDong = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.dangNhap(
    yeuCau.body.tenDangNhap, yeuCau.body.matKhau, ['customer']));
});
exports.dangNhapWeb = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.dangNhap(
    yeuCau.body.tenDangNhap, yeuCau.body.matKhau, ['owner', 'admin']));
});
exports.layThongTinCaNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.layNguoiDung(yeuCau.nguoiDung.maNguoiDung));
});
exports.capNhatThongTinCaNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.capNhatThongTin(yeuCau.nguoiDung.maNguoiDung, yeuCau.body));
});
exports.doiMatKhau = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  await dichVu.doiMatKhau(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.body.matKhauCu, yeuCau.body.matKhauMoi);
  thanhCong(phanHoi, { thongBao: 'Đổi mật khẩu thành công' });
});
