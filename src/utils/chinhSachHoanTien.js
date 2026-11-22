// Chính sách hoàn tiền khi khách huỷ đơn đã thanh toán (tính theo số giờ còn lại tới giờ chơi):
//   ≥ cancel_free_hours (24h)                → hoàn 100%
//   ≥ cancel_half_hours (12h) và < 24h       → hoàn late_cancel_refund_percent (50%)
//   < cancel_half_hours (12h)                → không hoàn
// Chủ sân là người tự chuyển khoản hoàn cho khách.
const MAC_DINH = { gioMienPhi: 24, gioNuaTien: 12, tiLeNuaTien: 50 };

function tinhTiLeHoan(conGio, cauHinh = {}) {
  const gioMienPhi = cauHinh.gioMienPhi ?? MAC_DINH.gioMienPhi;
  const gioNuaTien = cauHinh.gioNuaTien ?? MAC_DINH.gioNuaTien;
  const tiLeNuaTien = cauHinh.tiLeNuaTien ?? MAC_DINH.tiLeNuaTien;
  if (conGio >= gioMienPhi) return 100;
  if (conGio >= gioNuaTien) return tiLeNuaTien;
  return 0;
}

function tinhSoTienHoan(tongTien, conGio, cauHinh) {
  return Math.round(Number(tongTien) * tinhTiLeHoan(conGio, cauHinh) / 100);
}

module.exports = { tinhTiLeHoan, tinhSoTienHoan, MAC_DINH };
