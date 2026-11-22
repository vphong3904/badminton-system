// Task 2.2: hàm thuần gopKhoiLienKe (DAT_NHIEU_SAN_NHIEU_KHUNG_GIO.md mục 3 và mục 7, ca 1–8).
const test = require('node:test');
const assert = require('node:assert/strict');
const { gopKhoiLienKe } = require('../src/utils/khoiLienKe');
const AppError = require('../src/utils/AppError');

const NGAY = '2026-11-28';
const muc = (maSan, gioBatDau, gioKetThuc, ngay = NGAY) => ({ maSan, ngay, gioBatDau, gioKetThuc });
const cum = (maSan, gioBatDau, gioKetThuc, soPhut, ngay = NGAY) => ({ maSan, ngay, gioBatDau, gioKetThuc, soPhut });

// ---- Ca 1–4: gộp ----

test('1. Hai mục chạm nhau cùng sân/ngày gộp thành 1 cụm', () => {
  const { cacCum } = gopKhoiLienKe([muc(1, '12:00', '13:00'), muc(1, '13:00', '14:00')], 60);
  assert.deepEqual(cacCum, [cum(1, '12:00', '14:00', 120)]);
});

test('1b. Chuỗi 3 mục liền nhau nhập lộn thứ tự vẫn gộp thành 1 cụm', () => {
  const { cacCum } = gopKhoiLienKe([muc(1, '14:00', '15:00'), muc(1, '12:00', '13:00'), muc(1, '13:00', '14:00')], 60);
  assert.deepEqual(cacCum, [cum(1, '12:00', '15:00', 180)]);
});

test('2. Hai mục cách nhau 30 phút là 2 cụm', () => {
  const { cacCum } = gopKhoiLienKe([muc(1, '12:00', '13:00'), muc(1, '13:30', '14:30')], 60);
  assert.deepEqual(cacCum, [cum(1, '12:00', '13:00', 60), cum(1, '13:30', '14:30', 60)]);
});

test('3. Mục chồng nhau / trùng hẳn / nằm trong nhau gộp 1 cụm, không đếm đôi', () => {
  assert.deepEqual(
    gopKhoiLienKe([muc(1, '12:00', '14:00'), muc(1, '13:00', '15:00')], 60).cacCum,
    [cum(1, '12:00', '15:00', 180)]);
  assert.deepEqual(
    gopKhoiLienKe([muc(1, '12:00', '14:00'), muc(1, '12:00', '14:00')], 60).cacCum,
    [cum(1, '12:00', '14:00', 120)]);
  assert.deepEqual(
    gopKhoiLienKe([muc(1, '12:00', '15:00'), muc(1, '13:00', '14:00')], 60).cacCum,
    [cum(1, '12:00', '15:00', 180)]);
});

test('4. Cùng giờ khác sân là 2 cụm; cùng sân khác ngày là 2 cụm', () => {
  assert.deepEqual(
    gopKhoiLienKe([muc(1, '12:00', '13:00'), muc(2, '12:00', '13:00')], 60).cacCum,
    [cum(1, '12:00', '13:00', 60), cum(2, '12:00', '13:00', 60)]);
  assert.deepEqual(
    gopKhoiLienKe([muc(1, '12:00', '13:00'), muc(1, '12:00', '13:00', '2026-11-29')], 60).cacCum,
    [cum(1, '12:00', '13:00', 60), cum(1, '12:00', '13:00', 60, '2026-11-29')]);
});

test('4b. Giờ liền kề nhưng khác sân hoặc khác ngày KHÔNG gộp', () => {
  assert.equal(gopKhoiLienKe([muc(1, '12:00', '13:00'), muc(2, '13:00', '14:00')], 60).cacCum.length, 2);
  assert.equal(gopKhoiLienKe([muc(1, '12:00', '13:00'), muc(1, '13:00', '14:00', '2026-11-29')], 60).cacCum.length, 2);
});

