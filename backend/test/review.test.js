const test = require('node:test');
const assert = require('node:assert/strict');

// Giả lập DB: mỗi test chỉnh `trangThaiGia` rồi gọi dịch vụ; `cacTruyVan` ghi lại SQL đã chạy.
const cacTruyVan = [];
const trangThaiGia = {};
function datLai() {
  cacTruyVan.length = 0;
  Object.assign(trangThaiGia, {
    don: { maDatSan: 5, trangThai: 'completed', maCoSo: 12, maLichCoDinh: null, maDatSanThanhToan: 5 },
    thanhToan: { trangThai: 'success' },
    daCoDanhGia: false,
    loiTrungKhoa: false,
    coSoTonTai: true,
    daCoTheoLich: false, // B1: lịch cố định đã có đánh giá ở buổi khác
    loiThongBao: false, // A3: giả lập ghi thông báo bị lỗi
    danhGiaCuaKhach: { maDanhGia: 77, maCoSo: 12, soSao: 3, noiDung: 'Tạm ổn', biAn: 0, ngayTao: '2026-11-11 20:00:00', quaHanSua: 0 },
  });
}

const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/^\s*UPDATE (DatSan|ThanhToan|LichCoDinh)/.test(cauTruyVan)) return [{ affectedRows: 0 }];
    if (/FROM DatSan d JOIN San s ON s\.MaSan=d\.MaSan\s+WHERE d\.MaDatSan=\?/.test(cauTruyVan)) {
      const thuocKhach = Number(thamSo[1]) === 7;
      return [thuocKhach && trangThaiGia.don ? [trangThaiGia.don] : []];
    }
    if (/FROM ThanhToan\s+WHERE MaDatSan=\?/.test(cauTruyVan)) {
      return [trangThaiGia.thanhToan ? [trangThaiGia.thanhToan] : []];
    }
    if (/SELECT MaDanhGia FROM DanhGia WHERE MaDatSan=\?/.test(cauTruyVan)) {
      return [trangThaiGia.daCoDanhGia ? [{ maDanhGia: 1 }] : []];
    }
    if (/JOIN DatSan dl ON dl\.MaDatSan=dg\.MaDatSan/.test(cauTruyVan)) {
      return [trangThaiGia.daCoTheoLich ? [{ maDanhGia: 9 }] : []];
    }
    if (/FROM CoSo cs JOIN NguoiDung nd ON nd\.MaNguoiDung=\?/.test(cauTruyVan)) {
      return [[{ tenCoSo: 'Sân Hoa Lư', maChuSan: 3, tenKhach: 'Le Hoang Phuc' }]];
    }
    if (/INSERT IGNORE INTO ThongBao/.test(cauTruyVan)) {
      if (trangThaiGia.loiThongBao) throw new Error('ghi thông báo lỗi');
      return [{ affectedRows: 1 }];
    }
    if (/FROM DanhGia WHERE MaDatSan=\? AND MaKhachHang=\? FOR UPDATE/.test(cauTruyVan)) {
      const thuocKhach = Number(thamSo[1]) === 7;
      return [thuocKhach && trangThaiGia.danhGiaCuaKhach ? [trangThaiGia.danhGiaCuaKhach] : []];
    }
    if (/^\s*UPDATE DanhGia SET SoSao/.test(cauTruyVan)) return [{ affectedRows: 1 }];
    if (/^\s*DELETE FROM DanhGia/.test(cauTruyVan)) return [{ affectedRows: 1 }];
    if (/FROM CoSo WHERE MaCoSo=\? FOR UPDATE/.test(cauTruyVan)) return [[{ maCoSo: 12 }]];
    if (/INSERT INTO DanhGia/.test(cauTruyVan)) {
      if (trangThaiGia.loiTrungKhoa) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      return [{ insertId: 77 }];
    }
    if (/UPDATE CoSo SET/.test(cauTruyVan)) return [{ affectedRows: 1 }];
    if (/SELECT DiemTrungBinh AS diemTrungBinh/.test(cauTruyVan)) {
      return [[{ diemTrungBinh: '4.5', soDanhGia: 6 }]];
    }
    if (/SELECT NgayTao AS ngayTao FROM DanhGia/.test(cauTruyVan)) {
      return [[{ ngayTao: '2026-11-11 20:00:00' }]];
    }
    if (/SELECT MaCoSo FROM CoSo WHERE MaCoSo=\? AND TrangThai='active'/.test(cauTruyVan)) {
      return [trangThaiGia.coSoTonTai ? [{ maCoSo: Number(thamSo[0]) }] : []];
    }
    if (/COUNT\(\*\) AS tongSo FROM DanhGia/.test(cauTruyVan)) return [[{ tongSo: 25 }]];
    if (/FROM DanhGia dg JOIN NguoiDung nd/.test(cauTruyVan)) {
      return [[{ maDanhGia: 3, tenKhach: 'Le Hoang Phuc', soSao: 5, noiDung: 'Tot', ngayTao: '2026-10-24 19:30:00', phanHoiChuSan: null, ngayPhanHoi: null }]];
    }
    // hetHanDatSan quét thêm các khoản thanh toán cần hoàn: test này không có dòng nào.
    if (/SELECT t\.MaThanhToan AS maThanhToan[\s\S]*SoTienHoan/.test(cauTruyVan)) return [[]];
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

