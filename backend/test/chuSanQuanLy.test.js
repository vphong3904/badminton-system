const test = require('node:test');
const assert = require('node:assert/strict');

// Giả DB: ghi lại mọi câu lệnh để kiểm tra SQL mà service chạy.
const cacLenh = [];
let bangGiaHienCo = [];
let sanHienTai = { maSan: 9, maCoSo: 7, tenSan: 'Sân 1', trangThai: 'maintenance', maChuSan: 3, trangThaiCoSo: 'hidden', tenCoSo: 'CS' };
let hoSoGia = { soDienThoai: '0912000111', tenDoanhNghiep: 'Cty', tenNganHang: 'Vietcombank', maNganHang: 'VCB', soTaiKhoan: '0123456789', chuTaiKhoan: 'NGUYEN VAN A' };
// Khung dạng 4 trường cũ → các dòng BangGia (mỗi thứ một dòng, vãng lai + cố định) như DB thật.
const dongTuKhung = (k) => [1, 2, 3, 4, 5, 6, 7].flatMap((thu) => [
  { thu, loaiKhach: 'walk_in', gioBatDau: k.gioBatDau, gioKetThuc: k.gioKetThuc, giaMoiGio: thu >= 6 ? k.giaCuoiTuanKhachVangLai : k.giaNgayThuongKhachVangLai },
  { thu, loaiKhach: 'fixed', gioBatDau: k.gioBatDau, gioKetThuc: k.gioKetThuc, giaMoiGio: thu >= 6 ? k.giaCuoiTuanKhachCoDinh : k.giaNgayThuongKhachCoDinh },
]);
const ketNoiGia = {
  async query(sql, thamSo = []) {
    cacLenh.push({ sql, thamSo });
    if (/FROM CoSo cs\s+WHERE cs\.MaChuSan = \? AND cs\.MaCoSo = \?/.test(sql)) {
      return [[{ maCoSo: 7, maChuSan: 3, tenCoSo: 'CS', gioMoCua: '06:00:00', gioDongCua: '22:00:00' }]];
    }
    if (/FROM BangGia WHERE MaCoSo = \?/.test(sql)) return [bangGiaHienCo.flatMap(dongTuKhung)];
    if (/FROM San s JOIN CoSo cs ON cs\.MaCoSo=s\.MaCoSo\s+WHERE s\.MaSan=\? /.test(sql)) return [[sanHienTai]];
    if (/FROM NguoiDung nd JOIN HoSoChuSan hs/.test(sql)) return [[hoSoGia]];
    if (/^INSERT INTO San /.test(sql.trim())) return [{ insertId: 50 }];
    if (/FROM San WHERE MaSan=\?$/.test(sql.trim()) || /FROM San WHERE MaSan=\?/.test(sql)) {
      return [[{ maSan: 50, maCoSo: 7, tenSan: 'Sân mới', trangThai: 'maintenance' }]];
    }
    return [{ insertId: 1, affectedRows: 1 }];
  },
};
const duongDanDb = require.resolve('../src/config/db');
require.cache[duongDanDb] = {
  id: duongDanDb, filename: duongDanDb, loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (ham) => ham(ketNoiGia) },
};
const dichVu = require('../src/services/ownerService');
const sanCoSo = require('../src/services/sanCoSoService');
const { layMucConThieuHoSo } = require('../src/utils/hoSoChuSan');
const kiemTraChuSan = require('../src/validators/owner');

const khungMoi = {
  gioBatDau: '17:00', gioKetThuc: '22:00',
  giaNgayThuongKhachVangLai: 120000, giaNgayThuongKhachCoDinh: 100000,
  giaCuoiTuanKhachVangLai: 140000, giaCuoiTuanKhachCoDinh: 120000,
};
const khungCu = { gioBatDau: '06:00:00', gioKetThuc: '17:00:00' };

test('Sân mới LUÔN tạo ở trạng thái chưa hoạt động, dù client gửi trangThai=active', async () => {
  cacLenh.length = 0;
  const duLieu = kiemTraChuSan.san.body.parse({ maCoSo: 7, tenSan: 'Sân mới', trangThai: 'active' });
  assert.equal('trangThai' in duLieu, false);
  const san = await dichVu.taoSan(3, duLieu);
  const them = cacLenh.find((l) => /INSERT INTO San /.test(l.sql));
  assert.match(them.sql, /'maintenance'/);
  assert.equal(san.trangThai, 'maintenance');
  // Tạo sân không được tự kích hoạt cơ sở (sân chưa bật nên chưa nhận khách).
  assert.equal(cacLenh.some((l) => /UPDATE CoSo cs SET cs\.TrangThai='active'/.test(l.sql)), false);
});

test('Bật sân: sân thành active và cơ sở tự hiện cho khách khi đủ điều kiện', async () => {
  cacLenh.length = 0;
  sanHienTai = { ...sanHienTai, trangThai: 'maintenance' };
  const ketQua = await sanCoSo.moSan({ maNguoiDung: 3, vaiTro: 'owner' }, 9);
  assert.equal(ketQua.trangThai, 'active');
  const ghiSan = cacLenh.findIndex((l) => /UPDATE San SET TrangThai='active'/.test(l.sql));
  const kichHoat = cacLenh.findIndex((l) => /UPDATE CoSo cs SET cs\.TrangThai='active'/.test(l.sql));
  assert.ok(ghiSan >= 0 && kichHoat > ghiSan, 'phải kích hoạt cơ sở sau khi bật sân');
});

