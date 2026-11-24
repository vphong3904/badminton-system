const fs = require('fs');
const dichVu = require('../services/adminService');
const dichVuThanhToan = require('../services/paymentService');
const dichVuKhieuNai = require('../services/complaintService');
const dichVuDanhGia = require('../services/reviewService');
const dichVuSuKienAdmin = require('../services/suKienAdminService');
const dichVuCongDong = require('../services/communityModerationService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');
const { phatCapNhatDatSan } = require('../realtime/datSan');
const { phatLichTheoSuKien } = require('../realtime/suKien');

const xuLy = (hamXuLy) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => thanhCong(phanHoi, await hamXuLy(yeuCau)));
const layMaQuanTri = (yeuCau) => yeuCau.nguoiDung.maNguoiDung;

exports.lietKeHoSoChoDuyet = xuLy(() => dichVu.lietKeHoSoChoDuyet());
exports.duyetHoSo = xuLy((yeuCau) =>
  dichVu.duyetHoSo(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung, yeuCau.body));
exports.lietKeThanhToanChoXacNhan = xuLy((yeuCau) => dichVu.lietKeThanhToanChoXacNhan(yeuCau.query));
exports.xacNhanThanhToan = xuLy(async (yeuCau) => { const r = await dichVuThanhToan.xacNhanThanhToan(layMaQuanTri(yeuCau), yeuCau.params.maDatSan, 'admin'); await phatCapNhatDatSan(yeuCau.params.maDatSan); return r; });
exports.tuChoiThanhToan = xuLy(async (yeuCau) => { const r = await dichVuThanhToan.tuChoiThanhToan(layMaQuanTri(yeuCau), yeuCau.params.maDatSan, yeuCau.body.lyDo, 'admin'); await phatCapNhatDatSan(yeuCau.params.maDatSan); return r; });
exports.lietKeHoanTien = xuLy(() => dichVu.lietKeHoanTien());
exports.xuLyHoanTien = xuLy((yeuCau) =>
  dichVu.xuLyHoanTien(layMaQuanTri(yeuCau), yeuCau.params.maThanhToan));
exports.hoanTatHoanTien = xuLy((yeuCau) =>
  dichVu.hoanTatHoanTien(layMaQuanTri(yeuCau), yeuCau.params.maThanhToan, yeuCau.file));
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
exports.khoaTaiKhoan = xuLy(async (yeuCau) => { const r = await dichVu.khoaTaiKhoan(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung, yeuCau.body); for (const id of (r.cacMaSuKien || [])) await phatLichTheoSuKien(id); return r; });
exports.moKhoaTaiKhoan = xuLy((yeuCau) =>
  dichVu.moKhoaTaiKhoan(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung));
exports.khoaCoSo = xuLy(async (yeuCau) => { const r = await dichVu.khoaCoSo(layMaQuanTri(yeuCau), yeuCau.params.maCoSo, yeuCau.body); for (const id of (r.cacMaSuKien || [])) await phatLichTheoSuKien(id); return r; });
exports.moKhoaCoSo = xuLy((yeuCau) =>
  dichVu.moKhoaCoSo(layMaQuanTri(yeuCau), yeuCau.params.maCoSo));
exports.lietKeCoSo = xuLy((yeuCau) => dichVu.lietKeCoSo(yeuCau.query));
exports.lietKeKhieuNai = xuLy((yeuCau) => dichVuKhieuNai.lietKeKhieuNai(yeuCau.query));
exports.thuHoiKhieuNai = xuLy((yeuCau) =>
  dichVuKhieuNai.thuHoiKhieuNai(layMaQuanTri(yeuCau), yeuCau.params.maKhieuNai, yeuCau.body));
exports.lietKeKhangNghi = xuLy((yeuCau) => dichVuKhieuNai.lietKeKhangNghi(yeuCau.query));
exports.xuLyKhangNghi = xuLy((yeuCau) =>
  dichVuKhieuNai.xuLyKhangNghi(layMaQuanTri(yeuCau), yeuCau.params.maKhangNghi, yeuCau.body));
