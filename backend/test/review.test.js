const test = require('node:test');
const assert = require('node:assert/strict');

// Giả lập DB: mỗi test chỉnh `trangThaiGia` rồi gọi dịch vụ; `cacTruyVan` ghi lại SQL đã chạy.
const cacTruyVan = [];
const trangThaiGia = {};
function datLai() {
  cacTruyVan.length = 0;
  Object.assign(trangThaiGia, {
    don: { maDatSan: 5, trangThai: 'completed', maCoSo: 12, maDatSanThanhToan: 5 },
    thanhToan: { trangThai: 'success' },
    daCoDanhGia: false,
    loiTrungKhoa: false,
    coSoTonTai: true,
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

test('Gửi đánh giá: bình luận để trống được lưu NULL', async () => {
  datLai();
  const ketQua = await dichVu.guiDanhGia(7, 5, { soSao: 5, noiDung: '' });
  assert.equal(ketQua.noiDung, null);
  const them = cacTruyVan.find((muc) => /INSERT INTO DanhGia/.test(muc.cauTruyVan));
  assert.equal(them.thamSo[4], null);
});

test('Gửi đánh giá: đơn chưa chơi xong hoặc chưa thanh toán bị từ chối (409)', async () => {
  for (const [trangThai, thongBao] of [
    ['confirmed', /sau khi chơi xong/],
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
