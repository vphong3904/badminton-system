const test = require('node:test');
const assert = require('node:assert/strict');

// Giả DB: ghi lại mọi câu lệnh để kiểm tra SQL mà service chạy.
const cacLenh = [];
let bangGiaHienCo = [];
let sanHienTai = { maSan: 9, maCoSo: 7, tenSan: 'Sân 1', trangThai: 'maintenance', maChuSan: 3, trangThaiCoSo: 'hidden', tenCoSo: 'CS' };
let hoSoGia = { soDienThoai: '0912000111', tenDoanhNghiep: 'Cty', tenNganHang: 'Vietcombank', maNganHang: 'VCB', soTaiKhoan: '0123456789', chuTaiKhoan: 'NGUYEN VAN A' };
const ketNoiGia = {
  async query(sql, thamSo = []) {
    cacLenh.push({ sql, thamSo });
    if (/FROM CoSo cs\s+WHERE cs\.MaChuSan = \? AND cs\.MaCoSo = \?/.test(sql)) {
      return [[{ maCoSo: 7, maChuSan: 3, tenCoSo: 'CS', gioMoCua: '06:00:00', gioDongCua: '22:00:00' }]];
    }
    if (/FROM BangGia WHERE MaCoSo = \?\s+GROUP BY/.test(sql)) return [bangGiaHienCo];
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

test('Thêm khung giá: chèn đúng 4 dòng (ngày thường/cuối tuần × vãng lai/cố định) và tính lại giá thấp nhất', async () => {
  cacLenh.length = 0;
  bangGiaHienCo = [khungCu];
  await dichVu.themKhungGia(3, 7, khungMoi);
  const them = cacLenh.find((l) => /INSERT INTO BangGia/.test(l.sql));
  assert.equal(them.thamSo[0].length, 4);
  assert.deepEqual(them.thamSo[0].map((d) => `${d[1]}/${d[2]}`),
    ['weekday/walk_in', 'weekday/fixed', 'weekend/walk_in', 'weekend/fixed']);
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
