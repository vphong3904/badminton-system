const dichVu = require('../services/ownerBookingService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

exports.lietKeDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.lietKeDon(yeuCau.nguoiDung.maNguoiDung, yeuCau.query));
});
exports.layChiTietDon = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.layChiTietDon(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
});
