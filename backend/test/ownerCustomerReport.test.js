const test = require('node:test');
const assert = require('node:assert/strict');
const kiemTra = require('../src/validators/ownerReport');

test('thong ke khach: nhan bo loc ngay + co so, tu choi khoang ngay nguoc', () => {
  const q = kiemTra.thongKeKhach.query;
  assert.equal(q.safeParse({}).success, true);
  assert.equal(q.safeParse({ tuNgay: '2026-11-01', denNgay: '2026-11-13', maCoSo: '3' }).success, true);
  assert.equal(q.safeParse({ tuNgay: '2026-11-13', denNgay: '2026-11-01' }).success, false);
});

test('danh sach khach: sapXep, nhom, soDong duoc gioi han', () => {
  const q = kiemTra.danhSachKhach.query;
  assert.equal(q.safeParse({ sapXep: 'chi-tieu', nhom: 'quay-lai', soDong: '50' }).success, true);
  assert.equal(q.safeParse({ sapXep: 'ten; DROP TABLE' }).success, false);
  assert.equal(q.safeParse({ nhom: 'khac' }).success, false);
  assert.equal(q.safeParse({ soDong: '101' }).success, false);
});

test('chi tiet khach: can dung 1 trong maKhachHang / soDienThoai', () => {
  const q = kiemTra.chiTietKhach.query;
  assert.equal(q.safeParse({ maKhachHang: '7' }).success, true);
  assert.equal(q.safeParse({ soDienThoai: '0901234567' }).success, true);
  assert.equal(q.safeParse({}).success, false);
  assert.equal(q.safeParse({ maKhachHang: '7', soDienThoai: '0901234567' }).success, false);
});

test('service tong quan: tinh ty le va khach cu = tong - moi', async () => {
  const db = require('../src/config/db');
  const goc = db.pool.query;
  db.pool.query = async (sql) => {
    if (/AS tongKhach/.test(sql)) {
      return [[{ tongKhach: '10', soLuotDat: '30', soLuotHuy: '10', tongChiTieu: '3000000', tongCongNo: '0', khachMoi: '4', khachDatLai: '5' }]];
    }
    return [[]];
  };
  try {
    delete require.cache[require.resolve('../src/services/ownerCustomerReportService')];
    const dv = require('../src/services/ownerCustomerReportService');
    const kq = await dv.layTongQuanKhach(1, { tuNgay: '2026-11-01' });
    assert.equal(kq.tongKhach, 10);
    assert.equal(kq.khachMoi, 4);
    assert.equal(kq.khachCu, 6);
    assert.equal(kq.tyLeQuayLai, 50);
    assert.equal(kq.tyLeHuy, 25);
    assert.equal(kq.chiTieuTrungBinhMoiKhach, 300000);
    assert.equal(kq.soLuotDatTrungBinhMoiKhach, 3);
  } finally { db.pool.query = goc; }
});

test('service danh sach khach: sap xep theo whitelist, phan trang', async () => {
  const db = require('../src/config/db');
  const goc = db.pool.query;
  const sqls = [];
  db.pool.query = async (sql, tham) => {
    sqls.push({ sql, tham });
    return /COUNT\(\*\) AS tong/.test(sql) ? [[{ tong: 1 }]] : [[{ soLuotDat: '3', soLuotHuy: '0', tongChiTieu: '240000', conNo: '0' }]];
  };
  try {
    delete require.cache[require.resolve('../src/services/ownerCustomerReportService')];
    const dv = require('../src/services/ownerCustomerReportService');
    const kq = await dv.lietKeKhach(1, { sapXep: 'chi-tieu', trang: 2, soDong: 5, tuKhoa: 'an' });
    assert.equal(kq.sapXep, 'chi-tieu');
    assert.equal(kq.cacKhach[0].khachQuayLai, true);
    assert.match(sqls.at(-1).sql, /ORDER BY k\.tongChiTieu DESC/);
    assert.deepEqual(sqls.at(-1).tham.slice(-2), [5, 5]); // LIMIT 5 OFFSET 5
    const sapXepLa = await dv.lietKeKhach(1, { sapXep: 'bay-ba' });
    assert.equal(sapXepLa.sapXep, 'luot-dat');
  } finally { db.pool.query = goc; }
});
