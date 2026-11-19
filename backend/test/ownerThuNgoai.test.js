// Đơn chủ sân tạo (Nguon='owner', thu tiền ngoài hệ thống): doanh thu, đánh dấu đã thu, huỷ, công nợ.
// Phần 1 (validator + logic bằng DB giả) luôn chạy. Phần 2 chạy SQL thật trên MySQL/MariaDB local
// (db_sancaulong đã nạp db_sancaulong.sql); tự bỏ qua nếu không kết nối được. Dữ liệu thử dùng ngày năm 2099, dọn sau khi chạy.
const test = require('node:test');
const assert = require('node:assert/strict');
const kiemTra = require('../src/validators/ownerReport');

// ---------- Phần 1: validator ----------
test('Validator da-thu / huy / cong-no', () => {
  assert.equal(kiemTra.daThuDon.query.safeParse({}).success, true);
  assert.equal(kiemTra.daThuDon.query.parse({ tatCaBuoi: 'true' }).tatCaBuoi, true);
  assert.equal(kiemTra.daThuDon.query.safeParse({ tatCaBuoi: 'abc' }).success, false);
  assert.equal(kiemTra.daThuDon.body.safeParse({}).success, true);
  assert.equal(kiemTra.huyDonOwner.body.safeParse({}).success, true); // lý do tuỳ chọn
  assert.equal(kiemTra.huyDonOwner.body.safeParse({ lyDo: 'k' }).success, false);
  assert.equal(kiemTra.congNo.query.safeParse({ maCoSo: '2' }).success, true);
  assert.equal(kiemTra.congNo.query.safeParse({ maCoSo: '-1' }).success, false);
});

// ---------- Phần 1b: 404/409 bằng DB giả ----------
test('Đơn app → 409; đơn cơ sở khác → 404 (da-thu và huy)', async () => {
  let donTimThay;
  const ketNoiGia = { async query() { return [[donTimThay], []]; } };
  const dbPath = require.resolve('../src/config/db');
  const goc = require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: { pool: ketNoiGia, thucHienGiaoDich: async (ham) => ham(ketNoiGia) },
  };
  delete require.cache[require.resolve('../src/services/ownerBookingService')];
  const dichVu = require('../src/services/ownerBookingService');
  try {
    donTimThay = undefined;
    await assert.rejects(dichVu.danhDauDaThu(3, 1), { maTrangThai: 404 });
    await assert.rejects(dichVu.huyDonOwner(3, 1), { maTrangThai: 404 });
    donTimThay = { maDatSan: 1, maDon: 'X', nguon: 'app', trangThai: 'confirmed', trangThaiThu: null, ngay: '2099-01-01', gioKetThuc: '10:00:00' };
    await assert.rejects(dichVu.danhDauDaThu(3, 1), { maTrangThai: 409 });
    await assert.rejects(dichVu.huyDonOwner(3, 1), { maTrangThai: 409 });
  } finally {
    if (goc) require.cache[dbPath] = goc; else delete require.cache[dbPath];
    delete require.cache[require.resolve('../src/services/ownerBookingService')];
  }
});

// ---------- Phần 2: SQL thật ----------
const mysql = require('mysql2/promise');
const MA_CHU_SAN = 2; // seed: chủ sân 2, cơ sở 1 (sân 1-4), cơ sở 2 (sân 5-6)
const MA_CHU_SAN_KHAC = 3;
const NGAY = '2099-01-10';
const LOC = { tuNgay: '2099-01-01', denNgay: '2099-01-31' };

let coDb = false;
let dichVuDon; let dichVuBaoCao; let ketNoiThuc;

const doanhThu = async (maCoSo = 1) => (await dichVuBaoCao.layDoanhThu(MA_CHU_SAN, { ...LOC, maCoSo })).tongCong;
async function don409App(nguon = 'app') {
  const [r] = await ketNoiThuc.query(
    `INSERT INTO DatSan (MaDon,TenKhach,SoDienThoaiLienHe,Nguon,LoaiKhach,MaSan,NgayChoi,GioBatDau,GioKetThuc,SoPhut,TongTien,
       PhiNenTang,TienChuSan,TrangThaiThu,TrangThai)
     VALUES (?, 'TN', '0338484839', ?, 'walk_in', 2, '2099-01-12', '08:00', '09:00', 60, 100000, 0, 100000, ?, 'confirmed')`,
    [`TNGT${Date.now().toString(36)}${nguon}`.slice(0, 20), nguon, nguon === 'owner' ? 'paid' : null]);
  return r.insertId;
}
async function don(rieng = {}) { return taoDonThuc(rieng); }
async function taoDonThuc(rieng) {
  return dichVuDon.taoDon(MA_CHU_SAN, {
    maSan: 1, ngay: NGAY, gioBatDau: '18:00', gioKetThuc: '19:00',
    tenKhach: 'Khách thử TN', soDienThoai: '0338484839', daThu: true, ...rieng,
  });
}
async function donQuaKhu() {
  const [r] = await ketNoiThuc.query(
    `INSERT INTO DatSan (MaDon,TenKhach,SoDienThoaiLienHe,Nguon,LoaiKhach,MaSan,NgayChoi,GioBatDau,GioKetThuc,SoPhut,TongTien,
       PhiNenTang,TienChuSan,TrangThaiThu,TrangThai)
     VALUES (?, 'TN', '0338484839', 'owner', 'walk_in', 3, '2020-01-12', '08:00', '09:00', 60, 100000, 0, 100000, 'paid', 'confirmed')`,
    [`TNGT${Date.now().toString(36)}qk`.slice(0, 20)]);
  return r.insertId;
}

