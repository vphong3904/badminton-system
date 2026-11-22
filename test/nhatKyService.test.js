const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { ghiNhatKy } = require('../src/services/nhatKyService');

const gia = () => { const goi = []; return { goi, query: async (sql, tham) => { goi.push({ sql, tham }); return [{}]; } }; };

test('ghiNhatKy: 5 cột khi không có truoc/sau; ChiTiet rỗng → NULL', async () => {
  const k = gia();
  await ghiNhatKy(k, { maNguoiThucHien: 1, hanhDong: 'x', doiTuong: 'ThanhToan', maDoiTuong: 9, chiTiet: '' });
  assert.match(k.goi[0].sql, /INSERT INTO NhatKyHeThong \(MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet\) VALUES \(\?,\?,\?,\?,\?\)/);
  assert.deepEqual(k.goi[0].tham, [1, 'x', 'ThanhToan', 9, null]);
});
test('ghiNhatKy: cắt ChiTiet còn 500 ký tự', async () => {
  const k = gia();
  await ghiNhatKy(k, { maNguoiThucHien: 1, hanhDong: 'x', doiTuong: 'D', maDoiTuong: 1, chiTiet: 'a'.repeat(900) });
  assert.equal(k.goi[0].tham[4].length, 500);
});
test('ghiNhatKy: truoc/sau object → JSON, chuỗi giữ nguyên, thêm 2 cột', async () => {
  const k = gia();
  await ghiNhatKy(k, { maNguoiThucHien: 2, hanhDong: 'y', doiTuong: 'D', maDoiTuong: 3, truoc: { a: 1 }, sau: 'chuoi' });
  assert.match(k.goi[0].sql, /DuLieuTruoc, DuLieuSau\) VALUES \(\?,\?,\?,\?,\?,\?,\?\)/);
  assert.deepEqual(k.goi[0].tham.slice(5), ['{"a":1}', 'chuoi']);
});
test('ghiNhatKy: chỉ truoc → chỉ thêm DuLieuTruoc; MaDoiTuong thiếu → NULL', async () => {
  const k = gia();
  await ghiNhatKy(k, { maNguoiThucHien: 2, hanhDong: 'y', doiTuong: 'D', truoc: null });
  assert.match(k.goi[0].sql, /ChiTiet, DuLieuTruoc\) VALUES \(\?,\?,\?,\?,\?,\?\)/);
  assert.deepEqual(k.goi[0].tham, [2, 'y', 'D', null, null, null]);
});

test('Chỉ nhatKyService được INSERT vào NhatKyHeThong', () => {
  const dir = path.join(__dirname, '..', 'src');
  const lietKe = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((m) => m.isDirectory() ? lietKe(path.join(d, m.name)) : m.name.endsWith('.js') ? [path.join(d, m.name)] : []);
  const viPham = lietKe(dir).filter((f) => path.basename(f) !== 'nhatKyService.js' && /INSERT INTO NhatKyHeThong/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(viPham.map((f) => path.relative(dir, f)), []);
});

test('ghiNhatKy (DB): ghi được DuLieuTruoc/DuLieuSau vào DB thật (bỏ qua nếu không có DB)', async (t) => {
  let ket;
  try {
    const c = require('../src/config/env').coSoDuLieu;
    ket = await mysql.createConnection({ host: c.mayChu, port: c.cong, user: c.nguoiDung, password: c.matKhau, database: c.ten });
    await ket.query('SELECT DuLieuTruoc FROM NhatKyHeThong LIMIT 1');
  } catch { if (ket) await ket.end(); return t.skip('không có DB hoặc chưa migration 0.1'); }
  try {
    await ket.beginTransaction();
    const [[nd]] = await ket.query("SELECT MaNguoiDung FROM NguoiDung WHERE VaiTro='admin' LIMIT 1");
    await ghiNhatKy(ket, { maNguoiThucHien: nd.MaNguoiDung, hanhDong: 'test_nhat_ky', doiTuong: 'Test', maDoiTuong: 1, chiTiet: 'ok', truoc: { x: 1 }, sau: { x: 2 } });
    const [[dong]] = await ket.query("SELECT DuLieuTruoc, DuLieuSau, ChiTiet FROM NhatKyHeThong WHERE HanhDong='test_nhat_ky' ORDER BY MaNhatKy DESC LIMIT 1");
    assert.deepEqual([dong.DuLieuTruoc, dong.DuLieuSau, dong.ChiTiet], ['{"x":1}', '{"x":2}', 'ok']);
  } finally { await ket.rollback(); await ket.end(); }
});
