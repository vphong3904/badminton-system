const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BANK_ACCOUNT_NUMBER = '1234567890';
process.env.BANK_CODE = 'VCB';

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
    if (/FROM CoSo WHERE MaCoSo=\? AND TrangThai='active'/.test(cauTruyVan) && /GioMoCua AS gioMoCua/.test(cauTruyVan)) {
      return [[{
        maCoSo: Number(thamSo[0]), tenCoSo: 'Co so test', diaChi: 'Dia chi test', soDienThoai: '0900000000',
        gioMoCua: '06:00:00', gioDongCua: '22:00:00', soPhutDatToiThieu: 60,
      }]];
    }
    if (/SELECT MaSan AS maSan, TenSan AS tenSan FROM San/.test(cauTruyVan)) {
      return [[{ maSan: 3, tenSan: 'San 1' }, { maSan: 4, tenSan: 'San 2' }]];
    }
    if (/FROM DatSan d JOIN San s ON s\.MaSan=d\.MaSan/.test(cauTruyVan)) {
      return [[{ maSan: 3, gioBatDau: '18:00:00', gioKetThuc: '19:00:00' }]];
    }
    if (/FROM KhoaSan k JOIN San s/.test(cauTruyVan)) {
      return [[{ maSan: 4, gioBatDau: '10:00:00', gioKetThuc: '11:30:00' }]];
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
    if (/COUNT\(\*\) FROM San s WHERE s\.MaCoSo=cs\.MaCoSo/.test(cauTruyVan)) {
      return [[
        { maCoSo: 1, tenCoSo: 'Co so A', soSan: 4, tienIch: '["parking","toilet"]' },
        { maCoSo: 2, tenCoSo: 'Co so B', soSan: 3, tienIch: ['canteen'] },
        { maCoSo: 3, tenCoSo: 'Co so C', soSan: 2, tienIch: null },
      ]];
    }
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
  assert.match(ketQua.anhQrUrl, /^https:\/\/img\.vietqr\.io\/image\/VCB-1234567890-compact2\.png/);
  assert.match(ketQua.anhQrUrl, /addInfo=BK/);
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

test('Lịch ngày trả khung đã đặt, khung bị khóa theo từng sân và bảng giá', async () => {
  const ketQua = await dichVu.layLichNgay(12, ngayMai);
  assert.equal(ketQua.cacSan.length, 2);
  assert.deepEqual(ketQua.cacSan[0].cacKhungBan, [
    { gioBatDau: '18:00', gioKetThuc: '19:00', loai: 'booked' },
  ]);
  assert.deepEqual(ketQua.cacSan[1].cacKhungBan, [
    { gioBatDau: '10:00', gioKetThuc: '11:30', loai: 'locked' },
  ]);
  assert.equal(ketQua.gioMoCua, '06:00');
  assert.equal(ketQua.bangGia[0].giaMoiGio, 100000);
});

test('Lịch ngày từ chối ngày không hợp lệ', async () => {
  await assert.rejects(dichVu.layLichNgay(12, '2026-13-45'), /Ngày không hợp lệ/);
});

test('Danh sách cơ sở cho trang chủ chuẩn hóa tiện ích về mảng', async () => {
  const ketQua = await dichVu.layDanhSachCoSo();
  assert.equal(ketQua.length, 3);
  assert.deepEqual(ketQua[0].tienIch, ['parking', 'toilet']);
  assert.deepEqual(ketQua[1].tienIch, ['canteen']);
  assert.deepEqual(ketQua[2].tienIch, []);
});
