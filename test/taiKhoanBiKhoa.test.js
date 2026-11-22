const test = require('node:test');
const assert = require('node:assert/strict');
const { thongBaoTaiKhoanBiKhoa, LY_DO_MAC_DINH } = require('../src/utils/taiKhoanBiKhoa');

test('Thông báo khóa tài khoản kèm đúng lý do admin đã nhập', () => {
  assert.equal(
    thongBaoTaiKhoanBiKhoa('không tuân thủ quy định của hệ thống'),
    'Tài khoản của bạn bị khóa vì lý do không tuân thủ quy định của hệ thống');
  assert.equal(
    thongBaoTaiKhoanBiKhoa('  Spam đánh giá  '),
    'Tài khoản của bạn bị khóa vì lý do Spam đánh giá');
});

test('Tài khoản khóa từ dữ liệu cũ không có lý do thì dùng câu mặc định', () => {
  for (const lyDo of [null, undefined, '', '   ']) {
    assert.equal(thongBaoTaiKhoanBiKhoa(lyDo), `Tài khoản của bạn bị khóa vì lý do ${LY_DO_MAC_DINH}`);
  }
});
