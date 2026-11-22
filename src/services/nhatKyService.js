// Ghi NhatKyHeThong – MỘT chỗ duy nhất (trước đây mỗi service tự viết INSERT).
// ketNoi: pool hoặc connection trong giao dịch (ghi cùng giao dịch với thay đổi để không lệch).
//   truoc/sau (tuỳ chọn): dữ liệu trước/sau khi đổi – object sẽ được JSON.stringify vào cột TEXT; không ghi gì nếu không truyền.
//   ChiTiet cột VARCHAR(500) → cắt còn 500 ký tự để không lỗi khi lý do dài.
const GIOI_HAN_CHI_TIET = 500;

const thanhChuoi = (v) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));

async function ghiNhatKy(ketNoi, { maNguoiThucHien, hanhDong, doiTuong, maDoiTuong, chiTiet, truoc, sau }) {
  const cot = ['MaNguoiThucHien', 'HanhDong', 'DoiTuong', 'MaDoiTuong', 'ChiTiet'];
  const giaTri = [maNguoiThucHien, hanhDong, doiTuong, maDoiTuong ?? null,
    chiTiet === undefined || chiTiet === null || chiTiet === '' ? null : String(chiTiet).slice(0, GIOI_HAN_CHI_TIET)];
  if (truoc !== undefined) { cot.push('DuLieuTruoc'); giaTri.push(thanhChuoi(truoc)); }
  if (sau !== undefined) { cot.push('DuLieuSau'); giaTri.push(thanhChuoi(sau)); }
  await ketNoi.query(
    `INSERT INTO NhatKyHeThong (${cot.join(', ')}) VALUES (${cot.map(() => '?').join(',')})`,
    giaTri);
}

module.exports = { ghiNhatKy };