// ---- Ca 5: thứ tự xác định ----

test('5. Mọi hoán vị đầu vào cho cùng kết quả; cụm sắp theo (ngày, giờ bắt đầu, sân)', () => {
  const dau = [
    muc(2, '18:00', '19:00'), muc(1, '18:00', '19:00'), muc(1, '19:00', '20:00'),
    muc(3, '08:00', '09:00', '2026-11-29'), muc(2, '07:00', '08:00'),
  ];
  const mongDoi = [
    cum(2, '07:00', '08:00', 60),
    cum(1, '18:00', '20:00', 120),
    cum(2, '18:00', '19:00', 60),
    cum(3, '08:00', '09:00', 60, '2026-11-29'),
  ];
  const hoanVi = (mang) => (mang.length <= 1 ? [mang]
    : mang.flatMap((phanTu, i) => hoanVi([...mang.slice(0, i), ...mang.slice(i + 1)]).map((ds) => [phanTu, ...ds])));
  const tatCa = hoanVi(dau);
  assert.equal(tatCa.length, 120);
  for (const dsMuc of tatCa) assert.deepEqual(gopKhoiLienKe(dsMuc, 60).cacCum, mongDoi);
});

test('5b. Không sửa mảng đầu vào', () => {
  const dau = [muc(1, '13:00', '14:00'), muc(1, '12:00', '13:00')];
  const ban = JSON.parse(JSON.stringify(dau));
  gopKhoiLienKe(dau, 60);
  assert.deepEqual(dau, ban);
});

// ---- Ca 6: tối thiểu theo cụm sau gộp ----

test('6. Tối thiểu 120: 60+60 liền kề cùng sân hợp lệ', () => {
  const { cacCum, cacCumNgan } = gopKhoiLienKe([muc(1, '11:00', '12:00'), muc(1, '12:00', '13:00')], 120);
  assert.deepEqual(cacCum, [cum(1, '11:00', '13:00', 120)]);
  assert.deepEqual(cacCumNgan, []);
});

test('6b. Tối thiểu 120: một mục 60 phút nằm trong cacCumNgan kèm soPhutToiThieu', () => {
  const { cacCumNgan } = gopKhoiLienKe([muc(1, '11:00', '12:00')], 120);
  assert.deepEqual(cacCumNgan, [{ ...cum(1, '11:00', '12:00', 60), soPhutToiThieu: 120 }]);
});

test('6c. Tối thiểu 120: 60 phút sân 1 + 60 phút sân 2 liền giờ là 2 cụm ngắn', () => {
  const { cacCum, cacCumNgan } = gopKhoiLienKe([muc(1, '11:00', '12:00'), muc(2, '12:00', '13:00')], 120);
  assert.equal(cacCum.length, 2);
  assert.deepEqual(cacCumNgan.map((c) => c.maSan), [1, 2]);
});

test('6d. Đúng biên: đúng bằng mức tối thiểu là hợp lệ, thiếu 30 phút là ngắn', () => {
  assert.deepEqual(gopKhoiLienKe([muc(1, '11:00', '13:00')], 120).cacCumNgan, []);
  assert.deepEqual(gopKhoiLienKe([muc(1, '11:00', '12:30')], 120).cacCumNgan.map((c) => c.soPhut), [90]);
});

test('6e. Chỉ cụm ngắn bị báo, cụm đủ thì không', () => {
  const { cacCum, cacCumNgan } = gopKhoiLienKe([muc(1, '08:00', '10:00'), muc(2, '08:00', '09:00')], 120);
  assert.equal(cacCum.length, 2);
  assert.deepEqual(cacCumNgan.map((c) => [c.maSan, c.soPhut]), [[2, 60]]);
});

// ---- Ca 7: đầu vào sai → 400 ----