const daGhiDanhGia = () => cacTruyVan.some((muc) => /INSERT INTO DanhGia/.test(muc.cauTruyVan));
const tuChoi = async (loiMongDoi, maTrangThai, maLoi) => {
  await assert.rejects(
    dichVu.guiDanhGia(7, 5, { soSao: 5, noiDung: 'Tốt' }),
    (loi) => {
      assert.match(loi.message, loiMongDoi);
      assert.equal(loi.maTrangThai, maTrangThai);
      assert.equal(loi.maLoi, maLoi);
      return true;
    });
  assert.equal(daGhiDanhGia(), false, 'không được ghi đánh giá khi bị từ chối');
};

test('Gửi đánh giá: đơn đã hoàn thành + đã thanh toán → ghi và tính lại điểm cơ sở', async () => {
  datLai();
  const ketQua = await dichVu.guiDanhGia(7, 5, { soSao: 4, noiDung: 'Sân đẹp' });
  assert.equal(ketQua.maDanhGia, 77);
  assert.equal(ketQua.maCoSo, 12);
  assert.equal(ketQua.soSao, 4);
  assert.equal(ketQua.noiDung, 'Sân đẹp');
  assert.equal(ketQua.diemTrungBinh, 4.5);
  assert.equal(ketQua.soDanhGia, 6);
  const them = cacTruyVan.find((muc) => /INSERT INTO DanhGia/.test(muc.cauTruyVan));
  assert.deepEqual(them.thamSo, [5, 7, 12, 4, 'Sân đẹp']);
  const capNhat = cacTruyVan.find((muc) => /UPDATE CoSo SET/.test(muc.cauTruyVan));
  assert.match(capNhat.cauTruyVan, /BiAn=0/);
  assert.deepEqual(capNhat.thamSo, [12, 12, 12]);
});

test('Gửi đánh giá: đơn đã check-in (chưa hết giờ chơi) đánh giá được', async () => {
  datLai();
  trangThaiGia.don.trangThai = 'checked_in';
  const ketQua = await dichVu.guiDanhGia(7, 5, { soSao: 5, noiDung: 'Vừa check-in xong' });
  assert.equal(ketQua.maDanhGia, 77);
});

test('Gửi đánh giá: bình luận để trống được lưu NULL', async () => {
  datLai();
  const ketQua = await dichVu.guiDanhGia(7, 5, { soSao: 5, noiDung: '' });
  assert.equal(ketQua.noiDung, null);
  const them = cacTruyVan.find((muc) => /INSERT INTO DanhGia/.test(muc.cauTruyVan));
  assert.equal(them.thamSo[4], null);
});

