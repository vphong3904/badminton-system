const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const ungDung = require('../src/app');

let mayChu;
let diaChi;

test.before(async () => {
  mayChu = ungDung.listen(0);
  diaChi = `http://localhost:${mayChu.address().port}`;
});

test.after(() => mayChu.close());

test('Trang Swagger UI được phục vụ để xem và thử API', async () => {
  const phanHoi = await fetch(`${diaChi}/api-docs/`);
  assert.equal(phanHoi.status, 200);
  assert.match(phanHoi.headers.get('content-type'), /text\/html/);
  assert.match(await phanHoi.text(), /swagger-ui/);
});

test('OpenAPI JSON liệt kê API khách, SePay, chủ sân và quản trị', async () => {
  const phanHoi = await fetch(`${diaChi}/api-docs/openapi.json`);
  assert.equal(phanHoi.status, 200);
  const taiLieu = await phanHoi.json();
  assert.equal(taiLieu.openapi, '3.0.3');
  assert.ok(taiLieu.paths['/api/khach/dat-san/co-dinh'].post);
  assert.ok(taiLieu.paths['/api/webhooks/sepay'].post);
  assert.ok(taiLieu.paths['/api/chu-san/bao-cao/doanh-thu'].get);
  assert.ok(taiLieu.paths['/api/quan-tri/nhat-ky'].get);
  assert.ok(taiLieu.components.securitySchemes.BearerAuth);
});
