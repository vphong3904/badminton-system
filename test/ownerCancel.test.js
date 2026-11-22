const test = require('node:test');
const assert = require('node:assert/strict');

// Chủ sân huỷ đơn: khách luôn được hoàn 100% (không áp chính sách 24h/12h của khách).
const cacLenhGhi = [];
let donTimThay;
let cacBuoiCungLich = [];
const ketNoiGia = {
  async query(sql, thamSo = []) {
    if (/FROM DatSan d JOIN San s/.test(sql) && /FOR UPDATE/.test(sql)) return [[donTimThay]];
    if (/FROM DatSan WHERE MaLichCoDinh/.test(sql)) return [cacBuoiCungLich];
    cacLenhGhi.push({ sql, thamSo });
    return [{ insertId: 1, affectedRows: 1 }];
  },
};
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (ham) => ham(ketNoiGia) },
};
const dichVu = require('../src/services/ownerBookingService');
const { huyDon } = require('../src/validators/ownerReport');

const TUONG_LAI = '2099-01-07';
const QUA_KHU = '2020-01-07';
const donMau = (rieng = {}) => ({
  maDatSan: 10, maDon: 'BK001', maKhachHang: 7, tenKhach: 'Khách A', nguon: 'app', maLichCoDinh: null,
  ngay: TUONG_LAI, gioBatDau: '18:00:00', tongTien: 150000, trangThai: 'confirmed', trangThaiThu: null,
  tenSan: 'Sân 1', tenCoSo: 'CS Một', maThanhToan: 55, trangThaiThanhToan: 'success', ...rieng,
});
const lenh = (mau) => cacLenhGhi.filter((q) => mau.test(q.sql));
const datLai = (don, cacBuoi = []) => { cacLenhGhi.length = 0; donTimThay = don; cacBuoiCungLich = cacBuoi; };

test('Chủ sân huỷ đơn đã trả tiền: hoàn 100%, vào hàng đợi processing, NguoiHuy=owner', async () => {
  datLai(donMau());
  const ketQua = await dichVu.huyDon(3, 10, 'Đóng sân bảo trì');
  assert.equal(ketQua.daHuy, true);
  assert.equal(ketQua.tiLeHoan, 100);
  assert.equal(ketQua.soTienHoan, 150000);
  assert.equal(ketQua.canHoanTien, true);
  assert.equal(ketQua.nguoiHuy, 'owner');
  const [capNhatDon] = lenh(/UPDATE DatSan SET TrangThai='cancelled'/);
  assert.match(capNhatDon.sql, /NguoiHuy='owner'/);
  assert.deepEqual(capNhatDon.thamSo, ['Đóng sân bảo trì', 10]);
  const [hoan] = lenh(/UPDATE ThanhToan SET SoTienHoan/);
  assert.deepEqual(hoan.thamSo, [150000, 55]);
  assert.match(hoan.sql, /'processing'/);
});

test('Hoàn 100% kể cả khi sát giờ chơi (khác chính sách khi khách huỷ)', async () => {
  const sapToi = new Date(Date.now() + 2 * 3_600_000 + 7 * 3_600_000); // còn ~2 giờ (giờ VN)
  const ngay = sapToi.toISOString().slice(0, 10);
  const gio = sapToi.toISOString().slice(11, 19);
  datLai(donMau({ ngay, gioBatDau: gio }));
  const ketQua = await dichVu.huyDon(3, 10, 'Hỏng điện');
  assert.equal(ketQua.tiLeHoan, 100);
  assert.equal(ketQua.soTienHoan, 150000);
});

test('Khách được báo: thông báo booking_cancelled có lý do và số tiền hoàn', async () => {
  datLai(donMau());
  await dichVu.huyDon(3, 10, 'Đóng sân bảo trì');
  const [thongBao] = lenh(/INSERT IGNORE INTO ThongBao/);
  assert.equal(thongBao.thamSo[0], 7);
  assert.equal(thongBao.thamSo[1], 'booking_cancelled');
  assert.match(thongBao.thamSo[3], /Đóng sân bảo trì/);
  assert.match(thongBao.thamSo[3], /hoàn 100%/);
});

test('Đơn không thuộc chủ sân này → 404, không ghi gì', async () => {
  datLai(undefined);
  await assert.rejects(() => dichVu.huyDon(99, 10, 'x y'), (loi) => loi.maTrangThai === 404);
  assert.equal(cacLenhGhi.length, 0);
});

