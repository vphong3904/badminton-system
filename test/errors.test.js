const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../src/utils/AppError');
const { xuLyLoi } = require('../src/middlewares/errorHandler');

function chayXuLyLoi(loi) {
  let maTrangThai;
  let noiDung;
  const phanHoi = {
    status(ma) { maTrangThai = ma; return this; },
    json(duLieu) { noiDung = duLieu; return this; },
  };
  const ganNhat = console.error;
  console.error = () => {};
  try { xuLyLoi(loi, {}, phanHoi, () => {}); } finally { console.error = ganNhat; }
  return { maTrangThai, noiDung };
}

test('Loi ket noi MySQL tra 503 DB_UNAVAILABLE', () => {
  for (const code of ['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ER_CON_COUNT_ERROR']) {
    const { maTrangThai, noiDung } = chayXuLyLoi(Object.assign(new Error('x'), { code }));
    assert.equal(maTrangThai, 503, code);
    assert.equal(noiDung.thanhCong, false);
    assert.equal(noiDung.loi.maLoi, 'DB_UNAVAILABLE');
    assert.match(noiDung.loi.thongBao, /bảo trì|quá tải/);
  }
});

test('Loi khong du doan van tra 500 INTERNAL, khong lo noi dung loi', () => {
  const { maTrangThai, noiDung } = chayXuLyLoi(new Error('SELECT secret FROM x'));
  assert.equal(maTrangThai, 500);
  assert.equal(noiDung.loi.maLoi, 'INTERNAL');
  assert.equal(noiDung.loi.thongBao, 'Lỗi máy chủ');
});

test('Trung khoa DB chung tra 409 CONFLICT', () => {
  const { maTrangThai, noiDung } = chayXuLyLoi(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));
  assert.equal(maTrangThai, 409);
  assert.equal(noiDung.loi.maLoi, 'CONFLICT');
});

test('AppError.biTrung ho tro ma loi rieng', () => {
  const loi = AppError.biTrung('Email đã được sử dụng', 'EMAIL_EXISTS');
  assert.equal(loi.maTrangThai, 409);
  assert.equal(loi.maLoi, 'EMAIL_EXISTS');
  assert.equal(AppError.biTrung().maLoi, 'CONFLICT');
});
