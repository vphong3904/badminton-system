const { thucHienGiaoDich } = require('../config/db');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');
const dichVu = require('../services/hoanTienService');

// G4.4 – khách xác nhận đã nhận lại tiền (received) / báo chưa nhận được (not_received, vẫn tính hạn cũ).
exports.daNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await thucHienGiaoDich((ketNoi) =>
    dichVu.khachXacNhan(ketNoi, yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maHoanTien)));
});
exports.chuaNhan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await thucHienGiaoDich((ketNoi) =>
    dichVu.khachBaoChuaNhan(ketNoi, yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maHoanTien, yeuCau.body?.ghiChu)));
});
