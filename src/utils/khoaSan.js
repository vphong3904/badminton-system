// Task 1.3: chuẩn hóa yêu cầu khóa sân thành danh sách (ngày, khung giờ) – hàm thuần, không đụng DB.
//
// Hai dạng body (cùng endpoint POST /chu-san/khoa-san):
//  - Cũ (1 ngày):  { thoiGianBatDau:'YYYY-MM-DD HH:MM', thoiGianKetThuc:'YYYY-MM-DD HH:MM' }
//  - Mới (khoảng): { tuNgay:'YYYY-MM-DD', denNgay?:'YYYY-MM-DD', gioBatDau:'HH:MM', gioKetThuc:'HH:MM' }
//    Mỗi ngày trong khoảng [tuNgay, denNgay] khóa CÙNG khung giờ; denNgay bỏ trống = chỉ tuNgay.
const AppError = require('./AppError');

const SO_NGAY_TOI_DA = 90;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

function laNgayHopLe(chuoi) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chuoi)) return false;
  const ngay = new Date(`${chuoi}T00:00:00Z`);
  return !Number.isNaN(ngay.getTime()) && ngay.toISOString().slice(0, 10) === chuoi;
}

// Trả mảng 'YYYY-MM-DD' từ tuNgay đến denNgay (gồm cả hai đầu). Dùng UTC nên không lệch ngày do múi giờ/DST.
function lietKeNgay(tuNgay, denNgay) {
  if (!laNgayHopLe(tuNgay) || !laNgayHopLe(denNgay)) {
    throw AppError.duLieuKhongHopLe('Ngày phải có dạng YYYY-MM-DD');
  }
  const dau = Date.parse(`${tuNgay}T00:00:00Z`);
  const cuoi = Date.parse(`${denNgay}T00:00:00Z`);
  if (cuoi < dau) throw AppError.duLieuKhongHopLe('Ngày kết thúc phải từ ngày bắt đầu trở đi');
  const soNgay = Math.round((cuoi - dau) / MOT_NGAY_MS) + 1;
  if (soNgay > SO_NGAY_TOI_DA) {
    throw AppError.duLieuKhongHopLe(`Một lần chỉ được khóa tối đa ${SO_NGAY_TOI_DA} ngày`);
  }
  return Array.from({ length: soNgay }, (_, i) => new Date(dau + i * MOT_NGAY_MS).toISOString().slice(0, 10));
}

// Đưa body (dạng cũ hoặc mới) về { kieu, cacNgay, gioBatDau, gioKetThuc }.
// kieu: 'mot-ngay' (dạng cũ, giữ nguyên kiểu trả về) | 'khoang' (dạng mới).
function chuanHoaYeuCauKhoa(duLieu) {
  const coDangMoi = duLieu.tuNgay !== undefined || duLieu.gioBatDau !== undefined || duLieu.gioKetThuc !== undefined || duLieu.denNgay !== undefined;
  if (!coDangMoi) {
    const batDau = duLieu.thoiGianBatDau.replace('T', ' ');
    const ketThuc = duLieu.thoiGianKetThuc.replace('T', ' ');
    if (batDau.slice(0, 10) !== ketThuc.slice(0, 10)) {
      throw AppError.duLieuKhongHopLe('Một lần khóa sân chỉ áp dụng trong cùng một ngày; muốn khóa nhiều ngày hãy dùng tuNgay/denNgay');
    }
    if (!laNgayHopLe(batDau.slice(0, 10))) throw AppError.duLieuKhongHopLe('Ngày phải có dạng YYYY-MM-DD');
    return { kieu: 'mot-ngay', cacNgay: [batDau.slice(0, 10)], gioBatDau: batDau.slice(11), gioKetThuc: ketThuc.slice(11) };
  }
  if (!duLieu.tuNgay || !duLieu.gioBatDau || !duLieu.gioKetThuc) {
    throw AppError.duLieuKhongHopLe('Cần đủ tuNgay, gioBatDau và gioKetThuc');
  }
  if (duLieu.gioBatDau >= duLieu.gioKetThuc) {
    throw AppError.duLieuKhongHopLe('Giờ kết thúc phải sau giờ bắt đầu');
  }
  return {
    kieu: 'khoang',
    cacNgay: lietKeNgay(duLieu.tuNgay, duLieu.denNgay || duLieu.tuNgay),
    gioBatDau: duLieu.gioBatDau,
    gioKetThuc: duLieu.gioKetThuc,
  };
}

module.exports = { SO_NGAY_TOI_DA, laNgayHopLe, lietKeNgay, chuanHoaYeuCauKhoa };
