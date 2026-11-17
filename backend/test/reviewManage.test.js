const test = require('node:test');
const assert = require('node:assert/strict');

// Giả lập DB có trạng thái nhỏ: danh sách đánh giá + điểm cơ sở được tính lại đúng theo UPDATE CoSo.
const cacTruyVan = [];
const du = {};
function datLai() {
  cacTruyVan.length = 0;
  Object.assign(du, {
    cacDanhGia: [
      { maDanhGia: 1, soSao: 5, biAn: 0 },
      { maDanhGia: 2, soSao: 3, biAn: 0 },
      { maDanhGia: 3, soSao: 1, biAn: 0 },
    ],
    coSo: { diemTrungBinh: '3.0', soDanhGia: 3 },
    // Đánh giá được chọn để phản hồi / ẩn (kết quả của SELECT ... FOR UPDATE).
    mucDanhGia: {
      maDanhGia: 3, maKhachHang: 7, maCoSo: 12, biAn: 0, phanHoiCu: null, maChuSan: 4, tenCoSo: 'Sân Hoa Lư',
    },
    loiThongBao: false,
  });
}

const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/FROM DanhGia dg JOIN CoSo cs ON cs\.MaCoSo=dg\.MaCoSo\s+WHERE dg\.MaDanhGia=\? FOR UPDATE/.test(cauTruyVan)) {
      return [Number(thamSo[0]) === du.mucDanhGia?.maDanhGia ? [du.mucDanhGia] : []];
    }
    if (/FROM CoSo WHERE MaCoSo=\? FOR UPDATE/.test(cauTruyVan)) return [[{ maCoSo: 12 }]];
    if (/^\s*UPDATE DanhGia SET BiAn=\?/.test(cauTruyVan)) {
      du.cacDanhGia.find((muc) => muc.maDanhGia === Number(thamSo[1])).biAn = thamSo[0];
      return [{ affectedRows: 1 }];
    }
    if (/^\s*UPDATE DanhGia SET PhanHoiChuSan/.test(cauTruyVan)) return [{ affectedRows: 1 }];
    if (/SELECT NgayPhanHoi AS ngayPhanHoi/.test(cauTruyVan)) return [[{ ngayPhanHoi: '2026-11-16 09:00:00' }]];
    if (/^\s*UPDATE CoSo SET/.test(cauTruyVan)) {
      // Đúng công thức của service: chỉ tính BiAn=0, làm tròn 1 chữ số.
      const hienThi = du.cacDanhGia.filter((muc) => !muc.biAn);
      const tb = hienThi.length ? hienThi.reduce((t, muc) => t + muc.soSao, 0) / hienThi.length : 0;
      du.coSo = { diemTrungBinh: (Math.round(tb * 10) / 10).toFixed(1), soDanhGia: hienThi.length };
      return [{ affectedRows: 1 }];
    }
    if (/SELECT DiemTrungBinh AS diemTrungBinh/.test(cauTruyVan)) return [[du.coSo]];
    if (/INSERT INTO NhatKyHeThong/.test(cauTruyVan)) return [{ insertId: 1 }];
    if (/INSERT IGNORE INTO ThongBao/.test(cauTruyVan)) {
      if (du.loiThongBao) throw new Error('ghi thông báo lỗi');
      return [{ affectedRows: 1 }];
    }
    if (/SELECT COUNT\(\*\) AS tong/.test(cauTruyVan)) return [[{ tong: 42 }]];
    if (/FROM DanhGia dg\s+JOIN DatSan d/.test(cauTruyVan)) {
      return [[{ maDanhGia: 9, maDatSan: 5, maDon: 'BK1', maCoSo: 12, tenCoSo: 'Sân Hoa Lư', tenKhach: 'Le Hoang Phuc',
        soSao: 4, noiDung: 'Tốt', ngayTao: '2026-11-11 20:00:00', phanHoiChuSan: null, ngayPhanHoi: null, biAn: 1 }]];
    }
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

const dichVu = require('../src/services/reviewService');
const kiemTraChuSan = require('../src/validators/owner');
const kiemTraQuanTri = require('../src/validators/admin');

const thongBao = () => cacTruyVan.filter((muc) => /INSERT IGNORE INTO ThongBao/.test(muc.cauTruyVan)).map((muc) => muc.thamSo);
const daGhi = (mau) => cacTruyVan.some((muc) => mau.test(muc.cauTruyVan));

