const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// MariaDB không hỗ trợ `FOR UPDATE OF <bảng>` (chỉ MySQL 8) và `SKIP LOCKED` chỉ có từ 10.6.
// Giữ SQL ở mức chung để chạy được trên cả hai.
function lietKeTep(thuMuc) {
  return fs.readdirSync(thuMuc, { withFileTypes: true }).flatMap((muc) =>
    muc.isDirectory() ? lietKeTep(path.join(thuMuc, muc.name))
      : muc.name.endsWith('.js') ? [path.join(thuMuc, muc.name)] : []);
}

test('SQL trong src không dùng FOR UPDATE OF / SKIP LOCKED / NOWAIT (MariaDB không chạy được)', () => {
  const viPham = lietKeTep(path.join(__dirname, '..', 'src')).filter((tep) => {
    const noiDung = fs.readFileSync(tep, 'utf8').split('\n')
      .filter((dong) => !dong.trim().startsWith('//')).join('\n');
    return /FOR\s+UPDATE\s+OF\b|SKIP\s+LOCKED|\bNOWAIT\b/i.test(noiDung);
  });
  assert.deepEqual(viPham, []);
});
