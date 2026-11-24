// Đọc cấu hình số từ CauHinhHeThong – MỘT bản dùng chung (trước đây có 2 bản ở paymentService và customerService).
// Trả `macDinh` khi khoá không có, không phải số hữu hạn, hoặc ≤ 0 (mọi cấu hình hiện tại là thời gian/tỷ lệ dương;
// riêng commission_rate = 0 vẫn đúng vì macDinh truyền vào là 0).
// ketNoi: pool hoặc connection trong giao dịch.
async function layCauHinhSo(ketNoi, khoa, macDinh = 0) {
  const [[muc]] = await ketNoi.query('SELECT GiaTri AS giaTri FROM CauHinhHeThong WHERE KhoaCauHinh=?', [khoa]);
  const giaTri = Number(muc?.giaTri);
  return Number.isFinite(giaTri) && giaTri > 0 ? giaTri : macDinh;
}

// Đọc khoá cấu hình dạng chuỗi (vd 'confirm_reminder_steps' = '20,10,5'). Trả `macDinh` khi khoá không có hoặc rỗng.
async function layCauHinhChuoi(ketNoi, khoa, macDinh = '') {
  const [[muc]] = await ketNoi.query('SELECT GiaTri AS giaTri FROM CauHinhHeThong WHERE KhoaCauHinh=?', [khoa]);
  const giaTri = String(muc?.giaTri ?? '').trim();
  return giaTri || macDinh;
}

// Tách chuỗi '20,10,5' thành mảng số nguyên dương, bỏ trùng, sắp GIẢM dần ([20,10,5]).
// Phần tử không hợp lệ (chữ, ≤ 0, số lẻ) bị bỏ; kết quả rỗng thì dùng `macDinh` (mảng số).
function tachDanhSachSo(chuoi, macDinh = []) {
  const cacSo = String(chuoi ?? '').split(',').map((phan) => phan.trim()).filter(Boolean)
    .map(Number).filter((so) => Number.isInteger(so) && so > 0);
  const duyNhat = [...new Set(cacSo)].sort((a, b) => b - a);
  return duyNhat.length ? duyNhat : [...macDinh];
}

// Đọc các khoá `*_steps` (danh sách mốc phút phân tách bằng dấu phẩy) → mảng số giảm dần.
async function layCauHinhDanhSach(ketNoi, khoa, macDinh = []) {
  return tachDanhSachSo(await layCauHinhChuoi(ketNoi, khoa, ''), macDinh);
}

module.exports = { layCauHinhSo, layCauHinhChuoi, layCauHinhDanhSach, tachDanhSachSo };
