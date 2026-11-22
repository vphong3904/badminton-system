const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { luuAnh, xoaAnh, ANH_MAC_DINH, thuMucTepTaiLen } = require('../src/middlewares/upload');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const taoTep = (thuMuc, noiDung) => {
  const duongDan = path.join(thuMucTepTaiLen, thuMuc, `tam-test-${Date.now()}.png`);
  fs.mkdirSync(path.dirname(duongDan), { recursive: true });
  fs.writeFileSync(duongDan, noiDung);
  return { path: duongDan, mimetype: 'image/png' };
};

test('luuAnh: đặt tên theo quy tắc và xoaAnh xoá file', async () => {
  const duongDan = await luuAnh(taoTep('coso', PNG), 'coso', 'cs7');
  assert.match(duongDan, /^\/tep-tai-len\/coso\/cs7-\d+-[0-9a-f]{4}\.png$/);
  const tep = path.join(thuMucTepTaiLen, 'coso', path.basename(duongDan));
  assert.ok(fs.existsSync(tep));
  await xoaAnh(duongDan);
  assert.ok(!fs.existsSync(tep));
});

test('luuAnh: file giả ảnh bị từ chối và dọn file tạm', async () => {
  const tep = taoTep('avatar', Buffer.from('khong phai anh!'));
  await assert.rejects(luuAnh(tep, 'avatar', 'u1'));
  assert.ok(!fs.existsSync(tep.path));
});

test('xoaAnh: không xoá ảnh mặc định, bỏ qua đường dẫn lạ', async () => {
  const macDinh = path.join(thuMucTepTaiLen, 'coso', 'coso.jpg');
  fs.mkdirSync(path.dirname(macDinh), { recursive: true });
  const daCo = fs.existsSync(macDinh);
  if (!daCo) fs.writeFileSync(macDinh, PNG);
  await xoaAnh(ANH_MAC_DINH.coso);
  await xoaAnh('/tep-tai-len/coso/../../.env');
  assert.ok(fs.existsSync(macDinh));
  if (!daCo) fs.unlinkSync(macDinh);
});
