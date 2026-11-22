// Điều kiện "slot đang bận" – MỘT chỗ duy nhất (TAI_LIEU_THUC_HIEN.md mục B.3).
// Dùng cho MỌI truy vấn kiểm trùng/tính lịch trống. Thêm trạng thái giữ slot mới chỉ sửa tại đây.
//
//  - 'confirmed', 'checked_in'            → luôn bận.
//  - 'pending_payment'                    → bận nếu còn hạn giữ chỗ, HOẶC HetHanGiuCho IS NULL
//                                           (giữ vô thời hạn: đã gửi ảnh chờ chủ sân/Admin, hoặc đang đối soát).
//  - 'no_show', 'expired', 'cancelled', 'completed' → KHÔNG bận (no_show: slot tự mở lại cho khách vãng lai).
// Giờ so sánh là NOW() của máy chủ DB (config/db.js đã đặt timezone '+07:00').
//
// d: bí danh bảng DatSan trong câu truy vấn (mặc định 'DatSan'). Chỉ nhận định danh SQL hợp lệ.
const SLOT_BAN = (d = 'DatSan') => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(d)) throw new Error(`Bí danh bảng không hợp lệ: ${d}`);
  return `(
  ${d}.TrangThai IN ('confirmed','checked_in')
  OR (${d}.TrangThai='pending_payment' AND (${d}.HetHanGiuCho IS NULL OR ${d}.HetHanGiuCho>NOW()))
)`;
};

module.exports = { SLOT_BAN };
