const dichVu = require('../services/notificationService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');

const xuLy = (hamXuLy) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => thanhCong(phanHoi, await hamXuLy(yeuCau)));

exports.lietKe = xuLy((yeuCau) => dichVu.lietKe(yeuCau.nguoiDung.maNguoiDung, yeuCau.query));
exports.demChuaDoc = xuLy((yeuCau) => dichVu.demChuaDoc(yeuCau.nguoiDung.maNguoiDung));
exports.danhDauDaDoc = xuLy((yeuCau) =>
  dichVu.danhDauDaDoc(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maThongBao));
exports.danhDauTatCaDaDoc = xuLy((yeuCau) =>
  dichVu.danhDauTatCaDaDoc(yeuCau.nguoiDung.maNguoiDung));
