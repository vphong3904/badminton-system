const test = require('node:test');
const assert = require('node:assert/strict');
const kiemTraChuSan = require('../src/validators/owner');

const duLieuCoSo = {
  tenCoSo: 'San Cau Long',
  diaChi: '123 Duong ABC',
  tinhThanh: 'Ha Noi',
  quanHuyen: 'Cau Giay',
  soDienThoai: '0901234567',
  linkBanDo: 'https://maps.app.goo.gl/AbCdEf123',
  gioMoCua: '06:00',
  gioDongCua: '22:00',
  soPhutDatToiThieu: 60,
};

const khungGia = {
  gioBatDau: '06:00',
  gioKetThuc: '08:00',
  giaNgayThuongKhachVangLai: 50000,
  giaNgayThuongKhachCoDinh: 40000,
  giaCuoiTuanKhachVangLai: 60000,
  giaCuoiTuanKhachCoDinh: 45000,
};

test('Chap nhan ten truong tieng Viet khong dau cho co so va bang gia', () => {
  assert.equal(kiemTraChuSan.coSo.body.safeParse(duLieuCoSo).success, true);
  assert.equal(kiemTraChuSan.bangGia.body.safeParse({ khungGias: [khungGia] }).success, true);
});

test('Tu choi ten truong tieng Anh cu', () => {
  assert.equal(kiemTraChuSan.coSo.body.safeParse({
    name: 'San Cau Long',
    address: '123 Duong ABC',
    province: 'Ha Noi',
    district: 'Cau Giay',
    phone: '0901234567',
    map_url: 'https://maps.example.test/san',
    open_time: '06:00',
    close_time: '22:00',
    min_booking_minutes: 60,
  }).success, false);
});

test('Chap nhan ten truong tieng Viet khong dau cho san va khung khoa', () => {
  assert.equal(kiemTraChuSan.san.body.safeParse({ tenSan: 'San 1' }).success, true);
  assert.equal(kiemTraChuSan.khoaSan.body.safeParse({
    maSan: 1,
    thoiGianBatDau: '2026-10-31 06:00',
    thoiGianKetThuc: '2026-10-31 08:00',
    lyDo: 'Bao tri',
  }).success, true);
});

test('Buoc ngan hang bat buoc co maNganHang de rut tien duoc', () => {
  const hopLe = { tenNganHang: 'Vietcombank', maNganHang: 'VCB', soTaiKhoan: '0123456789', chuTaiKhoan: 'NGUYEN VAN A' };
  assert.equal(kiemTraChuSan.nganHang.body.safeParse(hopLe).success, true);
  const { maNganHang, ...thieuMa } = hopLe;
  assert.equal(kiemTraChuSan.nganHang.body.safeParse(thieuMa).success, false);
});

test('linkBanDo phai la link Google Maps; khong con nhan zalo / viDo / kinhDo tu chu san', () => {
  const thu = (linkBanDo) => kiemTraChuSan.coSo.body.safeParse({ ...duLieuCoSo, linkBanDo }).success;
  assert.equal(thu('https://maps.app.goo.gl/AbCdEf123'), true);
  assert.equal(thu('https://www.google.com/maps/place/San/@10.8,106.6,17z'), true);
  assert.equal(thu('https://facebook.com/sancaulong'), false);
  assert.equal(thu('https://example.com/maps'), false);
  const ketQua = kiemTraChuSan.coSo.body.safeParse({ ...duLieuCoSo, zalo: '0901', viDo: 10.8, kinhDo: 106.6 });
  if (ketQua.success) {
    assert.equal('zalo' in ketQua.data, false);
    assert.equal('viDo' in ketQua.data, false);
    assert.equal('kinhDo' in ketQua.data, false);
  }
});