test('Gửi đánh giá: đơn chưa chơi xong hoặc chưa thanh toán bị từ chối (409)', async () => {
  for (const [trangThai, thongBao] of [
    ['confirmed', /sau khi check-in hoặc chơi xong/],
    ['pending_payment', /chưa thanh toán/],
    ['cancelled', /đã huỷ/],
    ['expired', /hết hạn/],
  ]) {
    datLai();
    trangThaiGia.don.trangThai = trangThai;
    await tuChoi(thongBao, 409, 'BOOKING_NOT_COMPLETED');
  }
});

test('Gửi đánh giá: có hoá đơn nhưng thanh toán chưa success bị từ chối', async () => {
  datLai();
  trangThaiGia.thanhToan = { trangThai: 'late_payment' };
  await tuChoi(/chưa hoàn tất thanh toán/, 409, 'PAYMENT_NOT_COMPLETED');
});

test('Gửi đánh giá: đơn không có dòng ThanhToan (dữ liệu mẫu) vẫn được đánh giá', async () => {
  datLai();
  trangThaiGia.thanhToan = null;
  const ketQua = await dichVu.guiDanhGia(7, 5, { soSao: 3 });
  assert.equal(ketQua.maDanhGia, 77);
});

test('Gửi đánh giá: mỗi đơn chỉ 1 đánh giá (kiểm trước và bắt trùng khoá)', async () => {
  datLai();
  trangThaiGia.daCoDanhGia = true;
  await tuChoi(/đã đánh giá/, 409, 'REVIEW_EXISTS');
  datLai();
  trangThaiGia.loiTrungKhoa = true;
  await assert.rejects(
    dichVu.guiDanhGia(7, 5, { soSao: 5 }),
    (loi) => loi.maTrangThai === 409 && loi.maLoi === 'REVIEW_EXISTS');
});

test('Gửi đánh giá: không đánh giá được đơn của người khác (404)', async () => {
  datLai();
  await assert.rejects(
    dichVu.guiDanhGia(999, 5, { soSao: 5 }),
    (loi) => loi.maTrangThai === 404 && /Không tìm thấy đơn/.test(loi.message));
  assert.equal(daGhiDanhGia(), false);
});

test('Danh sách đánh giá: phân trang, chỉ lấy đánh giá không bị ẩn', async () => {
  datLai();
  const ketQua = await dichVu.layDanhSachDanhGia(12, { trang: 3, soLuong: 10 });
  assert.equal(ketQua.tongSo, 25);
  assert.equal(ketQua.trang, 3);
  assert.equal(ketQua.soLuong, 10);
  assert.equal(ketQua.danhSach[0].tenKhach, 'Le Hoang Phuc');
  const truyVan = cacTruyVan.find((muc) => /FROM DanhGia dg JOIN NguoiDung nd/.test(muc.cauTruyVan));
  assert.match(truyVan.cauTruyVan, /BiAn=0/);
  assert.deepEqual(truyVan.thamSo, [12, 10, 20]);
});

test('Danh sách đánh giá: cơ sở không hoạt động → 404', async () => {
  datLai();
  trangThaiGia.coSoTonTai = false;
  await assert.rejects(dichVu.layDanhSachDanhGia(12), (loi) => loi.maTrangThai === 404);
});

// ---------- A3: thông báo khi có đánh giá mới ----------
const cacThongBao = () => cacTruyVan.filter((muc) => /INSERT IGNORE INTO ThongBao/.test(muc.cauTruyVan));

