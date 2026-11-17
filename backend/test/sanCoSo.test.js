const test = require('node:test');
const assert = require('node:assert/strict');
const kiemTraChuSan = require('../src/validators/owner');
const kiemTraQuanTri = require('../src/validators/admin');
const dichVu = require('../src/services/sanCoSoService');

test('Đổi ngân hàng: chỉ cần mã ngân hàng hợp lệ + số tài khoản + chủ tài khoản', () => {
  const hopLe = { maNganHang: 'MB', soTaiKhoan: '0123456789', chuTaiKhoan: 'NGUYEN VAN A' };
  assert.equal(kiemTraChuSan.doiNganHang.body.safeParse(hopLe).success, true);
  assert.equal(kiemTraChuSan.doiNganHang.body.safeParse({ ...hopLe, maNganHang: 'KHONGCO' }).success, false);
  assert.equal(kiemTraChuSan.doiNganHang.body.safeParse({ ...hopLe, soTaiKhoan: '12ab' }).success, false);
  assert.equal(kiemTraChuSan.doiNganHang.body.safeParse({ ...hopLe, soTaiKhoan: '123' }).success, false);
});

test('Đóng/xoá sân, cơ sở: lý do tuỳ chọn, body trống vẫn hợp lệ', () => {
  for (const luocDo of [kiemTraChuSan.dongXoaSan, kiemTraQuanTri.dongXoaSan]) {
    assert.equal(luocDo.body.safeParse(undefined).success, true);
    assert.equal(luocDo.body.safeParse({ lyDo: 'Sửa sân' }).success, true);
    assert.equal(luocDo.body.safeParse({ lyDo: 'x' }).success, false);
    assert.equal(luocDo.params.safeParse({ maSan: '12' }).data.maSan, 12);
  }
  assert.equal(kiemTraChuSan.dongXoaCoSo.params.safeParse({ maCoSo: 'abc' }).success, false);
});

test('Còn khách/lịch cố định thì chặn với mã lỗi HAS_ACTIVE_BOOKINGS', () => {
  assert.doesNotThrow(() => dichVu.chanNeuConKhach({ soDon: 0, soLichCoDinh: 0 }, 'sân', 'đóng'));
  assert.throws(() => dichVu.chanNeuConKhach({ soDon: 2, soLichCoDinh: 1 }, 'sân "A"', 'đóng'), (loi) =>
    loi.maTrangThai === 409 && loi.maLoi === dichVu.MA_LOI_CON_KHACH
    && /2 đơn/.test(loi.message) && /1 lịch cố định/.test(loi.message));
});

test('demKhachConLai: không có sân thì không có khách', async () => {
  assert.deepEqual(await dichVu.demKhachConLai(null, []), { soDon: 0, soLichCoDinh: 0 });
});

test('demKhachConLai: đếm đơn đang giữ chỗ/đã xác nhận chưa chơi và lịch cố định còn hiệu lực', async () => {
  const cauTruyVan = [];
  const ketNoi = { query: async (sql, thamSo) => {
    cauTruyVan.push({ sql, thamSo });
    return [[{ so: cauTruyVan.length === 1 ? 3 : 1 }]];
  } };
  assert.deepEqual(await dichVu.demKhachConLai(ketNoi, [5, 6]), { soDon: 3, soLichCoDinh: 1 });
  assert.match(cauTruyVan[0].sql, /confirmed/);
  assert.match(cauTruyVan[0].sql, /pending_payment/);
  assert.match(cauTruyVan[1].sql, /LichCoDinh/);
  assert.deepEqual(cauTruyVan[0].thamSo, [5, 6]);
});