exports.khoaDatMoi = xuLy((yeuCau) =>
  dichVuKhieuNai.datKhoaDatMoi(layMaQuanTri(yeuCau), yeuCau.params.maNguoiDung, yeuCau.body));
exports.xuLyKhieuNai = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  try {
    const ketQua = await dichVuKhieuNai.xuLyKhieuNai(
      layMaQuanTri(yeuCau), yeuCau.params.maKhieuNai, yeuCau.body, yeuCau.files || []);
    return thanhCong(phanHoi, ketQua);
  } catch (loi) {
    // Xử lý thất bại (đã xử lý rồi, 409…) → không để lại ảnh bằng chứng mồ côi.
    (yeuCau.files || []).forEach((tep) => fs.unlink(tep.path, () => {}));
    throw loi;
  }
});

// Quản lý đánh giá.
exports.lietKeDanhGia = xuLy((yeuCau) => dichVuDanhGia.lietKeDanhGiaQuanTri(yeuCau.query));
exports.anHienDanhGia = xuLy((yeuCau) =>
  dichVuDanhGia.anHienDanhGia(layMaQuanTri(yeuCau), yeuCau.params.maDanhGia, yeuCau.body));

// G7.12: quản lý báo cáo vi phạm và ẩn/bỏ ẩn sự kiện.
exports.lietKeBaoCaoSuKien = xuLy((req) => dichVuSuKienAdmin.lietKeBaoCaoSuKien(req.query));
exports.xuLyBaoCaoSuKien = xuLy((req) =>
  dichVuSuKienAdmin.xuLyBaoCaoSuKien(layMaQuanTri(req), req.params.maBaoCao, req.body));
exports.anSuKien = xuLy((req) =>
  dichVuSuKienAdmin.anSuKien(layMaQuanTri(req), req.params.maSuKien, req.body));
exports.boAnSuKien = xuLy((req) =>
  dichVuSuKienAdmin.boAnSuKien(layMaQuanTri(req), req.params.maSuKien));

// G8.5b: quản trị báo cáo và nội dung cộng đồng (API dùng tạm trước màn ADM G8.13).
exports.lietKeBaoCaoCongDong = xuLy((req) => dichVuCongDong.lietKeBaoCao(req.query));
exports.xuLyBaoCaoCongDong = xuLy((req) => dichVuCongDong.xuLyBaoCao(layMaQuanTri(req), req.params.maBaoCao, req.body));
exports.lietKeBaiCongDong = xuLy((req) => dichVuCongDong.lietKeNoiDung('player_post', req.query));
exports.lietKeDoiNhomCongDong = xuLy((req) => dichVuCongDong.lietKeNoiDung('team', req.query));
exports.anBaiCongDong = xuLy((req) => dichVuCongDong.thayDoiNoiDung(layMaQuanTri(req), 'player_post', req.params.maDoiTuong, 'an', req.body.lyDo));
exports.boAnBaiCongDong = xuLy((req) => dichVuCongDong.thayDoiNoiDung(layMaQuanTri(req), 'player_post', req.params.maDoiTuong, 'bo-an', null));
exports.xoaBaiCongDong = xuLy((req) => dichVuCongDong.thayDoiNoiDung(layMaQuanTri(req), 'player_post', req.params.maDoiTuong, 'xoa', req.body.lyDo));
exports.anDoiNhomCongDong = xuLy((req) => dichVuCongDong.thayDoiNoiDung(layMaQuanTri(req), 'team', req.params.maDoiTuong, 'an', req.body.lyDo));
exports.boAnDoiNhomCongDong = xuLy((req) => dichVuCongDong.thayDoiNoiDung(layMaQuanTri(req), 'team', req.params.maDoiTuong, 'bo-an', null));
exports.xoaDoiNhomCongDong = xuLy((req) => dichVuCongDong.thayDoiNoiDung(layMaQuanTri(req), 'team', req.params.maDoiTuong, 'xoa', req.body.lyDo));
