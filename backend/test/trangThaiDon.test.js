const test = require('node:test');
const assert = require('node:assert/strict');
const { tinhTrangThaiHienThi, ganTrangThaiHienThi, BANG_TRANG_THAI } = require('../src/utils/trangThaiDon');

// Mỗi dòng của bảng "trạng thái đơn hiển thị cho khách" là một ca: [đầu vào, mã, nhãn, nhóm tab].
const BANG_CA = [
  [{ trangThai: 'pending_payment', trangThaiThanhToan: 'pending', trangThaiHoanTien: 'none' },
    'awaiting_payment', 'Đã đặt, chờ thanh toán', 'sap_toi'],
  [{ trangThai: 'pending_payment', trangThaiThanhToan: 'confirming', trangThaiHoanTien: 'none' },
    'awaiting_owner_approval', 'Chờ chủ sân duyệt', 'sap_toi'],
  [{ trangThai: 'pending_payment', trangThaiThanhToan: 'pending', lyDoTuChoi: 'Ảnh mờ, không thấy số tiền' },
    'payment_rejected', 'Bị từ chối, gửi lại ảnh', 'sap_toi'],
  [{ trangThai: 'confirmed', trangThaiThanhToan: 'success', trangThaiHoanTien: 'none' },
    'paid', 'Thanh toán thành công (đã duyệt)', 'sap_toi'],
  [{ trangThai: 'completed', trangThaiThanhToan: 'success', trangThaiHoanTien: 'none' },
    'completed', 'Hoàn thành', 'hoan_thanh'],
  [{ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'processing', soTienHoan: 100000 },
    'cancelled_refund_pending', 'Đã hủy, chờ hoàn tiền', 'da_huy'],
  [{ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'waiting_info', soTienHoan: 100000 },
    'cancelled_refund_pending', 'Đã hủy, chờ hoàn tiền', 'da_huy'],
  [{ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'refunded', soTienHoan: 100000 },
    'cancelled_refunded', 'Đã hủy, đã hoàn tiền', 'da_huy'],
  [{ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'failed', soTienHoan: 100000 },
    'cancelled_refund_failed', 'Đã hủy, hoàn tiền thất bại', 'da_huy'],
  [{ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'none', soTienHoan: 0 },
    'cancelled_no_refund', 'Đã hủy, không hoàn tiền', 'da_huy'],
  [{ trangThai: 'cancelled', trangThaiThanhToan: 'pending', trangThaiHoanTien: 'none' },
    'cancelled_unpaid', 'Đã hủy (chưa thanh toán)', 'da_huy'],
  [{ trangThai: 'expired', trangThaiThanhToan: 'expired', trangThaiHoanTien: 'none' },
    'expired', 'Hết hạn giữ chỗ', 'da_huy'],
  [{ trangThai: 'expired', trangThaiThanhToan: 'late_payment', trangThaiHoanTien: 'waiting_info', soTienHoan: 100000 },
    'late_payment_refund_pending', 'Quá hạn, chờ admin hoàn tiền', 'da_huy'],
  [{ trangThai: 'expired', trangThaiThanhToan: 'late_payment', trangThaiHoanTien: 'refunded', soTienHoan: 100000 },
    'late_payment_refunded', 'Quá hạn, đã hoàn tiền', 'da_huy'],
];

for (const [dauVao, ma, nhan, nhom] of BANG_CA) {
  const tomTat = Object.entries(dauVao).map(([khoa, giaTri]) => `${khoa}=${giaTri}`).join(', ');
  test(`trạng thái hiển thị: ${ma} ← ${tomTat}`, () => {
    assert.deepEqual(tinhTrangThaiHienThi(dauVao), { ma, nhan, nhom });
  });
}

// 13 mã gốc ở đây; 7 mã mới của Task 0.6 được kiểm ở trangThaiDonMoi.test.js (có kiểm tổng 20 mã).
const MA_MOI = ['awaiting_admin_overdue', 'awaiting_reconcile', 'awaiting_topup', 'paid_overpay_refund_pending',
  'checked_in', 'no_show', 'cancelled_refund_received'];
test('trạng thái hiển thị: 13 mã gốc đều có ca kiểm thử (7 mã mới ở trangThaiDonMoi.test.js)', () => {
  assert.equal(Object.keys(BANG_TRANG_THAI).length, 13 + MA_MOI.length);
  const maDaKiemThu = new Set(BANG_CA.map((ca) => ca[1]));
  for (const ma of Object.keys(BANG_TRANG_THAI)) if (!MA_MOI.includes(ma)) assert.ok(maDaKiemThu.has(ma), `thiếu ca cho ${ma}`);
});

test('trạng thái hiển thị: dữ liệu thiếu (null/undefined/rỗng/enum lạ) → nhãn mặc định, không ném lỗi', () => {
  const macDinh = { ma: 'unknown', nhan: 'Không xác định', nhom: 'sap_toi' };
  for (const dauVao of [undefined, null, {}, { trangThai: null }, { trangThai: 'trang_thai_la' },
    { trangThai: undefined, trangThaiThanhToan: 'success' }]) {
    assert.deepEqual(tinhTrangThaiHienThi(dauVao), macDinh);
  }
});

test('trạng thái hiển thị: thiếu dữ liệu thanh toán/hoàn tiền vẫn ra nhãn hợp lý, không ném lỗi', () => {
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'pending_payment' }).ma, 'awaiting_payment');
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'pending_payment', trangThaiThanhToan: null, lyDoTuChoi: 'x' }).ma,
    'awaiting_payment'); // có lý do nhưng thanh toán không còn pending → không phải bị từ chối
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'cancelled' }).ma, 'cancelled_unpaid');
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'cancelled', trangThaiThanhToan: 'success' }).ma, 'cancelled_no_refund');
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'expired', trangThaiThanhToan: 'late_payment' }).ma,
    'late_payment_refund_pending');
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'expired' }).ma, 'expired');
});

test('ganTrangThaiHienThi: thêm 3 trường, giữ nguyên các trường khác, nhận trangThaiDatSan của hoá đơn', () => {
  const ketQua = ganTrangThaiHienThi({
    maDatSan: 1, trangThai: 'confirmed', trangThaiThanhToan: 'success', tongTien: 200000,
  });
  assert.equal(ketQua.maDatSan, 1);
  assert.equal(ketQua.tongTien, 200000);
  assert.deepEqual(
    [ketQua.trangThaiHienThi, ketQua.nhanTrangThai, ketQua.nhomTrangThai],
    ['paid', 'Thanh toán thành công (đã duyệt)', 'sap_toi']);
  assert.equal(ganTrangThaiHienThi({ trangThaiDatSan: 'completed' }).trangThaiHienThi, 'completed');
});
