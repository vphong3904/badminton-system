const dichVu = require('../services/ownerCustomerReportService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

const xuLy = (hamXuLy) => xuLyBatDongBo(async (yeuCau, phanHoi) =>
  thanhCong(phanHoi, await hamXuLy(yeuCau.nguoiDung.maNguoiDung, yeuCau.query)));

exports.layTongQuanKhach = xuLy(dichVu.layTongQuanKhach);
exports.lietKeKhach = xuLy(dichVu.lietKeKhach);
exports.layChiTietKhach = xuLy(dichVu.layChiTietKhach);
