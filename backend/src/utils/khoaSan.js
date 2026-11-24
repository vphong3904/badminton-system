// Task 1.3: chuẩn hóa yêu cầu khóa sân thành danh sách (ngày, khung giờ) – hàm thuần, không đụng DB.
//
// Hai dạng body (cùng endpoint POST /chu-san/khoa-san):
//  - Cũ (1 ngày):  { thoiGianBatDau:'YYYY-MM-DD HH:MM', thoiGianKetThuc:'YYYY-MM-DD HH:MM' }
//  - Mới (khoảng): { tuNgay:'YYYY-MM-DD', denNgay?:'YYYY-MM-DD', gioBatDau:'HH:MM', gioKetThuc:'HH:MM' }
//    Mỗi ngày trong khoảng [tuNgay, denNgay] khóa CÙNG khung giờ; denNgay bỏ trống = chỉ tuNgay.
const AppError = require('./AppError');
const { doiGioRaPhut, doiPhutRaGio } = require('./time');

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

// G9.E: trừ các khoảng đang bận (đơn giữ chỗ, khóa sẵn có) khỏi [gioBatDau, gioKetThuc) của MỘT ngày.
// Trả các khoảng TRỐNG theo thứ tự, dạng [{ gioBatDau:'HH:MM', gioKetThuc:'HH:MM' }]. Hàm thuần, không đụng DB.
// cacKhoangBan: [{ gioBatDau, gioKetThuc }] ('HH:MM' hoặc 'HH:MM:SS'); khoảng ngoài cửa sổ hoặc chồng nhau đều được xử lý.
function catKhungTrong(gioBatDau, gioKetThuc, cacKhoangBan) {
  const dau = doiGioRaPhut(gioBatDau);
  const cuoi = doiGioRaPhut(gioKetThuc);
  const cacBan = cacKhoangBan
    .map((k) => [Math.max(dau, doiGioRaPhut(k.gioBatDau)), Math.min(cuoi, doiGioRaPhut(k.gioKetThuc))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const ketQua = [];
  let conTu = dau;
  for (const [a, b] of cacBan) {
    if (a > conTu) ketQua.push({ gioBatDau: doiPhutRaGio(conTu), gioKetThuc: doiPhutRaGio(a) });
    conTu = Math.max(conTu, b);
  }
  if (conTu < cuoi) ketQua.push({ gioBatDau: doiPhutRaGio(conTu), gioKetThuc: doiPhutRaGio(cuoi) });
  return ketQua;
}

// G9.E2: một đơn vướng khung giờ khóa có thể chuyển sân / huỷ được không (hàm thuần).
//  - Đã đến giờ chơi/đã qua, hoặc khách đã check-in: không đụng tới (khóa sẽ cắt quanh đơn).
//  - Chuyển sân: khi còn ít nhất 1 sân thay thế trống (ưu tiên khách: chuyển trước, không tự huỷ).
//  - Huỷ: CHỈ khi không còn sân để chuyển; và không huỷ được khi khách đã gửi ảnh chuyển khoản (`confirming`).
function phanLoaiDonVuong({ daDenGio, trangThai, trangThaiThanhToan }, soSanThayThe) {
  if (daDenGio || trangThai === 'checked_in') {
    return { coTheChuyen: false, coTheHuy: false, lyDoKhongXuLy: 'Đơn đã đến giờ chơi hoặc đã qua, không thể chuyển hay huỷ.' };
  }
  const coTheChuyen = soSanThayThe > 0;
  if (coTheChuyen) return { coTheChuyen: true, coTheHuy: false, lyDoKhongXuLy: null };
  if (trangThaiThanhToan === 'confirming') {
    return {
      coTheChuyen: false,
      coTheHuy: false,
      lyDoKhongXuLy: 'Không còn sân trống để chuyển, và khách đã gửi ảnh chuyển khoản nên chưa huỷ được. Hãy xác nhận hoặc từ chối thanh toán trước.',
    };
  }
  return { coTheChuyen: false, coTheHuy: true, lyDoKhongXuLy: null };
}

module.exports = { SO_NGAY_TOI_DA, laNgayHopLe, lietKeNgay, chuanHoaYeuCauKhoa, catKhungTrong, phanLoaiDonVuong };