test('Khách đã gửi ảnh chuyển khoản chưa duyệt (confirming) → 409 PAYMENT_CONFIRMING, không ghi', async () => {
  datLai(donMau({ trangThai: 'pending_payment', trangThaiThanhToan: 'confirming' }));
  await assert.rejects(() => dichVu.huyDon(3, 10, 'Bảo trì'),
    (loi) => loi.maTrangThai === 409 && loi.maLoi === 'PAYMENT_CONFIRMING');
  assert.equal(cacLenhGhi.length, 0);
});

test('Đơn chưa thanh toán: huỷ được, thanh toán pending → expired, không có tiền hoàn', async () => {
  datLai(donMau({ trangThai: 'pending_payment', trangThaiThanhToan: 'pending' }));
  const ketQua = await dichVu.huyDon(3, 10, 'Bảo trì');
  assert.equal(ketQua.soTienHoan, 0);
  assert.equal(ketQua.canHoanTien, false);
  assert.equal(lenh(/UPDATE ThanhToan SET SoTienHoan/).length, 0);
  assert.equal(lenh(/UPDATE ThanhToan SET TrangThai='expired'/).length, 1);
});

test('Đơn đã qua giờ chơi → 409, không ghi', async () => {
  datLai(donMau({ ngay: QUA_KHU }));
  await assert.rejects(() => dichVu.huyDon(3, 10, 'Bảo trì'), (loi) => loi.maTrangThai === 409);
  assert.equal(cacLenhGhi.length, 0);
});

test('Đơn đã huỷ / hoàn thành / hết hạn → 409', async () => {
  for (const trangThai of ['cancelled', 'completed', 'expired']) {
    datLai(donMau({ trangThai }));
    await assert.rejects(() => dichVu.huyDon(3, 10, 'Bảo trì'), (loi) => loi.maTrangThai === 409);
    assert.equal(cacLenhGhi.length, 0);
  }
});

test('Lịch cố định: huỷ mọi buổi còn lại, bỏ qua buổi đã qua, hoàn tổng tiền các buổi huỷ', async () => {
  datLai(donMau({ maLichCoDinh: 4 }), [
    { maDatSan: 8, ngay: QUA_KHU, gioBatDau: '18:00:00', tongTien: 150000 },
    { maDatSan: 10, ngay: TUONG_LAI, gioBatDau: '18:00:00', tongTien: 150000 },
    { maDatSan: 11, ngay: '2099-01-14', gioBatDau: '18:00:00', tongTien: 150000 },
  ]);
  const ketQua = await dichVu.huyDon(3, 10, 'Bảo trì dài ngày');
  assert.equal(ketQua.soBuoiHuy, 2);
  assert.equal(ketQua.soTienHoan, 300000);
  const [capNhatDon] = lenh(/UPDATE DatSan SET TrangThai='cancelled'/);
  assert.deepEqual(capNhatDon.thamSo, ['Bảo trì dài ngày', 10, 11]);
  assert.equal(lenh(/UPDATE LichCoDinh SET TrangThai='cancelled'/).length, 1);
});

test('Đơn chủ sân tự tạo đã thu tiền: không có ThanhToan, trả cờ để chủ sân tự hoàn ngoài hệ thống', async () => {
  datLai(donMau({ nguon: 'owner', maKhachHang: null, maThanhToan: null, trangThaiThanhToan: null, trangThaiThu: 'paid' }));
  const ketQua = await dichVu.huyDon(3, 10, 'Bảo trì');
  assert.equal(ketQua.soTienHoan, 0);
  assert.equal(ketQua.daThuNgoaiHeThong, true);
  assert.equal(ketQua.soTienCanHoanNgoaiHeThong, 150000);
  assert.equal(lenh(/ThanhToan/).length, 0);
  assert.equal(lenh(/INSERT IGNORE INTO ThongBao/).length, 0); // khách vãng lai không có tài khoản
});

test('Validator huỷ đơn: bắt buộc lý do 2–255 ký tự', () => {
  const params = { maDatSan: '10' };
  assert.equal(huyDon.body.safeParse({ lyDo: 'Bảo trì sàn' }).success, true);
  assert.equal(huyDon.body.safeParse({}).success, false);
  assert.equal(huyDon.body.safeParse({ lyDo: ' a ' }).success, false);
  assert.equal(huyDon.body.safeParse({ lyDo: 'x'.repeat(256) }).success, false);
  assert.equal(huyDon.params.safeParse(params).success, true);
});
