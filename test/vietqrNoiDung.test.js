const test = require('node:test');
const assert = require('node:assert/strict');
const { crc16, taoNoiDungQr } = require('../src/utils/vietqr');

test('CRC16-CCITT-FALSE đúng vector chuẩn', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('Dựng nội dung VietQR: BIN, số tài khoản, số tiền, nội dung, CRC', () => {
  const ma = taoNoiDungQr('BK261118ABC123', 120000, {
    maNganHang: 'VCB', soTaiKhoan: '0071001234567', chuTaiKhoan: 'NGUYEN MINH KHOA',
  });
  assert.match(ma, /^000201010212/);
  assert.ok(ma.includes('0010A000000727'));
  assert.ok(ma.includes('0006970436')); // BIN Vietcombank
  assert.ok(ma.includes('01130071001234567'));
  assert.ok(ma.includes('0208QRIBFTTA'));
  assert.ok(ma.includes('5406120000'));
  assert.ok(ma.includes('5303704') && ma.includes('5802VN'));
  assert.ok(ma.includes('0814BK261118ABC123'));
  // 4 ký tự cuối là CRC của phần phía trước.
  assert.equal(ma.slice(-4), crc16(ma.slice(0, -4)));
  assert.ok(ma.slice(0, -4).endsWith('6304'));
});

test('Không có tài khoản hoặc ngân hàng lạ thì trả null', () => {
  assert.equal(taoNoiDungQr('BK1', 1000, null), null);
  assert.equal(taoNoiDungQr('BK1', 1000, { maNganHang: 'XYZ', soTaiKhoan: '1' }), null);
});
