// Đọc cấu hình số từ CauHinhHeThong – MỘT bản dùng chung (trước đây có 2 bản ở paymentService và customerService).
// Trả `macDinh` khi khoá không có, không phải số hữu hạn, hoặc ≤ 0 (mọi cấu hình hiện tại là thời gian/tỷ lệ dương;
// riêng commission_rate = 0 vẫn đúng vì macDinh truyền vào là 0).
// ketNoi: pool hoặc connection trong giao dịch.
async function layCauHinhSo(ketNoi, khoa, macDinh = 0) {
  const [[muc]] = await ketNoi.query('SELECT GiaTri AS giaTri FROM CauHinhHeThong WHERE KhoaCauHinh=?', [khoa]);
  const giaTri = Number(muc?.giaTri);
  return Number.isFinite(giaTri) && giaTri > 0 ? giaTri : macDinh;
}

module.exports = { layCauHinhSo };
