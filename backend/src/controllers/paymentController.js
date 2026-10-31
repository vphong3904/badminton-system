const dichVu = require('../services/paymentService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { thanhCong } = require('../utils/response');
const { layDuongDanTep } = require('../middlewares/upload');

exports.layQr = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  thanhCong(phanHoi, await dichVu.layQr(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
});

exports.taiAnhChuyenKhoan = xuLyBatDongBo(async (yeuCau, phanHoi) => {
  if (!yeuCau.file) throw AppError.duLieuKhongHopLe('Thiếu ảnh chuyển khoản (trường "tepAnh")');
  thanhCong(phanHoi, await dichVu.taiAnhChuyenKhoan(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, layDuongDanTep(yeuCau.file)));
});

exports.webhookSePay = async (yeuCau, phanHoi) => {
  if (!Buffer.isBuffer(yeuCau.body) || !yeuCau.body.length) {
    return phanHoi.status(400).json({ success: false, message: 'Empty body' });
  }
  if (!dichVu.xacThucChuKyHmac(yeuCau.body, yeuCau.headers)) {
    return phanHoi.status(401).json({ success: false, message: 'Invalid signature' });
  }
  let duLieu;
  try {
    duLieu = JSON.parse(yeuCau.body.toString('utf8'));
  } catch {
    return phanHoi.status(400).json({ success: false, message: 'Invalid JSON' });
  }
  try {
    await dichVu.xuLyWebhookSePay(duLieu);
    return phanHoi.status(200).json({ success: true });
  } catch (loi) {
    if (loi instanceof AppError) {
      return phanHoi.status(loi.maTrangThai).json({ success: false, message: loi.message });
    }
    console.error('Lỗi xử lý webhook SePay:', loi);
    return phanHoi.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

exports.thieuCauHinhWebhook = (_yeuCau, phanHoi) =>
  phanHoi.status(503).json({ success: false, message: 'Webhook authentication is not configured' });
