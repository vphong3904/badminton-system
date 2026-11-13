const dichVu = require('../services/ownerBookingService');
const dichVuThanhToan = require('../services/paymentService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');

exports.lietKeDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.lietKeDon(yeuCau.nguoiDung.maNguoiDung, yeuCau.query));
});
exports.layChiTietDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.layChiTietDon(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
});
// Hoàn tiền khách huỷ đơn: chủ sân xem yêu cầu, tự chuyển khoản, rồi bấm hoàn thành.
exports.lietKeHoanTien = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.lietKeHoanTien(yeuCau.nguoiDung.maNguoiDung, yeuCau.query.trangThai));
});
exports.hoanThanhHoanTien = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.hoanThanhHoanTien(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maThanhToan, yeuCau.body.maGiaoDichHoan));
});
// Khách gửi ảnh chuyển khoản → chủ sân xem ảnh ở chi tiết đơn rồi xác nhận hoặc từ chối.
exports.xacNhanThanhToan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVuThanhToan.xacNhanThanhToan(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, 'owner'));
});
exports.tuChoiThanhToan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVuThanhToan.tuChoiThanhToan(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body.lyDo, 'owner'));
});

// Chủ sân tạo đơn cho khách đặt tại chỗ / khách cố định (Nguon='owner', xác nhận ngay, không qua QR).
exports.taoDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  daTao(phanHoi, await dichVu.taoDon(yeuCau.nguoiDung.maNguoiDung, yeuCau.body));
});
