// Task 0.6: nhánh trạng thái mới của utils/trangThaiDon.js (hàm thuần).
const test = require('node:test');
const assert = require('node:assert/strict');
const { tinhTrangThaiHienThi, ganTrangThaiHienThi, BANG_TRANG_THAI } = require('../src/utils/trangThaiDon');

const CA = [
  [{ trangThai: 'pending_payment', trangThaiThanhToan: 'overdue' }, 'awaiting_admin_overdue', 'sap_toi'],
  [{ trangThai: 'pending_payment', trangThaiThanhToan: 'reconciling' }, 'awaiting_reconcile', 'sap_toi'],
  [{ trangThai: 'pending_payment', trangThaiThanhToan: 'underpaid' }, 'awaiting_topup', 'sap_toi'],
  [{ trangThai: 'confirmed', trangThaiThanhToan: 'success', trangThaiHoanTien: 'processing', loaiHoanTien: 'overpay' }, 'paid_overpay_refund_pending', 'sap_toi'],
  [{ trangThai: 'confirmed', trangThaiThanhToan: 'success', trangThaiHoanTien: 'waiting_info', loaiHoanTien: 'overpay' }, 'paid_overpay_refund_pending', 'sap_toi'],
  [{ trangThai: 'checked_in', trangThaiThanhToan: 'success' }, 'checked_in', 'sap_toi'],
  [{ trangThai: 'no_show', trangThaiThanhToan: 'success' }, 'no_show', 'da_huy'],
  [{ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'received' }, 'cancelled_refund_received', 'da_huy'],
];

for (const [vao, ma, nhom] of CA) {
  test(`trạng thái mới: ${JSON.stringify(vao)} → ${ma}`, () => {
    const kq = tinhTrangThaiHienThi(vao);
    assert.equal(kq.ma, ma);
    assert.equal(kq.nhom, nhom);
    assert.equal(kq.nhan, BANG_TRANG_THAI[ma].nhan);
    assert.ok(kq.nhan.length > 0);
  });
}

test('Không đổi hành vi cũ: confirmed không có khoản dư vẫn là paid; hoàn dư đã xong (refunded) vẫn là paid', () => {
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'confirmed', trangThaiThanhToan: 'success' }).ma, 'paid');
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'confirmed', trangThaiHoanTien: 'refunded', loaiHoanTien: 'overpay' }).ma, 'paid');
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'confirmed', trangThaiHoanTien: 'processing', loaiHoanTien: 'cancel' }).ma, 'paid');
});
test('Đơn hủy có hoàn tiền "received" khác "refunded"; các giá trị cũ giữ nguyên', () => {
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'refunded' }).ma, 'cancelled_refunded');
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'cancelled', trangThaiThanhToan: 'success', trangThaiHoanTien: 'failed' }).ma, 'cancelled_refund_failed');
});
test('pending_payment + confirming vẫn là chờ chủ sân duyệt (không bị nhánh mới che)', () => {
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'pending_payment', trangThaiThanhToan: 'confirming' }).ma, 'awaiting_owner_approval');
});
test('ganTrangThaiHienThi truyền loaiHoanTien vào hàm tính', () => {
  const d = ganTrangThaiHienThi({ trangThai: 'confirmed', trangThaiThanhToan: 'success', trangThaiHoanTien: 'processing', loaiHoanTien: 'overpay' });
  assert.equal(d.trangThaiHienThi, 'paid_overpay_refund_pending');
  assert.equal(d.nhomTrangThai, 'sap_toi');
});
test('Trạng thái lạ vẫn rơi về mặc định, không ném lỗi', () => {
  assert.equal(tinhTrangThaiHienThi({ trangThai: 'zzz' }).ma, 'unknown');
  assert.equal(tinhTrangThaiHienThi(null).ma, 'unknown');
});
test('Mọi mã trong bảng có nhãn và nhóm hợp lệ', () => {
  for (const [ma, v] of Object.entries(BANG_TRANG_THAI)) {
    assert.ok(v.nhan, ma);
    assert.ok(['sap_toi', 'hoan_thanh', 'da_huy'].includes(v.nhom), ma);
  }
});

test('Mỗi mã mới của Task 0.6 có ít nhất một ca kiểm thử ở đây', () => {
  const MA_MOI = ['awaiting_admin_overdue', 'awaiting_reconcile', 'awaiting_topup', 'paid_overpay_refund_pending',
    'checked_in', 'no_show', 'cancelled_refund_received'];
  const daKiem = new Set(CA.map((c) => c[1]));
  for (const ma of MA_MOI) assert.ok(daKiem.has(ma), ma);
});