// ---------------- A1: chủ sân xem và phản hồi ----------------
test('A1: chủ sân phản hồi đánh giá của cơ sở mình → ghi phản hồi và báo khách review_replied', async () => {
  datLai();
  const ketQua = await dichVu.phanHoiDanhGia(4, 3, 'Cảm ơn bạn đã ủng hộ');
  const ghi = cacTruyVan.find((muc) => /UPDATE DanhGia SET PhanHoiChuSan=\?, NgayPhanHoi=NOW\(\)/.test(muc.cauTruyVan));
  assert.deepEqual(ghi.thamSo, ['Cảm ơn bạn đã ủng hộ', 3]);
  assert.deepEqual(ketQua, { maDanhGia: 3, phanHoiChuSan: 'Cảm ơn bạn đã ủng hộ', ngayPhanHoi: '2026-11-16 09:00:00' });
  const [tb] = thongBao();
  assert.equal(tb[0], 7); // khách
  assert.equal(tb[1], 'review_replied');
  assert.equal(tb[2], 'Chủ sân đã phản hồi đánh giá của bạn');
  assert.equal(tb[4], 'venue');
  assert.equal(tb[5], 12); // MaThamChieu = MaCoSo
  assert.equal(tb[6], 'review_replied:3:1');
});

test('A1: sửa phản hồi cũ → ghi đè; báo khách lại (khoá NULL); nội dung không đổi thì không báo', async () => {
  datLai();
  du.mucDanhGia.phanHoiCu = 'Phản hồi cũ';
  await dichVu.phanHoiDanhGia(4, 3, 'Phản hồi mới');
  assert.equal(thongBao().length, 1);
  assert.equal(thongBao()[0][6], null);
  datLai();
  du.mucDanhGia.phanHoiCu = 'Giữ nguyên';
  await dichVu.phanHoiDanhGia(4, 3, 'Giữ nguyên');
  assert.equal(thongBao().length, 0);
});

test('A1: đánh giá của cơ sở khác → 403, không ghi', async () => {
  datLai();
  await assert.rejects(
    dichVu.phanHoiDanhGia(99, 3, 'Cảm ơn bạn'),
    (loi) => loi.maTrangThai === 403);
  assert.equal(daGhi(/UPDATE DanhGia/), false);
  assert.equal(thongBao().length, 0);
});

test('A1: không tìm thấy đánh giá → 404 "Không tìm thấy đánh giá"', async () => {
  datLai();
  await assert.rejects(
    dichVu.phanHoiDanhGia(4, 555, 'Cảm ơn bạn'),
    (loi) => loi.maTrangThai === 404 && loi.message === 'Không tìm thấy đánh giá');
  assert.equal(daGhi(/UPDATE DanhGia/), false);
});

test('A1: đánh giá đã bị ẩn → 409 REVIEW_HIDDEN, không ghi', async () => {
  datLai();
  du.mucDanhGia.biAn = 1;
  await assert.rejects(
    dichVu.phanHoiDanhGia(4, 3, 'Cảm ơn bạn'),
    (loi) => loi.maTrangThai === 409 && loi.maLoi === 'REVIEW_HIDDEN');
  assert.equal(daGhi(/UPDATE DanhGia/), false);
});

test('A1: lỗi ghi thông báo không làm hỏng việc phản hồi', async () => {
  datLai();
  du.loiThongBao = true;
  const ketQua = await dichVu.phanHoiDanhGia(4, 3, 'Cảm ơn bạn');
  assert.equal(ketQua.maDanhGia, 3);
});

test('A1: validator — phản hồi ngắn hơn 2 ký tự (sau khi trim) hoặc dài hơn 1000 bị từ chối', () => {
  const luocDo = kiemTraChuSan.phanHoiDanhGia.body;
  assert.equal(luocDo.safeParse({ noiDung: 'a' }).success, false);
  assert.equal(luocDo.safeParse({ noiDung: '  a  ' }).success, false);
  assert.equal(luocDo.safeParse({}).success, false);
  assert.equal(luocDo.safeParse({ noiDung: 'ab' }).success, true);
  assert.equal(luocDo.safeParse({ noiDung: 'a'.repeat(1001) }).success, false);
  assert.equal(luocDo.parse({ noiDung: '  Cảm ơn  ' }).noiDung, 'Cảm ơn');
});