async function don_xoa() {
  await ketNoiThuc.query(
    `DELETE d FROM DatSan d WHERE d.TenKhach IN ('Khách thử TN','TN') AND (d.NgayChoi >= '2099-01-01' OR d.NgayChoi = '2020-01-12')`);
  await ketNoiThuc.query(`DELETE FROM LichCoDinh WHERE TenKhach = 'Khách thử TN'`);
  await ketNoiThuc.query(`DELETE FROM NhatKyHeThong WHERE HanhDong IN ('thu_tien_don','huy_don_ngoai_he_thong') AND MaNguoiThucHien = ?`, [MA_CHU_SAN]);
}

test.before(async () => {
  try {
    const cauHinh = require('../src/config/env').coSoDuLieu;
    ketNoiThuc = await mysql.createConnection({
      host: cauHinh.mayChu, port: cauHinh.cong, user: cauHinh.nguoiDung, password: cauHinh.matKhau,
      database: cauHinh.ten, timezone: '+07:00', dateStrings: true, decimalNumbers: true,
    });
    const [[{ soSan }]] = await ketNoiThuc.query('SELECT COUNT(*) AS soSan FROM San s JOIN CoSo cs USING(MaCoSo) WHERE s.MaSan=1 AND cs.MaChuSan=?', [MA_CHU_SAN]);
    coDb = soSan === 1;
  } catch { coDb = false; }
  if (!coDb) return;
  dichVuDon = require('../src/services/ownerBookingService');
  dichVuBaoCao = require('../src/services/ownerReportService');
  await don_xoa();
});
test.after(async () => {
  if (ketNoiThuc) {
    if (coDb) await don_xoa();
    await ketNoiThuc.end();
  }
  const { pool } = require('../src/config/db');
  await pool.end();
});

test('DB: đơn owner đã thu vào doanh thu, đúng bằng tổng tiền; phí nền tảng 0', async (t) => {
  if (!coDb) return t.skip('không có DB');
  const truoc = await doanhThu();
  const kq = await don();
  const sau = await doanhThu();
  assert.equal(sau.doanhThu - truoc.doanhThu, kq.tongTien);
  assert.equal(sau.doanhThuNgoaiHeThong - truoc.doanhThuNgoaiHeThong, kq.tongTien);
  assert.equal(sau.soLuotDat - truoc.soLuotDat, 1);
  assert.equal(sau.soLuotDatNgoaiHeThong - truoc.soLuotDatNgoaiHeThong, 1);
  assert.equal(sau.phiNenTang - truoc.phiNenTang, 0);
  assert.equal(sau.tienChuSan - truoc.tienChuSan, kq.tongTien);
  const bc = await dichVuBaoCao.layDoanhThu(MA_CHU_SAN, { ...LOC, maCoSo: 1 });
  const ngay = bc.theoNgay.find((d) => d.ngay === NGAY);
  assert.equal(ngay.doanhThuNgoaiHeThong, kq.tongTien);
  assert.equal(bc.theoThang[0].soLuotDatNgoaiHeThong, 1);
  assert.equal(bc.theoNam[0].doanhThuNgoaiHeThong, kq.tongTien);
  // cơ sở khác không bị ảnh hưởng
  assert.equal((await doanhThu(2)).doanhThu, 0);
  await don_xoa();
});

test('DB: đơn chưa thu → không vào doanh thu, có trong công nợ (lọc cơ sở); đánh dấu đã thu → vào doanh thu, ra khỏi công nợ', async (t) => {
  if (!coDb) return t.skip('không có DB');
  const truoc = await doanhThu();
  const kq = await don({ daThu: false });
  const maDatSan = kq.cacDon[0].maDatSan;
  assert.equal((await doanhThu()).doanhThu, truoc.doanhThu);
  let congNo = await dichVuBaoCao.layCongNo(MA_CHU_SAN, { maCoSo: 1 });
  assert.ok(congNo.cacDon.some((d) => d.maDatSan === maDatSan));
  assert.ok(congNo.tongNo >= kq.tongTien);
  congNo = await dichVuBaoCao.layCongNo(MA_CHU_SAN, { maCoSo: 2 });
  assert.equal(congNo.cacDon.some((d) => d.maDatSan === maDatSan), false); // lọc theo cơ sở

  // chủ sân khác → 404
  await assert.rejects(dichVuDon.danhDauDaThu(MA_CHU_SAN_KHAC, maDatSan), { maTrangThai: 404 });
  const ketQua = await dichVuDon.danhDauDaThu(MA_CHU_SAN, maDatSan);
  assert.equal(ketQua.trangThaiThu, 'paid');
  assert.equal((await doanhThu()).doanhThu - truoc.doanhThu, kq.tongTien);
  congNo = await dichVuBaoCao.layCongNo(MA_CHU_SAN, { maCoSo: 1 });
  assert.equal(congNo.cacDon.some((d) => d.maDatSan === maDatSan), false);
  await assert.rejects(dichVuDon.danhDauDaThu(MA_CHU_SAN, maDatSan), { maTrangThai: 409 }); // đã thu
  const [[nk]] = await ketNoiThuc.query(`SELECT COUNT(*) AS n FROM NhatKyHeThong WHERE HanhDong='thu_tien_don' AND MaDoiTuong=?`, [maDatSan]);
  assert.equal(nk.n, 1);
  await don_xoa();
});

