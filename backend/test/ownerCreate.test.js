const test = require('node:test');
const assert = require('node:assert/strict');

const cacLenhGhi = [];
let chuSanCuaSan = 3;
let coDonTrung = false;
const ketNoiGia = {
  async query(sql, thamSo = []) {
    if (/FROM San s JOIN CoSo cs/.test(sql)) {
      return [[{
        maSan: 5, maCoSo: 2, tenSan: 'Sân 1', trangThaiSan: 'active', tenCoSo: 'CS', diaChi: '', tinhThanh: '',
        quanHuyen: '', gioMoCua: '05:00:00', gioDongCua: '22:00:00', soPhutDatToiThieu: 60, maChuSan: chuSanCuaSan,
      }]];
    }
    if (/SELECT MaDatSan FROM DatSan/.test(sql)) return [[coDonTrung ? { MaDatSan: 1 } : undefined]];
    if (/SELECT MaKhoa FROM KhoaSan/.test(sql)) return [[undefined]];
    if (/FROM BangGia/.test(sql)) {
      return [[{ gioBatDau: '05:00:00', gioKetThuc: '22:00:00', giaMoiGio: 80000 }]];
    }
    cacLenhGhi.push({ sql, thamSo });
    return [{ insertId: 100 + cacLenhGhi.length, affectedRows: 1 }];
  },
};
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (ham) => ham(ketNoiGia) },
};
const dichVu = require('../src/services/ownerBookingService');
const { taoDon } = require('../src/validators/ownerReport');

const donLe = {
  maSan: 5, ngay: '2030-01-07', gioBatDau: '18:00', gioKetThuc: '19:30',
  tenKhach: 'Nguyen Van A', soDienThoai: '0338484839',
};
const layInsertDon = () => cacLenhGhi.filter((q) => /INSERT INTO DatSan/.test(q.sql));

test('Chủ sân tạo đơn lẻ: xác nhận ngay, Nguon=owner, không hoa hồng, không có thanh toán QR', async () => {
  cacLenhGhi.length = 0;
  const ketQua = await dichVu.taoDon(3, { ...donLe, daThu: true });
  assert.equal(ketQua.trangThai, 'confirmed');
  assert.equal(ketQua.trangThaiThu, 'paid');
  assert.equal(ketQua.tongTien, 120000); // 1,5 giờ × 80.000
  assert.equal(ketQua.cacDon.length, 1);
  const [don] = layInsertDon();
  assert.match(don.sql, /'owner'/);
  assert.match(don.sql, /'confirmed'\)/);
  assert.equal(cacLenhGhi.some((q) => /INSERT INTO ThanhToan/.test(q.sql)), false);
  assert.equal(cacLenhGhi.some((q) => /INSERT INTO LichCoDinh/.test(q.sql)), false);
});

test('Chủ sân tạo đơn: mặc định chưa thu tiền (unpaid)', async () => {
  cacLenhGhi.length = 0;
  const ketQua = await dichVu.taoDon(3, donLe);
  assert.equal(ketQua.trangThaiThu, 'unpaid');
});

test('Chủ sân tạo đơn cố định nhiều ngày: tạo LichCoDinh + mỗi ngày 1 đơn', async () => {
  cacLenhGhi.length = 0;
  const ketQua = await dichVu.taoDon(3, { ...donLe, ngayKetThuc: '2030-01-09' });
  assert.equal(ketQua.loaiKhach, 'fixed');
  assert.equal(ketQua.soNgay, 3);
  assert.equal(ketQua.tongTien, 360000);
  assert.equal(layInsertDon().length, 3);
  assert.equal(cacLenhGhi.filter((q) => /INSERT INTO LichCoDinh/.test(q.sql)).length, 1);
});

test('Chủ sân không tạo được đơn cho sân của người khác → 404', async () => {
  chuSanCuaSan = 99;
  await assert.rejects(dichVu.taoDon(3, donLe), { maTrangThai: 404 });
  chuSanCuaSan = 3;
});

test('Trùng lịch → 409, không ghi đơn nào', async () => {
  cacLenhGhi.length = 0;
  coDonTrung = true;
  await assert.rejects(dichVu.taoDon(3, donLe), { maTrangThai: 409 });
  assert.equal(layInsertDon().length, 0);
  coDonTrung = false;
});

test('Validator tạo đơn: thiếu tên/SĐT, giờ lệch 30 phút, ngày kết thúc trước ngày bắt đầu → lỗi', () => {
  assert.equal(taoDon.body.safeParse(donLe).success, true);
  assert.equal(taoDon.body.safeParse({ ...donLe, tenKhach: '' }).success, false);
  assert.equal(taoDon.body.safeParse({ ...donLe, soDienThoai: '12' }).success, false);
  assert.equal(taoDon.body.safeParse({ ...donLe, gioBatDau: '18:10' }).success, false);
  assert.equal(taoDon.body.safeParse({ ...donLe, gioKetThuc: '17:00' }).success, false);
  assert.equal(taoDon.body.safeParse({ ...donLe, ngayKetThuc: '2030-01-01' }).success, false);
});
