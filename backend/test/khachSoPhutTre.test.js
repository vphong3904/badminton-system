// Task 1.2: API khách trả soPhutTreToiDa + soPhutDatToiThieu (chi tiết cơ sở, chi tiết sân, lịch ngày).
const test = require('node:test');
const assert = require('node:assert/strict');

const cacTruyVan = [];
const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    // layChiTietSan
    if (/FROM San s JOIN CoSo cs ON cs\.MaCoSo=s\.MaCoSo/.test(cauTruyVan) && /cs\.SoPhutTreToiDa AS soPhutTreToiDa/.test(cauTruyVan)) {
      return [[{ maSan: 3, tenSan: 'San 1', maCoSo: 12, soPhutDatToiThieu: 60, soPhutTreToiDa: 20 }]];
    }
    // layLichNgay / layChiTietCoSo (cùng bảng CoSo, phân biệt bằng cột chọn)
    if (/FROM CoSo WHERE MaCoSo=\? AND TrangThai='active'/.test(cauTruyVan) && /SoPhutTreToiDa AS soPhutTreToiDa/.test(cauTruyVan)) {
      return [[{ maCoSo: Number(thamSo[0]), tenCoSo: 'Co so test', diaChi: 'x', soDienThoai: '09', gioMoCua: '06:00:00',
        gioDongCua: '22:00:00', soPhutDatToiThieu: 90, soPhutTreToiDa: 30 }]];
    }
    if (/FROM San\s+WHERE MaCoSo=\?/.test(cauTruyVan)) return [[{ maSan: 3, tenSan: 'San 1' }]];
    if (/FROM AnhCoSo/.test(cauTruyVan)) return [[]];
    if (/FROM BangGia/.test(cauTruyVan)) return [[]];
    if (/FROM DatSan d JOIN San s/.test(cauTruyVan)) return [[]];
    if (/FROM KhoaSan k JOIN San s/.test(cauTruyVan)) return [[]];
    throw new Error(`Chưa giả lập truy vấn: ${cauTruyVan}`);
  },
};

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: ketNoiGia, thucHienGiaoDich: async (f) => f(ketNoiGia) } };
delete require.cache[require.resolve('../src/services/customerService')];
const dichVu = require('../src/services/customerService');

test('Chi tiết cơ sở trả soPhutTreToiDa và soPhutDatToiThieu', async () => {
  const ketQua = await dichVu.layChiTietCoSo(12);
  assert.equal(ketQua.soPhutTreToiDa, 30);
  assert.equal(ketQua.soPhutDatToiThieu, 90);
});

test('Chi tiết sân trả soPhutTreToiDa và soPhutDatToiThieu của cơ sở', async () => {
  const ketQua = await dichVu.layChiTietSan(3);
  assert.equal(ketQua.soPhutTreToiDa, 20);
  assert.equal(ketQua.soPhutDatToiThieu, 60);
});

test('Lịch ngày trả soPhutTreToiDa và soPhutDatToiThieu', async () => {
  const ngay = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const ketQua = await dichVu.layLichNgay(12, ngay);
  assert.equal(ketQua.soPhutTreToiDa, 30);
  assert.equal(ketQua.soPhutDatToiThieu, 90);
});

test('Cả 3 truy vấn đều chọn cột SoPhutTreToiDa từ DB', () => {
  const dung = cacTruyVan.filter((t) => /SoPhutTreToiDa AS soPhutTreToiDa/.test(t.cauTruyVan));
  assert.equal(dung.length, 3);
});