test('A3: gửi đánh giá → báo chủ sân (review_received) và cảm ơn khách (review_sent)', async () => {
  datLai();
  await dichVu.guiDanhGia(7, 5, { soSao: 4, noiDung: 'Sân đẹp' });
  const [choChuSan, choKhach] = cacThongBao().map((muc) => muc.thamSo);
  assert.deepEqual(choChuSan, [
    3, 'review_received', 'Bạn nhận được đánh giá mới',
    'Le Hoang Phuc đánh giá 4 sao cho Sân Hoa Lư: "Sân đẹp"', 'venue', 12, 'review_received:77']);
  assert.equal(choKhach[0], 7);
  assert.equal(choKhach[1], 'review_sent');
  assert.equal(choKhach[2], 'Cảm ơn bạn đã đánh giá');
  assert.equal(choKhach[6], 'review_sent:77');
});

test('A3: không có nhận xét thì không kèm trích dẫn; nhận xét dài chỉ lấy 80 ký tự đầu', async () => {
  datLai();
  await dichVu.guiDanhGia(7, 5, { soSao: 5 });
  assert.equal(cacThongBao()[0].thamSo[3], 'Le Hoang Phuc đánh giá 5 sao cho Sân Hoa Lư');
  datLai();
  await dichVu.guiDanhGia(7, 5, { soSao: 2, noiDung: 'a'.repeat(200) });
  assert.equal(cacThongBao()[0].thamSo[3],
    `Le Hoang Phuc đánh giá 2 sao cho Sân Hoa Lư: "${'a'.repeat(80)}…"`);
});

test('A3: lỗi ghi thông báo không làm hỏng việc gửi đánh giá', async () => {
  datLai();
  trangThaiGia.loiThongBao = true;
  const ketQua = await dichVu.guiDanhGia(7, 5, { soSao: 4, noiDung: 'Tốt' });
  assert.equal(ketQua.maDanhGia, 77);
  assert.equal(daGhiDanhGia(), true);
});

test('A3: đánh giá bị từ chối thì không sinh thông báo', async () => {
  datLai();
  trangThaiGia.daCoDanhGia = true;
  await tuChoi(/đã đánh giá/, 409, 'REVIEW_EXISTS');
  assert.equal(cacThongBao().length, 0);
});

// ---------- B1: mỗi lịch cố định chỉ 1 đánh giá ----------
test('B1: lịch cố định đã có đánh giá ở buổi khác → 409 REVIEW_EXISTS', async () => {
  datLai();
  trangThaiGia.don.maLichCoDinh = 4;
  trangThaiGia.daCoTheoLich = true;
  await tuChoi(/đánh giá lịch cố định này rồi/, 409, 'REVIEW_EXISTS');
  assert.equal(cacThongBao().length, 0);
});

test('B1: lịch cố định chưa có đánh giá → buổi đầu được đánh giá; đơn lẻ không bị kiểm tra theo lịch', async () => {
  datLai();
  trangThaiGia.don.maLichCoDinh = 4;
  const ketQua = await dichVu.guiDanhGia(7, 5, { soSao: 5 });
  assert.equal(ketQua.maDanhGia, 77);
  const kiemTraLich = cacTruyVan.find((muc) => /JOIN DatSan dl ON/.test(muc.cauTruyVan));
  assert.deepEqual(kiemTraLich.thamSo, [4]);
  datLai();
  await dichVu.guiDanhGia(7, 5, { soSao: 5 });
  assert.equal(cacTruyVan.some((muc) => /JOIN DatSan dl ON/.test(muc.cauTruyVan)), false);
});

test('B1: khoá dòng cơ sở trước khi kiểm tra lịch cố định (tránh 2 buổi cùng qua kiểm tra)', async () => {
  datLai();
  trangThaiGia.don.maLichCoDinh = 4;
  await dichVu.guiDanhGia(7, 5, { soSao: 5 });
  const viTriKhoa = cacTruyVan.findIndex((muc) => /FROM CoSo WHERE MaCoSo=\? FOR UPDATE/.test(muc.cauTruyVan));
  const viTriLich = cacTruyVan.findIndex((muc) => /JOIN DatSan dl ON/.test(muc.cauTruyVan));
  assert.ok(viTriKhoa >= 0 && viTriLich > viTriKhoa);
});