test('Thêm khung giá: chèn 14 dòng (7 thứ × vãng lai/cố định), mỗi thứ giá riêng, và tính lại giá thấp nhất', async () => {
  cacLenh.length = 0;
  bangGiaHienCo = [khungCu];
  await dichVu.themKhungGia(3, 7, khungMoi);
  const them = cacLenh.find((l) => /INSERT INTO BangGia/.test(l.sql));
  assert.equal(them.thamSo[0].length, 14);
  assert.deepEqual(them.thamSo[0].slice(0, 2).concat(them.thamSo[0].slice(10)).map((d) => `${d[1]}/${d[2]}/${d[3]}`),
    ['1/weekday/walk_in', '1/weekday/fixed', '6/weekend/walk_in', '6/weekend/fixed', '7/weekend/walk_in', '7/weekend/fixed']);
  assert.equal(cacLenh.some((l) => /DELETE FROM BangGia/.test(l.sql)), false, 'không được xoá khung đã có');
  assert.ok(cacLenh.some((l) => /UPDATE CoSo SET GiaThapNhat/.test(l.sql)));
});

test('Thêm khung giá chồng khung cũ hoặc ngoài giờ mở cửa → 400, không ghi gì', async () => {
  cacLenh.length = 0;
  bangGiaHienCo = [khungCu];
  await assert.rejects(dichVu.themKhungGia(3, 7, { ...khungMoi, gioBatDau: '16:00', gioKetThuc: '18:00' }), /chồng nhau/);
  await assert.rejects(dichVu.themKhungGia(3, 7, { ...khungMoi, gioBatDau: '21:00', gioKetThuc: '23:00' }), /ngoài giờ mở cửa/);
  assert.equal(cacLenh.some((l) => /INSERT INTO BangGia/.test(l.sql)), false);
});

test('Thêm khung giá với giaTheoThu: mỗi thứ ghi đúng giá riêng của thứ đó', async () => {
  cacLenh.length = 0;
  bangGiaHienCo = [khungCu];
  const giaTheoThu = [1, 2, 3, 4, 5, 6, 7].map((thu) => ({ thu, giaKhachVangLai: 100000 + thu * 10000, giaKhachCoDinh: 90000 + thu * 10000 }));
  const { giaNgayThuongKhachVangLai, giaNgayThuongKhachCoDinh, giaCuoiTuanKhachVangLai, giaCuoiTuanKhachCoDinh, ...coBan } = khungMoi;
  await dichVu.themKhungGia(3, 7, { ...coBan, giaTheoThu });
  const dong = cacLenh.find((l) => /INSERT INTO BangGia/.test(l.sql)).thamSo[0];
  for (const thu of [1, 2, 3, 4, 5, 6, 7]) {
    const vangLai = dong.find((d) => d[1] === thu && d[3] === 'walk_in');
    assert.equal(vangLai[6], 100000 + thu * 10000, `thứ ${thu}`);
  }
});

test('Validator khung giá: giaTheoThu phải đủ 7 thứ không trùng; không có thì cần 4 trường cũ', () => {
  const co = { gioBatDau: '06:00', gioKetThuc: '08:00' };
  const mot = (thu) => ({ thu, giaKhachVangLai: 1000, giaKhachCoDinh: 900 });
  const day = [1, 2, 3, 4, 5, 6, 7].map(mot);
  const ok = (khung) => kiemTraChuSan.themKhungGia.body.safeParse(khung).success;
  assert.equal(ok({ ...co, giaTheoThu: day }), true);
  assert.equal(ok({ ...co, giaTheoThu: day.slice(0, 6) }), false);
  assert.equal(ok({ ...co, giaTheoThu: [...day.slice(0, 6), mot(1)] }), false);
  assert.equal(ok(co), false);
});

test('Validator khung giá: giờ sai định dạng hoặc thiếu giá bị từ chối', () => {
  const thu = (khung) => kiemTraChuSan.themKhungGia.body.safeParse(khung).success;
  assert.equal(thu(khungMoi), true);
  assert.equal(thu({ ...khungMoi, gioBatDau: '5h' }), false);
  const { giaCuoiTuanKhachCoDinh, ...thieuGia } = khungMoi;
  assert.equal(thu(thieuGia), false);
});

test('Hồ sơ chủ sân: đủ thì không thiếu mục nào; thiếu hoặc chỉ toàn khoảng trắng thì báo đúng mục', async () => {
  assert.deepEqual(await layMucConThieuHoSo(ketNoiGia, 3), []);
  hoSoGia = { ...hoSoGia, soDienThoai: null, tenDoanhNghiep: '   ', soTaiKhoan: '' };
  assert.deepEqual(await layMucConThieuHoSo(ketNoiGia, 3),
    ['số điện thoại liên hệ', 'tên doanh nghiệp', 'số tài khoản']);
});
