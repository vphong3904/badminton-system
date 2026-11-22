// Cổng kiểm Task 0.3: điều kiện "slot đang bận" chỉ được viết ở utils/slot.js (SLOT_BAN).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function lietKe(thuMuc) {
  return fs.readdirSync(thuMuc, { withFileTypes: true }).flatMap((m) =>
    m.isDirectory() ? lietKe(path.join(thuMuc, m.name)) : m.name.endsWith('.js') ? [path.join(thuMuc, m.name)] : []);
}

test('Không còn HetHanGiuCho>NOW() viết tay ngoài utils/slot.js', () => {
  const goc = path.join(__dirname, '..', 'src');
  const viPham = lietKe(goc)
    .filter((f) => path.basename(f) !== 'slot.js')
    .filter((f) => {
      const code = fs.readFileSync(f, 'utf8').split('\n').filter((d) => !d.trim().startsWith('//')).join('\n');
      return /HetHanGiuCho\s*>\s*NOW\(\)/i.test(code);
    })
    .map((f) => path.relative(goc, f));
  assert.deepEqual(viPham, []);
});

test('Các service kiểm trùng/lịch trống đều dùng SLOT_BAN', () => {
  const doc = (t) => fs.readFileSync(path.join(__dirname, '..', 'src', 'services', t), 'utf8');
  for (const t of ['customerService.js', 'ownerService.js', 'sanCoSoService.js']) {
    assert.match(doc(t), /require\('\.\.\/utils\/slot'\)/, t);
    assert.match(doc(t), /\$\{SLOT_BAN\(/, t);
  }
});
