// Kiểm tra điều kiện check-in – HÀM THUẦN (không đụng DB, không đọc đồng hồ): mọi mốc giờ do service tính bằng NOW()
// của MySQL rồi truyền vào, nên giờ của thiết bị khách (`quetLuc`) không bao giờ ảnh hưởng quyết định.
//
// Thứ tự kiểm (mỗi bước dừng ở lỗi đầu tiên, một mã lỗi riêng):
//   QR : token+phiên bản → đơn thuộc khách → đúng sân → trạng thái đơn → cửa sổ giờ → chưa check-in
//   Thủ công (chủ sân): trạng thái đơn → cửa sổ giờ → chưa check-in   (quyền chủ sân do SQL kiểm theo cơ sở)
// Trả { hopLe:true, canTuXacNhan } hoặc { hopLe:false, maLoi, maTrangThai, thongBao, chiTiet? }.
const crypto = require('crypto');

const MA_LOI = {
  QR_INVALID: 'QR_INVALID', // sai token / sân không có QR
  QR_OUTDATED: 'QR_OUTDATED', // đúng sân nhưng QR cũ (chủ sân đã đổi)
  NOT_BOOKING_OWNER: 'NOT_BOOKING_OWNER',
  WRONG_COURT: 'WRONG_COURT',
  BOOKING_NOT_PAID: 'BOOKING_NOT_PAID',
  BOOKING_NOT_ELIGIBLE: 'BOOKING_NOT_ELIGIBLE',
  OUT_OF_WINDOW: 'OUT_OF_WINDOW',
  ALREADY_CHECKED_IN: 'ALREADY_CHECKED_IN',
};

const loi = (maLoi, maTrangThai, thongBao, chiTiet) => ({ hopLe: false, maLoi, maTrangThai, thongBao, chiTiet });

