const dichVu = require('../services/paymentService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong } = require('../utils/response');
const { phatCapNhatDatSan } = require('../realtime/datSan');

exports.layQr = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.layQr(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
});

// Khách gửi ảnh chuyển khoản (multipart, trường `anhChuyenKhoan` + `thoiDiemChuyen` tuỳ chọn).
exports.guiAnhChuyenKhoan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  const r = await dichVu.guiAnhChuyenKhoan(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.file, yeuCau.body);
  await phatCapNhatDatSan(yeuCau.params.maDatSan);
  thanhCong(phanHoi, r);
});