test('A1: danh sách — chỉ cơ sở của chủ sân, lọc, phân trang, mới nhất trước', async () => {
  datLai();
  const ketQua = await dichVu.lietKeDanhGiaChuSan(4, { maCoSo: 12, soSao: 5, chuaPhanHoi: true, trang: 2, soLuong: 10 });
  const truyVan = cacTruyVan.find((muc) => /FROM DanhGia dg\s+JOIN DatSan d/.test(muc.cauTruyVan) && /LIMIT/.test(muc.cauTruyVan));
  assert.match(truyVan.cauTruyVan, /cs\.MaChuSan=\?/);
  assert.match(truyVan.cauTruyVan, /dg\.PhanHoiChuSan IS NULL/);
  assert.match(truyVan.cauTruyVan, /ORDER BY dg\.NgayTao DESC, dg\.MaDanhGia DESC/);
  assert.deepEqual(truyVan.thamSo, [4, 12, 5, 10, 10]);
  assert.equal(ketQua.tong, 42);
  assert.equal(ketQua.trang, 2);
  assert.equal(ketQua.soDongMoiTrang, 10);
  assert.equal(ketQua.cacDanhGia[0].biAn, true);
  assert.equal(ketQua.cacDanhGia[0].tenKhach, 'Le Hoang Phuc');
});

test('A1: chuaPhanHoi=false → chỉ đánh giá đã có phản hồi; không truyền → không lọc phản hồi', async () => {
  datLai();
  await dichVu.lietKeDanhGiaChuSan(4, { chuaPhanHoi: false });
  assert.match(cacTruyVan.at(-1).cauTruyVan, /dg\.PhanHoiChuSan IS NOT NULL/);
  datLai();
  await dichVu.lietKeDanhGiaChuSan(4, {});
  assert.doesNotMatch(cacTruyVan.at(-1).cauTruyVan, /PhanHoiChuSan IS/);
});

// ---------------- A2: admin ẩn / hiện ----------------
test('A2: ẩn đánh giá → tính lại điểm chỉ từ đánh giá BiAn=0, ghi nhật ký, báo khách + chủ sân', async () => {
  datLai();
  assert.equal(du.coSo.diemTrungBinh, '3.0'); // (5+3+1)/3
  const ketQua = await dichVu.anHienDanhGia(1, 3, { an: true, lyDo: 'Ngôn từ xúc phạm' });
  assert.deepEqual(
    { biAn: ketQua.biAn, diemTrungBinh: ketQua.diemTrungBinh, soDanhGia: ketQua.soDanhGia },
    { biAn: true, diemTrungBinh: 4, soDanhGia: 2 }); // (5+3)/2
  const capNhatCoSo = cacTruyVan.find((muc) => /^\s*UPDATE CoSo SET/.test(muc.cauTruyVan));
  assert.match(capNhatCoSo.cauTruyVan, /ROUND\(AVG\(SoSao\),1\) FROM DanhGia WHERE MaCoSo=\? AND BiAn=0/);
  assert.match(capNhatCoSo.cauTruyVan, /COUNT\(\*\) FROM DanhGia WHERE MaCoSo=\? AND BiAn=0/);
  assert.deepEqual(capNhatCoSo.thamSo, [12, 12, 12]);
  const nhatKy = cacTruyVan.find((muc) => /INSERT INTO NhatKyHeThong/.test(muc.cauTruyVan));
  assert.deepEqual(nhatKy.thamSo, [1, 'an_danh_gia', 'DanhGia', 3, 'Ngôn từ xúc phạm']);
  const [choKhach, choChuSan] = thongBao();
  assert.deepEqual([choKhach[0], choKhach[1]], [7, 'review_hidden']);
  assert.match(choKhach[3], /Lý do: Ngôn từ xúc phạm/);
  assert.deepEqual([choChuSan[0], choChuSan[1]], [4, 'review_hidden']);
  assert.match(choChuSan[3], /Lý do: Ngôn từ xúc phạm/);
});

test('A2: khoá dòng cơ sở (FOR UPDATE) → đổi BiAn → tính lại điểm, đúng thứ tự', async () => {
  datLai();
  await dichVu.anHienDanhGia(1, 3, { an: true, lyDo: 'Spam quảng cáo' });
  const viTri = (mau) => cacTruyVan.findIndex((muc) => mau.test(muc.cauTruyVan));
  const khoa = viTri(/FROM CoSo WHERE MaCoSo=\? FOR UPDATE/);
  const doiBiAn = viTri(/^\s*UPDATE DanhGia SET BiAn=\?/);
  const tinhLai = viTri(/^\s*UPDATE CoSo SET/);
  assert.ok(khoa >= 0 && khoa < doiBiAn && doiBiAn < tinhLai);
});

