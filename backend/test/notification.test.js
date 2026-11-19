const test = require('node:test');
const assert = require('node:assert/strict');

const cacTruyVan = [];
let kichBan = {};

function ngayGio(soGioNua) {
  // Giờ VN (UTC+7) của thời điểm "bây giờ + soGioNua".
  const t = new Date(Date.now() + soGioNua * 3_600_000 + 7 * 3_600_000).toISOString();
  return { ngay: t.slice(0, 10), gio: `${t.slice(11, 16)}:00` };
}

const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/FROM DatSan d LEFT JOIN ThanhToan t/.test(cauTruyVan)) {
      return [[{
        maDatSan: 5, maLichCoDinh: null, ngay: kichBan.ngay, gioBatDau: kichBan.gio, tongTien: 200000,
        trangThai: 'confirmed', maThanhToan: 9, trangThaiThanhToan: kichBan.trangThaiThanhToan || 'success',
      }]];
    }
    if (/FROM CauHinhHeThong/.test(cauTruyVan)) {
      const giaTri = {
        cancel_free_hours: 24, cancel_half_hours: 12, late_cancel_refund_percent: 50,
      }[thamSo[0]];
      return [[{ giaTri: String(giaTri) }]];
    }
    if (/SELECT d\.MaDon AS maDon, d\.TenKhach/.test(cauTruyVan)) {
      return [[{ maDon: 'BK261115AAAAAA', tenKhach: 'An', tenSan: 'San 1', tenCoSo: 'Co so A', maChuSan: 4 }]];
    }
    if (/^\s*UPDATE/.test(cauTruyVan)) return [{ affectedRows: 1 }];
    if (/INSERT IGNORE INTO ThongBao/.test(cauTruyVan)) return [{ affectedRows: 1 }];
    return [[]];
  },
};

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (ham) => ham(ketNoiGia) },
};

const { tinhTiLeHoan, tinhSoTienHoan } = require('../src/utils/chinhSachHoanTien');
const { xacDinhMucXuLy } = require('../src/services/complaintService');
const dichVu = require('../src/services/customerService');

const thongBaoDaGhi = () => cacTruyVan
  .filter((muc) => /INSERT IGNORE INTO ThongBao/.test(muc.cauTruyVan))
  .map((muc) => ({ nguoiDung: muc.thamSo[0], loai: muc.thamSo[1] }));

test('Chính sách hoàn tiền: ≥24h 100%, 12–24h 50%, <12h không hoàn', () => {
  assert.equal(tinhTiLeHoan(48), 100);
  assert.equal(tinhTiLeHoan(24), 100);
  assert.equal(tinhTiLeHoan(23.99), 50);
  assert.equal(tinhTiLeHoan(12), 50);
  assert.equal(tinhTiLeHoan(11.99), 0);
  assert.equal(tinhTiLeHoan(0.5), 0);
  assert.equal(tinhSoTienHoan(200000, 30), 200000);
  assert.equal(tinhSoTienHoan(200000, 18), 100000);
  assert.equal(tinhSoTienHoan(200000, 6), 0);
});

test('Khiếu nại hợp lệ: lần 1 cảnh cáo, lần 2 cảnh cáo nghiêm trọng, lần 3 khoá', () => {
  assert.equal(xacDinhMucXuLy(1), 'warning');
  assert.equal(xacDinhMucXuLy(2), 'severe_warning');
  assert.equal(xacDinhMucXuLy(3), 'banned');
  assert.equal(xacDinhMucXuLy(4), 'banned');
});

test('Huỷ trước giờ chơi 30h: hoàn 100%, báo khách và chủ sân yêu cầu hoàn tiền', async () => {
  cacTruyVan.length = 0;
  kichBan = ngayGio(30);
  const ketQua = await dichVu.huyDatSan(7, 5);
  assert.equal(ketQua.soTienHoanDuKien, 200000);
  assert.equal(ketQua.tiLeHoan, 100);
  assert.equal(ketQua.coTheKhieuNai, false); // chỉ khiếu nại được sau khi chủ sân hoàn tiền (refunded)
  assert.deepEqual(thongBaoDaGhi(), [
    { nguoiDung: 7, loai: 'refund_requested' },
    { nguoiDung: 4, loai: 'refund_requested' },
  ]);
});

test('Huỷ trước giờ chơi 18h: hoàn 50%', async () => {
  cacTruyVan.length = 0;
  kichBan = ngayGio(18);
  const ketQua = await dichVu.huyDatSan(7, 5);
  assert.equal(ketQua.soTienHoanDuKien, 100000);
  assert.equal(ketQua.tiLeHoan, 50);
});

test('Huỷ trước giờ chơi 6h: không hoàn, không tạo yêu cầu hoàn tiền', async () => {
  cacTruyVan.length = 0;
  kichBan = ngayGio(6);
  const ketQua = await dichVu.huyDatSan(7, 5);
  assert.equal(ketQua.soTienHoanDuKien, 0);
  assert.equal(ketQua.canCapNhatTaiKhoanHoan, false);
  assert.match(ketQua.thongBao, /không được hoàn tiền/);
  assert.ok(!cacTruyVan.some((muc) => /TrangThaiHoanTien='processing'/.test(muc.cauTruyVan)));
  assert.deepEqual(thongBaoDaGhi().map((muc) => muc.loai), ['booking_cancelled', 'booking_cancelled']);
});

test('Huỷ đơn chưa thanh toán: chỉ báo khách đã huỷ', async () => {
  cacTruyVan.length = 0;
  kichBan = { ...ngayGio(30), trangThaiThanhToan: 'pending' };
  const ketQua = await dichVu.huyDatSan(7, 5);
  assert.equal(ketQua.soTienHoanDuKien, 0);
  assert.equal(ketQua.daThanhToan, false);
  assert.deepEqual(thongBaoDaGhi(), [{ nguoiDung: 7, loai: 'booking_cancelled' }]);
});

test('Khách huỷ khi đã gửi ảnh chuyển khoản chưa duyệt (confirming) → 409 PAYMENT_CONFIRMING, không ghi gì', async () => {
  cacTruyVan.length = 0;
  kichBan = { ...ngayGio(30), trangThaiThanhToan: 'confirming' };
  await assert.rejects(() => dichVu.huyDatSan(7, 5),
    (loi) => loi.maTrangThai === 409 && loi.maLoi === 'PAYMENT_CONFIRMING');
  assert.ok(!cacTruyVan.some((muc) => /^\s*UPDATE DatSan SET TrangThai='cancelled'/.test(muc.cauTruyVan)));
});
