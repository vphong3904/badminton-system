const dichVu = require('../services/qrCheckInService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

// Khách quét QR tại sân.
exports.checkInKhach = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.checkInBangQr(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body));
});

// Chủ sân: xem / đổi QR của sân, tải PNG, trang in.
exports.xemQr = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.xemQr(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maSan));
});
exports.doiQr = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.doiQr(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maSan));
});
// PNG / HTML trả thẳng (không bọc envelope); lỗi vẫn đi qua errorHandler thành JSON.
exports.anhQr = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const anh = await dichVu.taoAnhPng(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maSan);
  phanHoi.set({
    'Content-Type': 'image/png',
    'Content-Disposition': `attachment; filename="qr-check-in-san-${yeuCau.params.maSan}.png"`,
    'Cache-Control': 'no-store',
  });
  phanHoi.send(anh);
});
exports.trangInQr = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const html = await dichVu.taoTrangIn(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maSan, yeuCau.query.khoGiay);
  phanHoi.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  phanHoi.send(html);
});
exports.checkInThuCong = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.checkInThuCong(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body.lyDo));
});
