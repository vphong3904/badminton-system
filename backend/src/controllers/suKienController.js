const dichVuChu = require('../services/ownerSuKienService');
const dichVuKhach = require('../services/suKienKhachService');
const dichVuAdmin = require('../services/suKienAdminService');
const dichVuCongDong = require('../services/communityModerationService');
const { phatLichTheoSuKien, layLichSuKien } = require('../realtime/suKien');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');

// Chủ sân
exports.lietKeCuaChu = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.lietKeSuKien(req.nguoiDung.maNguoiDung, req.query));
});
exports.tao = xuLyBatDongBo(async (req, res) => {
  const r = await dichVuChu.taoSuKien(req.nguoiDung.maNguoiDung, req.body);
  await phatLichTheoSuKien(r.maSuKien); daTao(res, r);
});
exports.chiTietCuaChu = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.layChiTietCuaChu(req.nguoiDung.maNguoiDung, req.params.maSuKien));
});
exports.sua = xuLyBatDongBo(async (req, res) => {
  const lichCu = await layLichSuKien(req.params.maSuKien);
  const r = await dichVuChu.suaSuKien(req.nguoiDung.maNguoiDung, req.params.maSuKien, req.body);
  if (lichCu) await phatLichTheoSuKien(req.params.maSuKien, lichCu);
  await phatLichTheoSuKien(req.params.maSuKien); thanhCong(res, r);
});
exports.capNhatAnhBia = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.capNhatAnhBia(req.nguoiDung.maNguoiDung, req.params.maSuKien, req.file));
});
exports.dong = xuLyBatDongBo(async (req, res) => {
  const r = await dichVuChu.dongSuKien(req.nguoiDung.maNguoiDung, req.params.maSuKien);
  await phatLichTheoSuKien(req.params.maSuKien); thanhCong(res, r);
});
exports.mo = xuLyBatDongBo(async (req, res) => {
  const r = await dichVuChu.moLaiSuKien(req.nguoiDung.maNguoiDung, req.params.maSuKien);
  await phatLichTheoSuKien(req.params.maSuKien); thanhCong(res, r);
});
exports.huy = xuLyBatDongBo(async (req, res) => {
  const r = await dichVuChu.huySuKien(req.nguoiDung.maNguoiDung, req.params.maSuKien, req.body.lyDo);
  await phatLichTheoSuKien(req.params.maSuKien); thanhCong(res, r);
});
exports.lietKeDangKy = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.lietKeDangKy(
    req.nguoiDung.maNguoiDung, req.params.maSuKien, req.query));
});
exports.chapNhanDangKy = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.chapNhanDangKy(req.nguoiDung.maNguoiDung, req.params.maDangKy));
});
exports.tuChoiDangKy = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.tuChoiDangKy(
    req.nguoiDung.maNguoiDung, req.params.maDangKy, req.body.lyDo));
});
exports.loaiDangKy = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.loaiDangKy(
    req.nguoiDung.maNguoiDung, req.params.maDangKy, req.body.lyDo));
});
exports.xacNhanThanhToan = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.xacNhanThanhToan(req.nguoiDung.maNguoiDung, req.params.maDangKy));
});
exports.tuChoiThanhToan = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.tuChoiThanhToan(
    req.nguoiDung.maNguoiDung, req.params.maDangKy, req.body.lyDo));
});
exports.hoanPhi = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuChu.danhDauDaHoanPhi(req.nguoiDung.maNguoiDung, req.params.maDangKy));
});

// Khách
exports.lietKeCongKhai = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuKhach.lietKeSuKien(req.query));
});
exports.chiTietCongKhai = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuKhach.docChiTiet(req.nguoiDung.maNguoiDung, req.params.maSuKien));
});
exports.dangKy = xuLyBatDongBo(async (req, res) => {
  daTao(res, await dichVuKhach.dangKySuKien(
    req.nguoiDung.maNguoiDung, req.params.maSuKien, req.body));
});
exports.rutDangKy = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuKhach.rutDangKy(req.nguoiDung.maNguoiDung, req.params.maDangKy));
});
exports.dangKyCuaToi = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuKhach.lietKeDangKyCuaToi(req.nguoiDung.maNguoiDung, req.query));
});
exports.hoaDon = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuKhach.layHoaDonSuKien(req.nguoiDung.maNguoiDung, req.params.maDangKy));
});
exports.guiChungTu = xuLyBatDongBo(async (req, res) => {
  thanhCong(res, await dichVuKhach.guiChungTuSuKien(
    req.nguoiDung.maNguoiDung, req.params.maDangKy, req.file, req.body));
});

// G7.12: khách gửi báo cáo vi phạm sự kiện.
exports.baoCao = xuLyBatDongBo(async (req, res) => {
  const loai = req.body.loaiDoiTuong || 'event';
  if (loai === 'player_post' || loai === 'team') {
    return daTao(res, await dichVuCongDong.taoBaoCao(req.nguoiDung.maNguoiDung, { ...req.body, loaiDoiTuong: loai, maDoiTuong: req.body.maDoiTuong }));
  }
  daTao(res, await dichVuAdmin.taoBaoCaoSuKien(req.nguoiDung.maNguoiDung, { ...req.body, maSuKien: req.body.maSuKien || req.body.maDoiTuong }));
});
