const dichVu = require('../services/ownerBookingService');
const dichVuThanhToan = require('../services/paymentService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');
const { phatCapNhatDatSan, phatNhieuCapNhatDatSan } = require('../realtime/datSan');

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
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maThanhToan, yeuCau.file)); // ảnh chứng từ (field anhChungTu)
});
// Khách gửi ảnh chuyển khoản → chủ sân xem ảnh ở chi tiết đơn rồi xác nhận hoặc từ chối.
exports.xacNhanThanhToan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const r = await dichVuThanhToan.xacNhanThanhToan(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, 'owner');
  await phatCapNhatDatSan(yeuCau.params.maDatSan); thanhCong(phanHoi, r);
});
exports.tuChoiThanhToan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const r = await dichVuThanhToan.tuChoiThanhToan(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body.lyDo, 'owner');
  await phatCapNhatDatSan(yeuCau.params.maDatSan); thanhCong(phanHoi, r);
});

// Chủ sân tạo đơn cho khách đặt tại chỗ / khách cố định (Nguon='owner', xác nhận ngay, không qua QR).
exports.taoDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const r = await dichVu.taoDon(yeuCau.nguoiDung.maNguoiDung, yeuCau.body);
  await phatNhieuCapNhatDatSan((r.cacDon || []).map(x => x.maDatSan)); daTao(phanHoi, r);
});

// Chủ sân huỷ đơn đã đặt: khách được hoàn 100% (vào hàng đợi hoàn tiền của chủ sân).
exports.huyDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const r = await dichVu.huyDon(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body.lyDo);
  await phatCapNhatDatSan(yeuCau.params.maDatSan); thanhCong(phanHoi, r);
});

// Đơn chủ sân tự tạo: đánh dấu đã thu tiền ngoài hệ thống / huỷ (không hoàn tiền).
exports.daThuDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const r = await dichVu.danhDauDaThu(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.query.tatCaBuoi === true);
  await phatCapNhatDatSan(yeuCau.params.maDatSan); thanhCong(phanHoi, r);
});
exports.huyDonOwner = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const r = await dichVu.huyDonOwner(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, { lyDo: yeuCau.body.lyDo, tatCaBuoi: yeuCau.query.tatCaBuoi === true });
  await phatCapNhatDatSan(yeuCau.params.maDatSan); thanhCong(phanHoi, r);
});