const bat400 = (dsMuc) => {
  try {
    gopKhoiLienKe(dsMuc, 60);
  } catch (loi) {
    assert.ok(loi instanceof AppError, 'phải là AppError');
    assert.equal(loi.maTrangThai, 400);
    assert.equal(loi.maLoi, 'BAD_REQUEST');
    return loi.chiTiet;
  }
  assert.fail('phải ném lỗi 400');
  return null;
};

test('7. Giờ bắt đầu bằng hoặc sau giờ kết thúc → 400, chỉ đúng mục và trường lỗi', () => {
  assert.deepEqual(bat400([muc(1, '12:00', '13:00'), muc(1, '14:00', '14:00')]),
    [{ truong: 'cacMuc[1].gioKetThuc', thongBao: 'Giờ kết thúc phải sau giờ bắt đầu.' }]);
  assert.deepEqual(bat400([muc(1, '15:00', '14:00')]).map((l) => l.truong), ['cacMuc[0].gioKetThuc']);
});

test('7b. Giờ lệch mốc 30 phút → 400', () => {
  assert.deepEqual(bat400([muc(1, '12:15', '13:00')]).map((l) => l.truong), ['cacMuc[0].gioBatDau']);
  assert.deepEqual(bat400([muc(1, '12:00', '13:45')]).map((l) => l.truong), ['cacMuc[0].gioKetThuc']);
});

test('7c. Sai định dạng giờ (12h, 1:00, 24:00, rỗng, không phải chuỗi) → 400', () => {
  for (const gio of ['12h', '1:00', '24:00', '', '12:00:30', null, 1200]) {
    assert.deepEqual(bat400([muc(1, gio, '23:30')]).map((l) => l.truong), ['cacMuc[0].gioBatDau'], `giờ ${String(gio)}`);
  }
});

test('7d. Mã sân hoặc ngày sai → 400', () => {
  for (const maSan of [0, -1, 1.5, '3', null, undefined]) {
    assert.deepEqual(bat400([muc(maSan, '12:00', '13:00')]).map((l) => l.truong), ['cacMuc[0].maSan'], `maSan ${String(maSan)}`);
  }
  for (const ngay of ['2026-13-01', '2026-02-30', '28/11/2026', '', null]) {
    assert.deepEqual(bat400([muc(1, '12:00', '13:00', ngay)]).map((l) => l.truong), ['cacMuc[0].ngay'], `ngày ${String(ngay)}`);
  }
});

test('7e. Gom đủ mọi lỗi của mọi mục, và mục không phải object → 400', () => {
  const chiTiet = bat400([muc(1, '12:15', '13:00'), null, muc(0, '14:00', '13:00')]);
  assert.deepEqual(chiTiet.map((l) => l.truong),
    ['cacMuc[0].gioBatDau', 'cacMuc[1]', 'cacMuc[2].maSan', 'cacMuc[2].gioKetThuc']);
});

test('7f. Chấp nhận giờ dạng HH:MM:00 (cột TIME của DB) và trả HH:MM', () => {
  const { cacCum } = gopKhoiLienKe([muc(1, '12:00:00', '13:00:00'), muc(1, '13:00:00', '14:30:00')], 60);
  assert.deepEqual(cacCum, [cum(1, '12:00', '14:30', 150)]);
});

// ---- Ca 8: rỗng và dùng sai hàm ----

test('8. Mảng rỗng → không có cụm nào', () => {
  assert.deepEqual(gopKhoiLienKe([], 60), { cacCum: [], cacCumNgan: [] });
});

test('8b. Dùng sai hàm (không phải mảng, mức tối thiểu không phải số dương) ném TypeError, không phải 400', () => {
  assert.throws(() => gopKhoiLienKe(null, 60), TypeError);
  assert.throws(() => gopKhoiLienKe({}, 60), TypeError);
  for (const toiThieu of [undefined, null, '60', 0, -30, NaN, Infinity]) {
    assert.throws(() => gopKhoiLienKe([muc(1, '12:00', '13:00')], toiThieu), TypeError, `toiThieu ${String(toiThieu)}`);
  }
});
