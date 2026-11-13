const test = require('node:test');
const assert = require('node:assert/strict');
const kiemTra = require('../src/validators/ownerReport');

test('doanh thu: nhan nam, thang, khoang ngay, co so', () => {
  const q = kiemTra.doanhThu.query;
  assert.equal(q.safeParse({}).success, true);
  assert.equal(q.safeParse({ nam: '2026' }).success, true);
  assert.equal(q.safeParse({ nam: '2026', thang: '11' }).success, true);
  assert.equal(q.safeParse({ tuNgay: '2026-11-01', denNgay: '2026-11-13', maCoSo: '2' }).success, true);
});

test('doanh thu: tu choi thang thieu nam, khoang ngay nguoc, thang sai', () => {
  const q = kiemTra.doanhThu.query;
  assert.equal(q.safeParse({ thang: '11' }).success, false);
  assert.equal(q.safeParse({ tuNgay: '2026-11-13', denNgay: '2026-11-01' }).success, false);
  assert.equal(q.safeParse({ nam: '2026', thang: '13' }).success, false);
});

test('danh sach don: sapXep chi nhan moi-nhat / cu-nhat', () => {
  const q = kiemTra.danhSachDon.query;
  assert.equal(q.safeParse({ sapXep: 'moi-nhat' }).success, true);
  assert.equal(q.safeParse({ sapXep: 'cu-nhat', ngay: '2026-11-13' }).success, true);
  assert.equal(q.safeParse({ sapXep: 'DESC; DROP' }).success, false);
});

test('service don: mac dinh ORDER BY DESC, cu-nhat thi ASC', async () => {
  const db = require('../src/config/db');
  const goc = db.pool.query;
  const sqls = [];
  db.pool.query = async (sql) => { sqls.push(sql); return /COUNT/.test(sql) ? [[{ tong: 0 }]] : [[]]; };
  try {
    delete require.cache[require.resolve('../src/services/ownerBookingService')];
    const dv = require('../src/services/ownerBookingService');
    let kq = await dv.lietKeDon(1, {});
    assert.equal(kq.sapXep, 'moi-nhat');
    assert.match(sqls.at(-1), /ORDER BY d\.NgayChoi DESC, d\.GioBatDau DESC/);
    kq = await dv.lietKeDon(1, { sapXep: 'cu-nhat' });
    assert.equal(kq.sapXep, 'cu-nhat');
    assert.match(sqls.at(-1), /ORDER BY d\.NgayChoi ASC, d\.GioBatDau ASC/);
  } finally { db.pool.query = goc; }
});

test('service doanh thu: loc khoang ngay + co so, tra tongCong', async () => {
  const db = require('../src/config/db');
  const goc = db.pool.query;
  const goi = [];
  db.pool.query = async (sql, tham) => {
    goi.push({ sql, tham });
    if (/COALESCE\(SUM/.test(sql)) return [[{ doanhThu: '300000', phiNenTang: '30000', tienChuSan: '270000', soLuotDat: 3 }]];
    return [[]];
  };
  try {
    delete require.cache[require.resolve('../src/services/ownerReportService')];
    const dv = require('../src/services/ownerReportService');
    const kq = await dv.layDoanhThu(5, { tuNgay: '2026-11-01', denNgay: '2026-11-13', maCoSo: 2, nam: 2026 });
    assert.equal(kq.tongCong.doanhThu, 300000);
    assert.equal(kq.boLoc.nam, null); // khoang ngay uu tien hon nam
    const truyVan = goi.find((g) => /GROUP BY d\.NgayChoi/.test(g.sql));
    assert.deepEqual(truyVan.tham, [5, 2, '2026-11-01', '2026-11-13']);
    assert.match(truyVan.sql, /cs\.MaCoSo=\?/);
    assert.doesNotMatch(truyVan.sql, /YEAR\(d\.NgayChoi\)=\?/);
  } finally { db.pool.query = goc; }
});
