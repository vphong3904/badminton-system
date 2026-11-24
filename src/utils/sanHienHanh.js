// Điều kiện "sân chưa xoá" — MỘT chỗ duy nhất (G9.F2), như SLOT_BAN ở utils/slot.js.
// Dùng cho MỌI truy vấn HIỆN HÀNH trên bảng San (liệt kê, đặt, lịch, QR, khoá sân, chuyển sân, báo cáo hiện hành).
// Truy vấn LỊCH SỬ (đơn, doanh thu, khiếu nại, hoá đơn) KHÔNG dùng: vẫn join sân đã xoá để hiện tên cũ.
// Xoá sân = xoá mềm: San.DaXoa=1, NgayXoa=NOW() (sanCoSoService.xoaSan). Sân đã xoá không chiếm tên (San.TenDangDung = NULL).
//
// s: bí danh bảng San trong câu truy vấn (mặc định 'San'). Chỉ nhận định danh SQL hợp lệ.
//   `... FROM San s WHERE s.MaCoSo = ? AND ${SAN_CHUA_XOA('s')}`
const SAN_CHUA_XOA = (s = 'San') => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error(`Bí danh bảng không hợp lệ: ${s}`);
  return `${s}.DaXoa = 0`;
};

module.exports = { SAN_CHUA_XOA };