test('DB: huỷ đơn owner đã thu → doanh thu trừ lại, ô trống lại (đặt lại được), không hoàn tiền; huỷ lần 2 → 409', async (t) => {
  if (!coDb) return t.skip('không có DB');
  const truoc = await doanhThu();
  const kq = await don();
  const maDatSan = kq.cacDon[0].maDatSan;
  await assert.rejects(dichVuDon.huyDonOwner(MA_CHU_SAN_KHAC, maDatSan), { maTrangThai: 404 });
  const huy = await dichVuDon.huyDonOwner(MA_CHU_SAN, maDatSan, { lyDo: 'Khách báo bận' });
  assert.equal(huy.daHuy, true);
  assert.equal(huy.soTienTruKhoiDoanhThu, kq.tongTien);
  const sau = await doanhThu();
  assert.equal(sau.doanhThu, truoc.doanhThu);
  assert.equal(sau.doanhThuNgoaiHeThong, truoc.doanhThuNgoaiHeThong);
  assert.equal(sau.soLuotDat, truoc.soLuotDat);
  await assert.rejects(dichVuDon.huyDonOwner(MA_CHU_SAN, maDatSan), { maTrangThai: 409 });
  await assert.rejects(dichVuDon.danhDauDaThu(MA_CHU_SAN, maDatSan), { maTrangThai: 409 });
  // lịch được giải phóng: đặt lại đúng giờ đó thành công
  const lai = await don();
  assert.equal(lai.cacDon.length, 1);
  await don_xoa();
});

test('DB: đơn khách đặt qua app → 409 cho da-thu/huy; đơn đã chơi xong → 409 khi huỷ', async (t) => {
  if (!coDb) return t.skip('không có DB');
  const maApp = await don409App('app');
  await assert.rejects(dichVuDon.danhDauDaThu(MA_CHU_SAN, maApp), { maTrangThai: 409 });
  await assert.rejects(dichVuDon.huyDonOwner(MA_CHU_SAN, maApp), { maTrangThai: 409 });
  const maQuaKhu = await donQuaKhu();
  await assert.rejects(dichVuDon.huyDonOwner(MA_CHU_SAN, maQuaKhu), { maTrangThai: 409 });
  await don_xoa();
});

test('DB: khách cố định — da-thu 1 buổi (mặc định) hay cả lịch (tatCaBuoi); huỷ 1 buổi / cả lịch', async (t) => {
  if (!coDb) return t.skip('không có DB');
  const kq = await don({ daThu: false, ngayKetThuc: '2099-01-12' }); // 3 buổi
  assert.equal(kq.cacDon.length, 3);
  const [b1, b2] = kq.cacDon;
  assert.equal((await dichVuDon.danhDauDaThu(MA_CHU_SAN, b1.maDatSan)).soBuoiDaThu, 1);
  assert.equal((await doanhThu()).soLuotDatNgoaiHeThong, 1);
  const hangLoat = await dichVuDon.danhDauDaThu(MA_CHU_SAN, b2.maDatSan, true);
  assert.equal(hangLoat.soBuoiDaThu, 2); // chỉ 2 buổi còn lại chưa thu
  assert.equal((await doanhThu()).soLuotDatNgoaiHeThong, 3);
  assert.equal((await doanhThu()).doanhThuNgoaiHeThong, kq.tongTien);
  assert.equal((await dichVuDon.huyDonOwner(MA_CHU_SAN, b1.maDatSan)).soBuoiHuy, 1);
  assert.equal((await doanhThu()).soLuotDatNgoaiHeThong, 2);
  const huyCaLich = await dichVuDon.huyDonOwner(MA_CHU_SAN, b2.maDatSan, { tatCaBuoi: true });
  assert.equal(huyCaLich.soBuoiHuy, 2);
  assert.equal((await doanhThu()).doanhThuNgoaiHeThong, 0);
  const [[lich]] = await ketNoiThuc.query('SELECT TrangThai FROM LichCoDinh WHERE MaLichCoDinh=?', [kq.maLichCoDinh]);
  assert.equal(lich.TrangThai, 'cancelled');
  await don_xoa();
});
