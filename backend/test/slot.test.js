// utils/slot.js (SLOT_BAN): từng trạng thái chạy trên DB thật bằng bảng TẠM `DatSan` (không đụng dữ liệu thật);
// tự bỏ qua nếu không kết nối được DB. Phần chuỗi/bí danh luôn chạy.
const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { SLOT_BAN } = require('../src/utils/slot');

test('SLOT_BAN: bí danh mặc định và tuỳ chọn', () => {
  assert.match(SLOT_BAN(), /DatSan\.TrangThai IN \('confirmed','checked_in'\)/);
  assert.match(SLOT_BAN('d'), /d\.HetHanGiuCho IS NULL OR d\.HetHanGiuCho>NOW\(\)/);
  assert.doesNotMatch(SLOT_BAN('d'), /DatSan\./);
});

test('SLOT_BAN: từ chối bí danh không hợp lệ (chống chèn SQL)', () => {
  assert.throws(() => SLOT_BAN('d; DROP TABLE DatSan'), /không hợp lệ/);
  assert.throws(() => SLOT_BAN(''), /không hợp lệ/);
  assert.throws(() => SLOT_BAN('1d'), /không hợp lệ/);
});

test('SLOT_BAN: không chứa no_show/expired/cancelled/completed', () => {
  for (const tt of ['no_show', 'expired', 'cancelled', 'completed']) assert.ok(!SLOT_BAN().includes(tt), tt);
});

let ket = null;
test.before(async () => {
  try {
    const c = require('../src/config/env').coSoDuLieu;
    ket = await mysql.createConnection({
      host: c.mayChu, port: c.cong, user: c.nguoiDung, password: c.matKhau, database: c.ten, timezone: '+07:00',
    });
    await ket.query('CREATE TEMPORARY TABLE DatSan (Ma INT PRIMARY KEY, TrangThai VARCHAR(20) NOT NULL, HetHanGiuCho DATETIME NULL)');
  } catch { ket = null; }
});
test.after(async () => { if (ket) await ket.end(); });

const CAC_TRUONG_HOP = [
  ['confirmed', 'NULL', true],
  ['checked_in', 'NULL', true],
  ['pending_payment', 'DATE_ADD(NOW(), INTERVAL 5 MINUTE)', true],   // còn hạn giữ chỗ
  ['pending_payment', 'DATE_SUB(NOW(), INTERVAL 1 MINUTE)', false],  // hết hạn
  ['pending_payment', 'NULL', true],                                  // giữ vô thời hạn (đã gửi ảnh / đối soát)
  ['no_show', 'NULL', false],
  ['expired', 'NULL', false],
  ['cancelled', 'NULL', false],
  ['completed', 'NULL', false],
];

for (const [trangThai, hetHan, bận] of CAC_TRUONG_HOP) {
  test(`SLOT_BAN (DB): ${trangThai} / HetHanGiuCho=${hetHan.startsWith('DATE_ADD') ? 'còn hạn' : hetHan.startsWith('DATE_SUB') ? 'quá hạn' : 'NULL'} → ${bận ? 'bận' : 'không bận'}`,
    async (t) => {
      if (!ket) return t.skip('không có DB');
      await ket.query('DELETE FROM DatSan');
      await ket.query(`INSERT INTO DatSan (Ma, TrangThai, HetHanGiuCho) VALUES (1, ?, ${hetHan})`, [trangThai]);
      const [dong] = await ket.query(`SELECT Ma FROM DatSan WHERE ${SLOT_BAN()}`);
      assert.equal(dong.length, bận ? 1 : 0);
      const [dong2] = await ket.query(`SELECT x.Ma FROM DatSan x WHERE ${SLOT_BAN('x')}`); // bí danh
      assert.equal(dong2.length, bận ? 1 : 0);
    });
}
