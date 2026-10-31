const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SEPAY_BANK_ACCOUNT = '1234567890';
process.env.SEPAY_BANK_CODE = 'VCB';

const cacTruyVan = [];
let coDonTrung = false;
let maDatSanTiepTheo = 100;
let maLichTiepTheo = 50;

const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/SELECT s\.MaSan AS maSan/.test(cauTruyVan)) {
      return [[{
        maSan: Number(thamSo[0]),
        maCoSo: 12,
        tenSan: 'San 1',
        trangThaiSan: 'active',
        tenCoSo: 'Co so test',
        diaChi: 'Dia chi test',
        tinhThanh: 'Ha Noi',
        quanHuyen: 'Cau Giay',
        gioMoCua: '06:00:00',
        gioDongCua: '22:00:00',
        soPhutDatToiThieu: 60,
        maChuSan: 4,
      }]];
    }
    if (/SELECT HoTen AS hoTen/.test(cauTruyVan)) {
      return [[{ hoTen: 'Khach Test', soDienThoai: '0901234567' }]];
    }
    if (/SELECT MaDatSan FROM DatSan/.test(cauTruyVan)) {
      return [coDonTrung ? [{ maDatSan: 99 }] : []];
    }
    if (/SELECT MaKhoa FROM KhoaSan/.test(cauTruyVan)) return [[]];
    if (/FROM BangGia/.test(cauTruyVan)) {
      return [[{ gioBatDau: '06:00:00', gioKetThuc: '22:00:00', giaMoiGio: 100000 }]];
    }
    if (/FROM CauHinhHeThong/.test(cauTruyVan)) {
      return [[{ giaTri: thamSo[0] === 'commission_rate' ? '10' : '10' }]];
    }
    if (/INSERT INTO LichCoDinh/.test(cauTruyVan)) {
      return [{ insertId: maLichTiepTheo++ }];
    }
    if (/INSERT INTO DatSan/.test(cauTruyVan)) {
      return [{ insertId: maDatSanTiepTheo++ }];
    }
    if (/INSERT INTO ThanhToan/.test(cauTruyVan)) {
      return [{ insertId: 900 }];
    }
    if (/UPDATE DatSan/.test(cauTruyVan)) return [{ affectedRows: 0 }];
    throw new Error(`Chưa giả lập truy vấn: ${cauTruyVan}`);
  },
};

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: ketNoiGia,
    thucHienGiaoDich: async (hamThucThi) => hamThucThi(ketNoiGia),
  },
};

const dichVu = require('../src/services/customerService');
const ngayMai = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

test('Tạo đơn lẻ tính giá, phí và mã QR theo schema db_sancaulong', async () => {
  cacTruyVan.length = 0;
  const ketQua = await dichVu.taoDatSan(7, {
    maSan: 3,
    ngay: ngayMai,
    gioBatDau: '12:00',
    gioKetThuc: '13:00',
  });
  assert.equal(ketQua.tongTien, 100000);
  assert.equal(ketQua.cacDon.length, 1);
  assert.equal(ketQua.cacDon[0].tongTien, 100000);
  assert.match(ketQua.anhQrUrl, /acc=1234567890/);
  assert.match(ketQua.anhQrUrl, /des=BK/);
  const truyVanDatSan = cacTruyVan.find((muc) => /INSERT INTO DatSan/.test(muc.cauTruyVan));
  assert.deepEqual(truyVanDatSan.thamSo.slice(5, 16), [
    'walk_in', null, 3, ngayMai, '12:00', '13:00', 60, 100000, 10000, 90000, 10,
  ]);
});

test('Từ chối tạo đơn khi sân đã có đơn chồng giờ', async () => {
  coDonTrung = true;
  await assert.rejects(
    dichVu.taoDatSan(7, {
      maSan: 3,
      ngay: ngayMai,
      gioBatDau: '12:00',
      gioKetThuc: '13:00',
    }),
    /Sân đã có lịch hoặc bị khóa/,
  );
  coDonTrung = false;
});

test('Tạo đơn cố định hằng ngày theo khoảng ngày và một hóa đơn tổng', async () => {
  const ngayKetThuc = new Date(Date.parse(`${ngayMai}T00:00:00Z`) + 86_400_000)
    .toISOString().slice(0, 10);
  const ketQua = await dichVu.taoDatSan(7, {
    maSan: 3,
    ngay: ngayMai,
    gioBatDau: '12:00',
    gioKetThuc: '13:00',
  }, ngayKetThuc);
  assert.equal(ketQua.soNgay, 2);
  assert.equal(ketQua.cacDon.length, 2);
  assert.equal(ketQua.tongTien, 200000);
  assert.ok(ketQua.maLichCoDinh);
});
