const test = require('node:test');
const assert = require('node:assert/strict');

// Giả lập DB: `cacDong` là kết quả truy vấn cơ sở+sân, `bangGia` là bảng giá vãng lai.
let cacDong = [];
let bangGia = [];
const cacTruyVan = [];
const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/FROM BangGia/.test(cauTruyVan)) return [bangGia];
    if (/FROM CoSo cs JOIN San s/.test(cauTruyVan)) return [cacDong];
    throw new Error(`Chưa giả lập truy vấn: ${cauTruyVan}`);
  },
};
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (f) => f(ketNoiGia) },
};
const dichVu = require('../src/services/customerService');

const ngayMai = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const coSo = (maCoSo, diem, viDo, kinhDo, them = {}) => ({
  maCoSo, tenCoSo: `Co so ${maCoSo}`, diaChi: 'x', tinhThanh: 'HCM', quanHuyen: 'Q1',
  giaThapNhat: 50000, gioMoCua: '05:00:00', gioDongCua: '23:00:00', soPhutDatToiThieu: 60,
  viDo, kinhDo, diemTrungBinh: diem, soDanhGia: 3, maSan: maCoSo * 10, tenSan: 'San 1', ...them,
});
const bang = (maCoSo, gia) => ({
  maCoSo, loaiNgay: 'weekday', gioBatDau: '05:00:00', gioKetThuc: '23:00:00', giaMoiGio: gia,
});
const ma = (ketQua) => ketQua.map((dong) => dong.maCoSo);

test.beforeEach(() => {
  cacTruyVan.length = 0;
  cacDong = [coSo(1, '4.9', '10.800', '106.700'), coSo(2, '3.0', '10.770', '106.690'), coSo(3, '4.5', null, null)];
  bangGia = [bang(1, 50000), bang(2, 100000), bang(3, 150000)];
});

test('Không có GPS: xếp theo sao cao → thấp', async () => {
  assert.deepEqual(ma(await dichVu.timCoSo({})), [1, 3, 2]);
});

test('Có GPS: gần → xa, cơ sở thiếu toạ độ xếp cuối, kèm khoangCachMet', async () => {
  const ketQua = await dichVu.timCoSo({ viDo: 10.776, kinhDo: 106.695 });
  assert.deepEqual(ma(ketQua), [2, 1, 3]);
  assert.ok(ketQua[0].khoangCachMet < ketQua[1].khoangCachMet);
  assert.equal(ketQua[2].khoangCachMet, null);
});

test('Lọc khoảng giá khi không chọn khung giờ', async () => {
  const ketQua = await dichVu.timCoSo({ giaToiThieu: 60000, giaToiDa: 120000 });
  assert.deepEqual(ma(ketQua), [2]);
});

test('Kết hợp khung giờ + khoảng giá + GPS', async () => {
  const ketQua = await dichVu.timCoSo({
    ngay: ngayMai, gioBatDau: '08:00', gioKetThuc: '10:00',
    giaToiThieu: 40000, giaToiDa: 110000, viDo: 10.776, kinhDo: 106.695,
  });
  assert.deepEqual(ma(ketQua), [2, 1]);
  assert.equal(ketQua[0].giaMoiGio, 100000);
  // Điều kiện sân trống chỉ được thêm khi có khung giờ.
  assert.match(cacTruyVan[0].cauTruyVan, /NOT EXISTS/);
});

test('Không chọn khung giờ thì không kiểm tra lịch đặt', async () => {
  await dichVu.timCoSo({ tinhThanh: 'HCM', quanHuyen: 'Q1' });
  assert.doesNotMatch(cacTruyVan[0].cauTruyVan, /NOT EXISTS/);
  assert.deepEqual(cacTruyVan[0].thamSo, ['HCM', 'Q1']);
});

test('Khung giờ ngoài giờ mở cửa bị loại', async () => {
  cacDong = [coSo(1, '4.9', null, null, { gioMoCua: '09:00:00' })];
  assert.deepEqual(await dichVu.timCoSo({ ngay: ngayMai, gioBatDau: '08:00', gioKetThuc: '10:00' }), []);
});

test('Thiếu một phần của bộ ngày/giờ hoặc cặp giá thì báo lỗi', async () => {
  await assert.rejects(dichVu.timCoSo({ ngay: ngayMai }), /ngày, giờ bắt đầu và giờ kết thúc/);
  await assert.rejects(dichVu.timCoSo({ giaToiThieu: 1000 }), /giá tối thiểu và giá tối đa/);
  await assert.rejects(dichVu.timCoSo({ giaToiThieu: 2000, giaToiDa: 1000 }), /Giá tối đa/);
  await assert.rejects(dichVu.timCoSo({ quanHuyen: 'Q1' }), /Tỉnh\/Thành phố/);
});
