// Task 1.3: KhoaSan nhận khoảng tuNgay–denNgay → tách bản ghi theo ngày, không khóa đè đơn.
const test = require('node:test');
const assert = require('node:assert/strict');

const cacLenh = [];
let cacNgayCoDon = [];   // ngày đã có đơn giữ slot (giả lập kết quả truy vấn DatSan)
let cacNgayDaKhoa = [];  // ngày đã có khóa phủ kín khung giờ
let dongMaKhoa = 500;
const ketNoiGia = {
  async query(sql, thamSo = []) {
    if (/FROM San s JOIN CoSo cs/.test(sql)) return [[{ maSan: 5, maCoSo: 2, tenSan: 'Sân 1', trangThai: 'active' }]];
    if (/FROM DatSan/.test(sql)) { cacLenh.push({ sql, thamSo }); return [cacNgayCoDon.map((ngay) => ({ ngay }))]; }
    if (/SELECT DATE_FORMAT\(NgayKhoa/.test(sql)) { cacLenh.push({ sql, thamSo }); return [cacNgayDaKhoa.map((ngay) => ({ ngay }))]; }
    if (/INSERT INTO KhoaSan/.test(sql)) { cacLenh.push({ sql, thamSo }); return [{ insertId: ++dongMaKhoa, affectedRows: 1 }]; }
    return [[]];
  },
};
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (ham) => ham(ketNoiGia) },
};
delete require.cache[require.resolve('../src/services/ownerService')];
const dichVu = require('../src/services/ownerService');
const { lietKeNgay, chuanHoaYeuCauKhoa } = require('../src/utils/khoaSan');
const { khoaSan: kiemTraKhoa } = require('../src/validators/owner');

const layInsert = () => cacLenh.filter((q) => /INSERT INTO KhoaSan/.test(q.sql));
const dat = () => { cacLenh.length = 0; cacNgayCoDon = []; cacNgayDaKhoa = []; };
const dangMoi = { maSan: 5, tuNgay: '2030-03-01', denNgay: '2030-03-03', gioBatDau: '08:00', gioKetThuc: '10:00', lyDo: 'Sửa sàn' };

