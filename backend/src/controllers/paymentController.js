const dichVu = require('../services/paymentService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

exports.layQr = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.layQr(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
});

// Khách gửi ảnh chuyển khoản (multipart, trường `anhChuyenKhoan`).
exports.guiAnhChuyenKhoan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.guiAnhChuyenKhoan(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.file));
});