// ---------- B2: khách sửa / xoá đánh giá ----------
const daCapNhatDanhGia = () => cacTruyVan.find((muc) => /^\s*UPDATE DanhGia SET SoSao/.test(muc.cauTruyVan));

test('B2: sửa trong 7 ngày → cập nhật và tính lại điểm cơ sở', async () => {
  datLai();
  const ketQua = await dichVu.suaDanhGia(7, 5, { soSao: 5, noiDung: 'Rất tốt' });
  assert.deepEqual(daCapNhatDanhGia().thamSo, [5, 'Rất tốt', 77]);
  const capNhatCoSo = cacTruyVan.find((muc) => /UPDATE CoSo SET/.test(muc.cauTruyVan));
  assert.match(capNhatCoSo.cauTruyVan, /BiAn=0/);
  assert.equal(ketQua.soSao, 5);
  assert.equal(ketQua.noiDung, 'Rất tốt');
  assert.equal(ketQua.diemTrungBinh, 4.5);
});

test('B2: chỉ sửa 1 trường thì giữ nguyên trường còn lại; bình luận rỗng → NULL', async () => {
  datLai();
  await dichVu.suaDanhGia(7, 5, { soSao: 4 });
  assert.deepEqual(daCapNhatDanhGia().thamSo, [4, 'Tạm ổn', 77]);
  datLai();
  await dichVu.suaDanhGia(7, 5, { noiDung: '' });
  assert.deepEqual(daCapNhatDanhGia().thamSo, [3, null, 77]);
});

test('B2: quá 7 ngày → 409 REVIEW_EDIT_EXPIRED, không cập nhật', async () => {
  datLai();
  trangThaiGia.danhGiaCuaKhach.quaHanSua = 1;
  await assert.rejects(
    dichVu.suaDanhGia(7, 5, { soSao: 5 }),
    (loi) => loi.maTrangThai === 409 && loi.maLoi === 'REVIEW_EDIT_EXPIRED');
  assert.equal(daCapNhatDanhGia(), undefined);
});

test('B2: đánh giá đã bị admin ẩn thì không sửa được (409); không phải của khách → 404', async () => {
  datLai();
  trangThaiGia.danhGiaCuaKhach.biAn = 1;
  await assert.rejects(
    dichVu.suaDanhGia(7, 5, { soSao: 5 }),
    (loi) => loi.maTrangThai === 409 && loi.maLoi === 'REVIEW_HIDDEN');
  datLai();
  await assert.rejects(
    dichVu.suaDanhGia(999, 5, { soSao: 5 }),
    (loi) => loi.maTrangThai === 404 && /Không tìm thấy đánh giá/.test(loi.message));
  assert.equal(daCapNhatDanhGia(), undefined);
});

test('B2: xoá đánh giá → xoá dòng, tính lại điểm cơ sở', async () => {
  datLai();
  const ketQua = await dichVu.xoaDanhGia(7, 5);
  const xoa = cacTruyVan.find((muc) => /^\s*DELETE FROM DanhGia/.test(muc.cauTruyVan));
  assert.deepEqual(xoa.thamSo, [77]);
  assert.ok(cacTruyVan.some((muc) => /UPDATE CoSo SET/.test(muc.cauTruyVan)));
  assert.equal(ketQua.daXoa, true);
  assert.equal(ketQua.soDanhGia, 6);
});

test('B2: xoá đánh giá không tồn tại / của người khác → 404, không xoá', async () => {
  datLai();
  trangThaiGia.danhGiaCuaKhach = null;
  await assert.rejects(dichVu.xoaDanhGia(7, 5), (loi) => loi.maTrangThai === 404);
  assert.equal(cacTruyVan.some((muc) => /^\s*DELETE FROM DanhGia/.test(muc.cauTruyVan)), false);
});