// ---- hàm thuần ----
test('lietKeNgay: gồm cả hai đầu, qua tháng/năm nhuận đúng', () => {
  assert.deepEqual(lietKeNgay('2030-03-01', '2030-03-01'), ['2030-03-01']);
  assert.deepEqual(lietKeNgay('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.deepEqual(lietKeNgay('2030-12-30', '2031-01-01'), ['2030-12-30', '2030-12-31', '2031-01-01']);
});

test('lietKeNgay: tối đa 90 ngày, ngày kết thúc không trước ngày bắt đầu, ngày không có thật bị từ chối', () => {
  assert.equal(lietKeNgay('2030-01-01', '2030-03-31').length, 90);
  assert.throws(() => lietKeNgay('2030-01-01', '2030-04-01'), /tối đa 90 ngày/);
  assert.throws(() => lietKeNgay('2030-03-05', '2030-03-04'), /Ngày kết thúc/);
  assert.throws(() => lietKeNgay('2030-02-30', '2030-03-01'), /YYYY-MM-DD/);
});

test('chuanHoaYeuCauKhoa: dạng cũ 1 ngày giữ nguyên; khác ngày bị từ chối; denNgay bỏ trống = 1 ngày', () => {
  const cu = chuanHoaYeuCauKhoa({ thoiGianBatDau: '2030-03-01T12:00', thoiGianKetThuc: '2030-03-01 14:00' });
  assert.deepEqual(cu, { kieu: 'mot-ngay', cacNgay: ['2030-03-01'], gioBatDau: '12:00', gioKetThuc: '14:00' });
  assert.throws(() => chuanHoaYeuCauKhoa({ thoiGianBatDau: '2030-03-01 12:00', thoiGianKetThuc: '2030-03-02 14:00' }), /cùng một ngày/);
  const moi = chuanHoaYeuCauKhoa({ tuNgay: '2030-03-01', gioBatDau: '08:00', gioKetThuc: '10:00' });
  assert.deepEqual(moi.cacNgay, ['2030-03-01']);
});

// ---- validator ----
test('Validator: nhận cả hai dạng, từ chối trộn lẫn / thiếu / giờ ngược / ngày ngược', () => {
  const ok = (body) => kiemTraKhoa.body.safeParse(body).success;
  assert.ok(ok({ maSan: 5, thoiGianBatDau: '2030-03-01 12:00', thoiGianKetThuc: '2030-03-01 14:00' }));
  assert.ok(ok(dangMoi));
  assert.ok(ok({ maSan: 5, tuNgay: '2030-03-01', gioBatDau: '08:00', gioKetThuc: '10:00' }));
  assert.ok(!ok({ maSan: 5 }));
  assert.ok(!ok({ ...dangMoi, thoiGianBatDau: '2030-03-01 12:00', thoiGianKetThuc: '2030-03-01 14:00' }));
  assert.ok(!ok({ ...dangMoi, gioKetThuc: '08:00' }));
  assert.ok(!ok({ ...dangMoi, denNgay: '2030-02-28' }));
  assert.ok(!ok({ maSan: 5, tuNgay: '2030-03-01', gioBatDau: '08:00' }));
  assert.ok(!ok({ ...dangMoi, gioBatDau: '8:00' }));
});

// ---- service ----
test('Khoảng 3 ngày: tách 3 bản ghi, mỗi ngày cùng khung giờ', async () => {
  dat();
  const kq = await dichVu.taoKhoaSan(3, dangMoi);
  const ghi = layInsert();
  assert.equal(ghi.length, 3);
  assert.deepEqual(ghi.map((g) => g.thamSo[1]), ['2030-03-01', '2030-03-02', '2030-03-03']);
  assert.ok(ghi.every((g) => g.thamSo[2] === '08:00' && g.thamSo[3] === '10:00' && g.thamSo[4] === 'Sửa sàn'));
  assert.equal(kq.soNgayKhoa, 3);
  assert.equal(kq.soNgayBoQua, 0);
  assert.deepEqual(kq.cacKhoa.map((k) => k.ngay), ['2030-03-01', '2030-03-02', '2030-03-03']);
});

test('Không khóa đè đơn: một ngày trong khoảng có đơn → 409, KHÔNG ghi bản ghi nào (kể cả các ngày trống)', async () => {
  dat();
  cacNgayCoDon = ['2030-03-02'];
  await assert.rejects(dichVu.taoKhoaSan(3, dangMoi), (loi) => {
    assert.equal(loi.maTrangThai, 409);
    assert.match(loi.message, /2030-03-02/);
    assert.deepEqual(loi.chiTiet.cacNgayTrung, ['2030-03-02']);
    return true;
  });
  assert.equal(layInsert().length, 0);
});

test('Truy vấn kiểm đơn dùng SLOT_BAN, giao nhau theo giờ và cả khoảng ngày', async () => {
  dat();
  await dichVu.taoKhoaSan(3, dangMoi);
  const truyVan = cacLenh.find((q) => /FROM DatSan/.test(q.sql));
  assert.match(truyVan.sql, /pending_payment/);
  assert.match(truyVan.sql, /FOR UPDATE/);
  assert.match(truyVan.sql, /GioBatDau < \? AND GioKetThuc > \?/);
  assert.deepEqual(truyVan.thamSo, [5, '2030-03-01', '2030-03-03', '10:00', '08:00']);
});

test('Ngày đã có khóa phủ kín khung giờ thì bỏ qua, không sinh bản ghi trùng', async () => {
  dat();
  cacNgayDaKhoa = ['2030-03-02'];
  const kq = await dichVu.taoKhoaSan(3, dangMoi);
  assert.deepEqual(layInsert().map((g) => g.thamSo[1]), ['2030-03-01', '2030-03-03']);
  assert.equal(kq.soNgayKhoa, 2);
  assert.equal(kq.soNgayBoQua, 1);
});

test('Dạng cũ (1 ngày) vẫn chạy và giữ nguyên dạng trả về', async () => {
  dat();
  const kq = await dichVu.taoKhoaSan(3, { maSan: 5, thoiGianBatDau: '2030-03-01T12:00', thoiGianKetThuc: '2030-03-01T14:00' });
  assert.equal(layInsert().length, 1);
  assert.equal(typeof kq.maKhoa, 'number');
  assert.equal(kq.thoiGianBatDau, '2030-03-01 12:00');
  assert.equal(kq.thoiGianKetThuc, '2030-03-01 14:00');
  assert.equal(kq.cacKhoa, undefined);
});

test('Dạng cũ có đơn trùng → 409 như trước', async () => {
  dat();
  cacNgayCoDon = ['2030-03-01'];
  await assert.rejects(
    dichVu.taoKhoaSan(3, { maSan: 5, thoiGianBatDau: '2030-03-01 12:00', thoiGianKetThuc: '2030-03-01 14:00' }),
    (loi) => loi.maTrangThai === 409);
  assert.equal(layInsert().length, 0);
});

test('Khoảng quá 90 ngày bị từ chối trước khi ghi', async () => {
  dat();
  await assert.rejects(
    dichVu.taoKhoaSan(3, { ...dangMoi, tuNgay: '2030-01-01', denNgay: '2030-06-01' }),
    (loi) => loi.maTrangThai === 400 && /90 ngày/.test(loi.message));
  assert.equal(layInsert().length, 0);
});
