const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/validators/auth');
const customer = require('../src/validators/customer');

// Các ca dưới đây phản chiếu frontend/lib/core/utils/validators.dart: cùng đầu vào → cùng thông báo.
const loi = (luocDo, duLieu) => {
  const ketQua = luocDo.safeParse(duLieu);
  return ketQua.success ? null : ketQua.error.issues.map((muc) => muc.message);
};
const dangKyHopLe = {
  matKhau: 'matkhau123', hoTen: 'Nguyễn Văn A',
  soDienThoai: '0901234567', email: 'A@X.com',
};

test('Đăng ký: dữ liệu hợp lệ được chuẩn hoá giống FE', () => {
  const ketQua = auth.dangKy.body.safeParse({
    ...dangKyHopLe, hoTen: '  Nguyễn   Văn A ', soDienThoai: '+84 901 234 567',
  });
  assert.ok(ketQua.success);
  assert.equal(ketQua.data.hoTen, 'Nguyễn Văn A');
  assert.equal(ketQua.data.soDienThoai, '0901234567');
  assert.equal(ketQua.data.email, 'a@x.com');
});

test('Đăng ký: mỗi luật FE-20 đều bị BE chặn với đúng thông báo', () => {
  const cacCa = [
    [{ hoTen: 'A1' }, 'Họ tên chỉ gồm chữ cái, không chứa số hoặc ký tự đặc biệt.'],
    [{ hoTen: 'A' }, 'Họ tên tối thiểu 2 ký tự.'],
    [{ soDienThoai: '0201234567' }, 'Số điện thoại di động gồm 10 số, đầu số 03, 05, 07, 08 hoặc 09.'],
    [{ soDienThoai: 'abc0901234567' }, 'Số điện thoại di động gồm 10 số, đầu số 03, 05, 07, 08 hoặc 09.'],
    [{ email: 'a..b@x.com' }, 'Email không hợp lệ.'],
    [{ email: 'a@x' }, 'Email không hợp lệ.'],
    [{ matKhau: '1234567' }, 'Mật khẩu phải có ít nhất 8 ký tự.'],
    [{ matKhau: 'abcdefgh' }, 'Mật khẩu cần có cả chữ và số.'],
    [{ matKhau: 'abc 12345' }, 'Mật khẩu không được chứa khoảng trắng.'],
    [{ matKhau: `a1${'x'.repeat(71)}` }, 'Mật khẩu tối đa 72 ký tự.'],
  ];
  for (const [ghiDe, thongBao] of cacCa) {
    assert.deepEqual(loi(auth.dangKy.body, { ...dangKyHopLe, ...ghiDe }), [thongBao], JSON.stringify(ghiDe));
  }
});

test('Đổi mật khẩu: mới phải khác cũ và đạt chính sách', () => {
  assert.deepEqual(loi(auth.doiMatKhau.body, { matKhauCu: 'matkhau123', matKhauMoi: 'matkhau123' }),
    ['Mật khẩu mới phải khác mật khẩu hiện tại.']);
  assert.deepEqual(loi(auth.doiMatKhau.body, { matKhauCu: 'x', matKhauMoi: 'abc' }),
    ['Mật khẩu phải có ít nhất 8 ký tự.']);
  assert.equal(loi(auth.doiMatKhau.body, { matKhauCu: 'cu', matKhauMoi: 'matkhaumoi1' }), null);
});

test('Sửa hồ sơ: cho số liên hệ 10–11 số (BE service mới bắt số di động khi ĐỔI số)', () => {
  assert.equal(loi(auth.capNhatThongTinCaNhan.body, { soDienThoai: '02838123456' }), null);
  assert.ok(loi(auth.capNhatThongTinCaNhan.body, {}));
});

test('Đặt sân: tên + SĐT bắt buộc, giờ theo mốc 30 phút', () => {
  const datHopLe = {
    maSan: 1, ngay: '2099-01-01', gioBatDau: '18:00', gioKetThuc: '19:00',
    tenKhach: ' An ', soDienThoai: '0901 234 567',
  };
  const ketQua = customer.datLe.body.safeParse(datHopLe);
  assert.ok(ketQua.success);
  assert.equal(ketQua.data.tenKhach, 'An');
  assert.equal(ketQua.data.soDienThoai, '0901234567');
  assert.deepEqual(loi(customer.datLe.body, { ...datHopLe, tenKhach: undefined }),
    ['Vui lòng nhập tên (tối thiểu 2 ký tự).']);
  assert.deepEqual(loi(customer.datLe.body, { ...datHopLe, soDienThoai: '12' }),
    ['Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).']);
  assert.deepEqual(loi(customer.datLe.body, { ...datHopLe, ghiChu: 'x'.repeat(501) }),
    ['Ghi chú tối đa 500 ký tự.']);
  assert.ok(loi(customer.datLe.body, { ...datHopLe, gioBatDau: '18:15' }));
});

test('Hoàn tiền: số tài khoản bỏ dấu cách/gạch rồi kiểm 6–30 chữ số', () => {
  const body = customer.thongTinHoanTien.body;
  const hopLe = { tenNganHang: 'Vietcombank', maNganHang: 'VCB', soTaiKhoan: '0123 4567-89', chuTaiKhoan: 'NGUYEN VAN A' };
  assert.equal(body.parse(hopLe).soTaiKhoan, '0123456789');
  assert.deepEqual(loi(body, { ...hopLe, soTaiKhoan: '12ab' }), ['Số tài khoản chỉ gồm 6–30 chữ số.']);
});
