const test = require('node:test');
const assert = require('node:assert/strict');
const kiemTraAdmin = require('../src/validators/admin');
const kiemTraKhach = require('../src/validators/customer');

test('Khách khiếu nại: nội dung 10–1000 ký tự', () => {
  const luocDo = kiemTraKhach.guiKhieuNai.body;
  assert.equal(luocDo.safeParse({ noiDung: 'ngắn' }).success, false);
  assert.equal(luocDo.safeParse({ noiDung: 'Chủ sân không hoàn tiền cho tôi' }).success, true);
  assert.equal(luocDo.safeParse({ noiDung: 'a'.repeat(1001) }).success, false);
  assert.equal(luocDo.safeParse({ noiDung: 'Chủ sân không hoàn tiền', giaiDoan: 'khac' }).success, false);
});

test('Admin xử lý khiếu nại: bác bỏ phải có lý do', () => {
  const luocDo = kiemTraAdmin.xuLyKhieuNai.body;
  assert.equal(luocDo.safeParse({ quyetDinh: 'upheld' }).success, true);
  assert.equal(luocDo.safeParse({ quyetDinh: 'rejected' }).success, false);
  assert.equal(luocDo.safeParse({ quyetDinh: 'rejected', ghiChu: 'Không có bằng chứng' }).success, true);
  assert.equal(luocDo.safeParse({ quyetDinh: 'ban' }).success, false);
});
