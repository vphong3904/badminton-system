const test = require('node:test');
const assert = require('node:assert/strict');
const kiemTraChuSan = require('../src/validators/owner');

const duLieuCoSo = {
  tenCoSo: 'San Cau Long',
  diaChi: '123 Duong ABC',
  tinhThanh: 'Ha Noi',
  quanHuyen: 'Cau Giay',
  soDienThoai: '0901234567',
  linkBanDo: 'https://maps.example.test/san',
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
