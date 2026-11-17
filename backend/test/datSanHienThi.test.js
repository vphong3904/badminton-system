const test = require('node:test');
const assert = require('node:assert/strict');

// lietKeDatSan: trạng thái hiển thị (C3), đánh giá theo lịch cố định (B1) và cờ sửa đánh giá (B2).
const cacTruyVan = [];
let cacDong = [];
const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/^\s*UPDATE/.test(cauTruyVan)) return [{ affectedRows: 0 }];
    if (/FROM DatSan d\s+JOIN San s/.test(cauTruyVan)) return [cacDong];
    throw new Error(`Chưa giả lập truy vấn: ${cauTruyVan}`);
  },
};
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (hamThucThi) => hamThucThi(ketNoiGia) },
};
const dichVu = require('../src/services/customerService');

const dong = (them = {}) => ({
  maDatSan: 1, maDon: 'BK1', maLichCoDinh: null, ngay: '2026-11-10', gioBatDau: '18:00:00', gioKetThuc: '19:00:00',
  tongTien: 100000, trangThai: 'completed', nguon: 'app', trangThaiThanhToan: 'success', trangThaiHoanTien: 'none',
  soTienHoan: 0, lyDoLoi: null, maDanhGia: null, soSaoDanhGia: null, noiDungDanhGia: null, maDatSanDanhGia: null,
  danhGiaBiAn: null, trongHanSuaDanhGia: null, maKhieuNai: null, ...them,
});

test('lietKeDatSan: thêm trangThaiHienThi/nhanTrangThai/nhomTrangThai cho từng đơn', async () => {
  cacTruyVan.length = 0;
  cacDong = [
    dong({ maDatSan: 1, trangThai: 'completed' }),
    dong({ maDatSan: 2, trangThai: 'cancelled', trangThaiHoanTien: 'processing', soTienHoan: 50000 }),
    dong({ maDatSan: 3, trangThai: 'expired', trangThaiThanhToan: 'expired' }),
  ];
  const ketQua = await dichVu.lietKeDatSan(7);
  assert.deepEqual(
    ketQua.map((don) => [don.trangThaiHienThi, don.nhanTrangThai, don.nhomTrangThai]),
    [['completed', 'Hoàn thành', 'hoan_thanh'],
      ['cancelled_refund_pending', 'Đã hủy, chờ hoàn tiền', 'da_huy'],
      ['expired', 'Hết hạn giữ chỗ', 'da_huy']]);
});

test('lietKeDatSan: ảnh bị từ chối → payment_rejected kèm lyDoTuChoi; không lộ lyDoLoi thô', async () => {
  cacDong = [
    dong({ trangThai: 'pending_payment', trangThaiThanhToan: 'pending', lyDoLoi: 'Ảnh mờ' }),
    dong({ maDatSan: 2, trangThai: 'pending_payment', trangThaiThanhToan: 'pending', lyDoLoi: null }),
    dong({ maDatSan: 3, trangThai: 'pending_payment', trangThaiThanhToan: 'confirming', lyDoLoi: 'Ảnh mờ' }),
  ];
  const [biTuChoi, chuaGui, choDuyet] = await dichVu.lietKeDatSan(7);
  assert.equal(biTuChoi.trangThaiHienThi, 'payment_rejected');
  assert.equal(biTuChoi.lyDoTuChoi, 'Ảnh mờ');
  assert.equal('lyDoLoi' in biTuChoi, false);
  assert.equal(chuaGui.trangThaiHienThi, 'awaiting_payment');
  assert.equal(chuaGui.lyDoTuChoi, null);
  assert.equal(choDuyet.trangThaiHienThi, 'awaiting_owner_approval');
  assert.equal(choDuyet.lyDoTuChoi, null);
});

