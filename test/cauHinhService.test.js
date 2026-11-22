const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { layCauHinhSo } = require('../src/services/cauHinhService');

const gia = (giaTri) => ({ query: async (sql, tham) => {
  assert.match(sql, /FROM CauHinhHeThong WHERE KhoaCauHinh=\?/);
  assert.equal(tham[0], 'khoa_thu');
  return [[giaTri === undefined ? undefined : { giaTri }]];
} });

test('layCauHinhSo: trả giá trị số khi hợp lệ', async () => {
  assert.equal(await layCauHinhSo(gia('30'), 'khoa_thu', 99), 30);
  assert.equal(await layCauHinhSo(gia(12.5), 'khoa_thu', 99), 12.5);
});
test('layCauHinhSo: dùng mặc định khi thiếu khoá, rỗng, không phải số, bằng 0 hoặc âm', async () => {
  for (const v of [undefined, '', 'abc', '0', '-5', null]) assert.equal(await layCauHinhSo(gia(v), 'khoa_thu', 7), 7, String(v));
});
test('layCauHinhSo: mặc định 0 khi không truyền (commission_rate = 0 vẫn đúng)', async () => {
  assert.equal(await layCauHinhSo(gia(undefined), 'khoa_thu'), 0);
});
test('Chỉ còn MỘT bản đọc CauHinhHeThong dạng số trong services', () => {
  const dir = path.join(__dirname, '..', 'src', 'services');
  const bản = fs.readdirSync(dir).filter((f) => f !== 'cauHinhService.js')
    .filter((f) => /async function layCauHinh\w*\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')) && /SELECT GiaTri AS giaTri FROM CauHinhHeThong/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  assert.deepEqual(bản, []);
});
