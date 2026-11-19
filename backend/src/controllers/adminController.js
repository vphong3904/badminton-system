const dichVu = require('../services/adminService');
const dichVuThanhToan = require('../services/paymentService');
const dichVuKhieuNai = require('../services/complaintService');
const dichVuDanhGia = require('../services/reviewService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

const xuLy = (hamXuLy) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => thanhCong(phanHoi, await hamXuLy(yeuCau)));
const layMaQuanTri = (yeuCau) => yeuCau.nguoiDung.maNguoiDung;

exports.lietKeHoSoChoDuyet = xuLy(() => dichVu.lietKeHoSoChoDuyet());
exports.duyetHoSo = xuLy((yeuCau) =>
  dichVu.duyetHoSo(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung, yeuCau.body));
exports.lietKeThanhToanChoXacNhan = xuLy(() => dichVu.lietKeThanhToanChoXacNhan());
exports.xacNhanThanhToan = xuLy((yeuCau) =>
  dichVuThanhToan.xacNhanThanhToan(layMaQuanTri(yeuCau), yeuCau.params.maDatSan, 'admin'));
exports.tuChoiThanhToan = xuLy((yeuCau) =>
  dichVuThanhToan.tuChoiThanhToan(
    layMaQuanTri(yeuCau), yeuCau.params.maDatSan, yeuCau.body.lyDo, 'admin'));
exports.lietKeHoanTien = xuLy(() => dichVu.lietKeHoanTien());
exports.xuLyHoanTien = xuLy((yeuCau) =>
  dichVu.xuLyHoanTien(layMaQuanTri(yeuCau), yeuCau.params.maThanhToan));
exports.hoanTatHoanTien = xuLy((yeuCau) =>
  dichVu.hoanTatHoanTien(
    layMaQuanTri(yeuCau), yeuCau.params.maThanhToan, yeuCau.body.maGiaoDichHoan));
const dichVuSanCoSo = require('../services/sanCoSoService');
const nguoi = (yeuCau) => ({ maNguoiDung: layMaQuanTri(yeuCau), vaiTro: 'admin' });
exports.dongSan = xuLy((yeuCau) => dichVuSanCoSo.dongSan(nguoi(yeuCau), yeuCau.params.maSan, yeuCau.body.lyDo));
exports.moSan = xuLy((yeuCau) => dichVuSanCoSo.moSan(nguoi(yeuCau), yeuCau.params.maSan));
exports.xoaSan = xuLy((yeuCau) => dichVuSanCoSo.xoaSan(nguoi(yeuCau), yeuCau.params.maSan, yeuCau.body.lyDo));
exports.dongCoSo = xuLy((yeuCau) => dichVuSanCoSo.dongCoSo(nguoi(yeuCau), yeuCau.params.maCoSo, yeuCau.body.lyDo));
exports.moCoSo = xuLy((yeuCau) => dichVuSanCoSo.moCoSo(nguoi(yeuCau), yeuCau.params.maCoSo));
exports.xoaCoSo = xuLy((yeuCau) => dichVuSanCoSo.xoaCoSo(nguoi(yeuCau), yeuCau.params.maCoSo, yeuCau.body.lyDo));
exports.lietKeNhatKy = xuLy((yeuCau) => dichVu.lietKeNhatKy(yeuCau.query));

// Quản lý tài khoản khách / chủ sân.
exports.lietKeNguoiDung = xuLy((yeuCau) => dichVu.lietKeNguoiDung(yeuCau.query));
exports.khoaTaiKhoan = xuLy((yeuCau) =>
  dichVu.khoaTaiKhoan(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung, yeuCau.body));
exports.moKhoaTaiKhoan = xuLy((yeuCau) =>
  dichVu.moKhoaTaiKhoan(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung));
exports.lietKeCoSo = xuLy((yeuCau) => dichVu.lietKeCoSo(yeuCau.query));
exports.lietKeKhieuNai = xuLy((yeuCau) => dichVuKhieuNai.lietKeKhieuNai(yeuCau.query));
exports.xuLyKhieuNai = xuLy((yeuCau) =>
  dichVuKhieuNai.xuLyKhieuNai(layMaQuanTri(yeuCau), yeuCau.params.maKhieuNai, yeuCau.body));

// Quản lý đánh giá.
exports.lietKeDanhGia = xuLy((yeuCau) => dichVuDanhGia.lietKeDanhGiaQuanTri(yeuCau.query));
exports.anHienDanhGia = xuLy((yeuCau) =>
  dichVuDanhGia.anHienDanhGia(layMaQuanTri(yeuCau), yeuCau.params.maDanhGia, yeuCau.body));