test('lietKeDatSan: đơn completed chưa đánh giá → coTheDanhGia; confirmed chưa chơi xong thì không', async () => {
  cacDong = [dong(), dong({ maDatSan: 2, trangThai: 'confirmed' }), dong({ maDatSan: 3, trangThaiThanhToan: 'late_payment' })];
  const [daChoi, chuaChoi, chuaTra] = await dichVu.lietKeDatSan(7);
  assert.deepEqual([daChoi.coTheDanhGia, daChoi.daDanhGia, daChoi.coTheSuaDanhGia], [true, false, false]);
  assert.equal(chuaChoi.coTheDanhGia, false);
  assert.equal(chuaTra.coTheDanhGia, false);
  assert.equal(daChoi.maDatSanDanhGia, null);
});

test('B1: buổi khác của lịch cố định đã được đánh giá → coTheDanhGia=false, daDanhGia=true theo lịch', async () => {
  cacDong = [
    // Buổi 12 giữ đánh giá; buổi 11 và 13 cùng lịch 4 thấy đánh giá đó (maDatSanDanhGia = 12).
    dong({ maDatSan: 13, maLichCoDinh: 4, maDanhGia: 90, soSaoDanhGia: 4, maDatSanDanhGia: 12, danhGiaBiAn: 0, trongHanSuaDanhGia: 1 }),
    dong({ maDatSan: 12, maLichCoDinh: 4, maDanhGia: 90, soSaoDanhGia: 4, maDatSanDanhGia: 12, danhGiaBiAn: 0, trongHanSuaDanhGia: 1 }),
    dong({ maDatSan: 11, maLichCoDinh: 4, maDanhGia: 90, soSaoDanhGia: 4, maDatSanDanhGia: 12, danhGiaBiAn: 0, trongHanSuaDanhGia: 1 }),
    dong({ maDatSan: 20, maLichCoDinh: 5 }), // lịch khác chưa đánh giá
  ];
  const ketQua = await dichVu.lietKeDatSan(7);
  for (const don of ketQua.slice(0, 3)) {
    assert.equal(don.coTheDanhGia, false);
    assert.equal(don.daDanhGia, true);
    assert.equal(don.soSaoDanhGia, 4);
    assert.equal(don.maDatSanDanhGia, 12);
  }
  assert.equal(ketQua[3].coTheDanhGia, true);
  assert.equal(ketQua[3].daDanhGia, false);
});

test('B2: trả noiDungDanhGia để app mở lại form sửa với giá trị cũ', async () => {
  cacDong = [dong({ maDanhGia: 90, soSaoDanhGia: 4, noiDungDanhGia: 'Sân đẹp', maDatSanDanhGia: 1, danhGiaBiAn: 0, trongHanSuaDanhGia: 1 })];
  const [don] = await dichVu.lietKeDatSan(7);
  assert.equal(don.noiDungDanhGia, 'Sân đẹp');
});

test('B1: truy vấn gộp đánh giá theo lịch cố định, đơn của chính mình được ưu tiên', async () => {
  cacTruyVan.length = 0;
  cacDong = [];
  await dichVu.lietKeDatSan(7);
  const truyVan = cacTruyVan.find((muc) => /FROM DatSan d\s+JOIN San s/.test(muc.cauTruyVan)).cauTruyVan;
  assert.match(truyVan, /dx\.MaLichCoDinh=d\.MaLichCoDinh/);
  assert.match(truyVan, /ORDER BY \(dx\.MaDatSan=d\.MaDatSan\) DESC/);
});

test('B2: coTheSuaDanhGia chỉ true khi còn trong 7 ngày và chưa bị ẩn', async () => {
  const daDanhGia = { maDanhGia: 90, soSaoDanhGia: 5, maDatSanDanhGia: 1 };
  cacDong = [
    dong({ ...daDanhGia, danhGiaBiAn: 0, trongHanSuaDanhGia: 1 }),
    dong({ ...daDanhGia, maDatSan: 2, danhGiaBiAn: 0, trongHanSuaDanhGia: 0 }),
    dong({ ...daDanhGia, maDatSan: 3, danhGiaBiAn: 1, trongHanSuaDanhGia: 1 }),
  ];
  const ketQua = await dichVu.lietKeDatSan(7);
  assert.deepEqual(ketQua.map((don) => don.coTheSuaDanhGia), [true, false, false]);
  assert.deepEqual(ketQua.map((don) => don.daDanhGia), [true, true, true]);
});