test('A2: hiện lại → điểm quay về như cũ, nhật ký hien_danh_gia, chỉ báo khách (loại system)', async () => {
  datLai();
  du.cacDanhGia[2].biAn = 1;
  du.mucDanhGia.biAn = 1;
  const ketQua = await dichVu.anHienDanhGia(1, 3, { an: false });
  assert.deepEqual({ biAn: ketQua.biAn, diemTrungBinh: ketQua.diemTrungBinh, soDanhGia: ketQua.soDanhGia },
    { biAn: false, diemTrungBinh: 3, soDanhGia: 3 });
  const nhatKy = cacTruyVan.find((muc) => /INSERT INTO NhatKyHeThong/.test(muc.cauTruyVan));
  assert.deepEqual(nhatKy.thamSo, [1, 'hien_danh_gia', 'DanhGia', 3, null]);
  assert.equal(thongBao().length, 1);
  assert.deepEqual([thongBao()[0][0], thongBao()[0][1]], [7, 'system']);
});

test('A2: ẩn hết đánh giá → điểm về 0, số đánh giá 0', async () => {
  datLai();
  du.cacDanhGia = [{ maDanhGia: 3, soSao: 1, biAn: 0 }];
  const ketQua = await dichVu.anHienDanhGia(1, 3, { an: true, lyDo: 'Vi phạm' });
  assert.deepEqual([ketQua.diemTrungBinh, ketQua.soDanhGia], [0, 0]);
});

test('A2: đã ở trạng thái đó → 409; không tìm thấy → 404; không ghi gì', async () => {
  datLai();
  du.mucDanhGia.biAn = 1;
  await assert.rejects(
    dichVu.anHienDanhGia(1, 3, { an: true, lyDo: 'Vi phạm' }),
    (loi) => loi.maTrangThai === 409 && loi.maLoi === 'REVIEW_STATE_UNCHANGED');
  await assert.rejects(dichVu.anHienDanhGia(1, 555, { an: false }), (loi) => loi.maTrangThai === 404);
  assert.equal(daGhi(/UPDATE DanhGia|NhatKyHeThong|UPDATE CoSo/), false);
});

test('A2: validator — thiếu lyDo khi an=true bị từ chối; an=false không cần lyDo', () => {
  const luocDo = kiemTraQuanTri.anHienDanhGia.body;
  assert.equal(luocDo.safeParse({ an: true }).success, false);
  assert.equal(luocDo.safeParse({ an: true, lyDo: '  ab ' }).success, false);
  assert.equal(luocDo.safeParse({ an: true, lyDo: 'Spam' }).success, true);
  assert.equal(luocDo.safeParse({ an: true, lyDo: 'a'.repeat(256) }).success, false);
  assert.equal(luocDo.safeParse({ an: false }).success, true);
  assert.equal(luocDo.safeParse({ lyDo: 'Spam' }).success, false);
  assert.equal(luocDo.safeParse({ an: 'true', lyDo: 'Spam' }).success, false);
});

test('A2: danh sách admin — mặc định all, lọc hien/an, trả tên chủ sân', async () => {
  datLai();
  assert.equal(kiemTraQuanTri.danhSachDanhGia.query.parse({}).trangThai, 'all');
  assert.equal(kiemTraQuanTri.danhSachDanhGia.query.safeParse({ trangThai: 'xoa' }).success, false);
  await dichVu.lietKeDanhGiaQuanTri({ trangThai: 'all', trang: 1, soLuong: 20 });
  assert.doesNotMatch(cacTruyVan.at(-1).cauTruyVan, /dg\.BiAn=/);
  assert.match(cacTruyVan.at(-1).cauTruyVan, /cu\.HoTen AS tenChuSan/);
  datLai();
  await dichVu.lietKeDanhGiaQuanTri({ trangThai: 'an', maCoSo: 12, soSao: 1, trang: 3, soLuong: 5 });
  const truyVan = cacTruyVan.at(-1);
  assert.match(truyVan.cauTruyVan, /dg\.BiAn=1/);
  assert.deepEqual(truyVan.thamSo, [12, 1, 5, 10]);
  datLai();
  await dichVu.lietKeDanhGiaQuanTri({ trangThai: 'hien' });
  assert.match(cacTruyVan.at(-1).cauTruyVan, /dg\.BiAn=0/);
});