// So sánh token không lộ thời gian (cùng độ dài hex 64 ký tự; khác độ dài → sai ngay).
function tokenKhop(tokenGui, tokenDung) {
  if (typeof tokenGui !== 'string' || typeof tokenDung !== 'string') return false;
  const a = Buffer.from(tokenGui);
  const b = Buffer.from(tokenDung);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Đơn được phép check-in: đã thanh toán (confirmed) HOẶC khách đã gửi ảnh, đang chờ chủ sân/Admin duyệt (12.1).
function kiemTraTrangThaiDon({ trangThai, trangThaiThanhToan }) {
  if (trangThai === 'checked_in') {
    return loi(MA_LOI.ALREADY_CHECKED_IN, 409, 'Đơn này đã check-in rồi.');
  }
  if (trangThai === 'confirmed') return null;
  if (trangThai === 'pending_payment') {
    if (['confirming', 'overdue'].includes(trangThaiThanhToan)) return null;
    return loi(MA_LOI.BOOKING_NOT_PAID, 409,
      'Đơn chưa thanh toán. Vui lòng thanh toán và gửi ảnh chuyển khoản trước khi check-in.');
  }
  return loi(MA_LOI.BOOKING_NOT_ELIGIBLE, 409, 'Đơn không còn hiệu lực để check-in.');
}

// giayDenGioBatDau: (giờ bắt đầu − NOW()) tính bằng giây; dương = chưa đến giờ, âm = đã qua giờ bắt đầu.
function kiemTraCuaSo({ giayDenGioBatDau, moSomPhut, treToiDaPhut, ngayChoi, gioBatDau }) {
  const chiTiet = { moSomPhut, treToiDaPhut, ngay: ngayChoi, gioBatDau };
  if (giayDenGioBatDau > moSomPhut * 60) {
    return loi(MA_LOI.OUT_OF_WINDOW, 409,
      `Chưa đến giờ check-in. Bạn có thể check-in từ ${moSomPhut} phút trước giờ chơi.`,
      { ...chiTiet, viTri: 'qua_som' });
  }
  if (giayDenGioBatDau < -treToiDaPhut * 60) {
    return loi(MA_LOI.OUT_OF_WINDOW, 409,
      'Đã quá thời gian check-in. Vui lòng liên hệ chủ sân để được check-in thủ công.',
      { ...chiTiet, viTri: 'qua_tre' });
  }
  return null;
}

// QR của khách. Tham số:
//  qr   {maSan, token, phienBan} khách gửi lên
//  san  bản ghi sân theo qr.maSan {maSan, qrToken, qrPhienBan} (null nếu không có sân đó)
//  don  {maKhachHang, maSan, trangThai, trangThaiThanhToan, ngayChoi, gioBatDau, daCheckIn}
//  maKhach người đang gọi API
//  cuaSo {giayDenGioBatDau, moSomPhut, treToiDaPhut}
function kiemTraCheckInQr({ qr, san, don, maKhach, cuaSo }) {
  if (!san || !san.qrToken || !tokenKhop(qr.token, san.qrToken)) {
    return loi(MA_LOI.QR_INVALID, 400, 'Mã QR không hợp lệ. Vui lòng quét đúng mã QR đặt tại sân.');
  }
  if (Number(qr.phienBan) !== Number(san.qrPhienBan)) {
    return loi(MA_LOI.QR_OUTDATED, 400, 'Mã QR này đã cũ. Vui lòng quét mã QR mới tại sân.');
  }
  if (!don || Number(don.maKhachHang) !== Number(maKhach)) {
    return loi(MA_LOI.NOT_BOOKING_OWNER, 403, 'Bạn không phải người đặt đơn này.');
  }
  if (Number(don.maSan) !== Number(san.maSan)) {
    return loi(MA_LOI.WRONG_COURT, 409, 'Mã QR này thuộc sân khác, không phải sân bạn đã đặt.');
  }
  const loiTrangThai = kiemTraTrangThaiDon(don);
  if (loiTrangThai) return loiTrangThai;
  const loiCuaSo = kiemTraCuaSo({ ...cuaSo, ngayChoi: don.ngayChoi, gioBatDau: don.gioBatDau });
  if (loiCuaSo) return loiCuaSo;
  if (don.daCheckIn) return loi(MA_LOI.ALREADY_CHECKED_IN, 409, 'Đơn này đã check-in rồi.');
  return { hopLe: true, canTuXacNhan: don.trangThai === 'pending_payment' };
}

// Chủ sân check-in thủ công (QR lỗi, mất mạng, hết pin...). Linh hoạt hơn khách: được check-in từ lúc mở cửa sổ
// đến hết giờ chơi (khách đến trễ quá ngưỡng vẫn được chủ sân cho vào chơi, NGHIEP_VU 4.x/9.2).
// cuaSo: {giayDenGioBatDau, giayDenGioKetThuc, moSomPhut}
function kiemTraCheckInThuCong({ don, cuaSo }) {
  const loiTrangThai = kiemTraTrangThaiDon(don);
  if (loiTrangThai) return loiTrangThai;
  if (cuaSo.giayDenGioBatDau > cuaSo.moSomPhut * 60) {
    return loi(MA_LOI.OUT_OF_WINDOW, 409,
      `Chưa đến giờ check-in. Chỉ check-in được từ ${cuaSo.moSomPhut} phút trước giờ chơi.`,
      { moSomPhut: cuaSo.moSomPhut, viTri: 'qua_som' });
  }
  if (cuaSo.giayDenGioKetThuc <= 0) {
    return loi(MA_LOI.OUT_OF_WINDOW, 409, 'Đơn đã qua giờ chơi, không thể check-in.', { viTri: 'qua_gio_choi' });
  }
  if (don.daCheckIn) return loi(MA_LOI.ALREADY_CHECKED_IN, 409, 'Đơn này đã check-in rồi.');
  return { hopLe: true, canTuXacNhan: don.trangThai === 'pending_payment' };
}

module.exports = { kiemTraCheckInQr, kiemTraCheckInThuCong, kiemTraTrangThaiDon, kiemTraCuaSo, tokenKhop, MA_LOI };
