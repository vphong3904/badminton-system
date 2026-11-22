const test = require('node:test');
const assert = require('node:assert/strict');

// Giả lập DB có trạng thái: danh sách đơn, tập khoá chống trùng (mô phỏng UNIQUE KhoaChongTrung của INSERT IGNORE).
const cacTruyVan = [];
const du = { cacDon: [], thongBao: [], cacKhoa: new Set() };
function datLai(cacDon) {
  cacTruyVan.length = 0;
  du.cacDon = cacDon.map((don) => ({
    maKhachHang: 7, nguon: 'app', maLichCoDinh: null, tenCoSo: 'Sân Hoa Lư', quaGio: true, trangThai: 'confirmed', ...don,
  }));
  du.thongBao = [];
  du.cacKhoa = new Set();
}

const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/FROM DatSan d\s+WHERE d\.TrangThai=.confirmed./.test(cauTruyVan)) {
      // WHERE d.TrangThai='confirmed' AND TIMESTAMP(NgayChoi, GioKetThuc) <= NOW()
      return [du.cacDon.filter((don) => don.trangThai === 'confirmed' && don.quaGio)];
    }
    if (/^\s*UPDATE DatSan SET TrangThai='completed'/.test(cauTruyVan)) {
      let soDong = 0;
      for (const don of du.cacDon) {
        if (thamSo.includes(don.maDatSan) && don.trangThai === 'confirmed') { don.trangThai = 'completed'; soDong += 1; }
      }
      return [{ affectedRows: soDong }];
    }
    if (/INSERT IGNORE INTO ThongBao/.test(cauTruyVan)) {
      const khoa = thamSo[6];
      if (khoa && du.cacKhoa.has(khoa)) return [{ affectedRows: 0 }];
      if (khoa) du.cacKhoa.add(khoa);
      du.thongBao.push(thamSo);
      return [{ affectedRows: 1 }];
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

const cauHinh = require('../src/config/env');
const { chayMotLan, batDauJob } = require('../src/jobs/hoanThanhDon');

test('job: đơn qua giờ → completed + đúng 1 thông báo nhắc đánh giá', async () => {
  datLai([{ maDatSan: 5, maDon: 'BK5' }]);
  const ketQua = await chayMotLan();
  assert.deepEqual(ketQua, { soDonHoanThanh: 1, soThongBao: 1 });
  assert.equal(du.cacDon[0].trangThai, 'completed');
  assert.equal(du.thongBao.length, 1);
  assert.deepEqual(du.thongBao[0], [
    7, 'review_reminder', 'Bạn đã chơi xong, hãy đánh giá sân',
    'Đơn BK5 tại Sân Hoa Lư đã hoàn thành. Hãy chấm sao và nhận xét để giúp người chơi khác chọn sân.',
    'booking', 5, 'review_reminder:5']);
});

test('job: truy vấn chọn đúng điều kiện, khoá dòng FOR UPDATE (không OF/SKIP LOCKED, tương thích MariaDB), dùng placeholder', async () => {
  datLai([{ maDatSan: 5, maDon: 'BK5' }]);
  await chayMotLan();
  const chon = cacTruyVan[0].cauTruyVan;
  assert.match(chon, /d\.TrangThai='confirmed'/);
  assert.match(chon, /TIMESTAMP\(d\.NgayChoi, d\.GioKetThuc\)<=NOW\(\)/);
  assert.match(chon, /FOR UPDATE`?$/);
  const capNhat = cacTruyVan.find((muc) => /UPDATE DatSan SET TrangThai='completed'/.test(muc.cauTruyVan));
  assert.match(capNhat.cauTruyVan, /MaDatSan IN \(\?\)/);
  assert.deepEqual(capNhat.thamSo, [5]);
});

test('job: chạy 2 lần không nhắc trùng', async () => {
  datLai([{ maDatSan: 5, maDon: 'BK5' }, { maDatSan: 6, maDon: 'BK6' }]);
  await chayMotLan();
  const lanHai = await chayMotLan();
  assert.deepEqual(lanHai, { soDonHoanThanh: 0, soThongBao: 0 });
  assert.equal(du.thongBao.length, 2);
  assert.equal(new Set(du.thongBao.map((tb) => tb[6])).size, 2);
});

test('job: đơn chưa qua giờ không đổi trạng thái, không có thông báo', async () => {
  datLai([{ maDatSan: 5, maDon: 'BK5', quaGio: false }]);
  const ketQua = await chayMotLan();
  assert.deepEqual(ketQua, { soDonHoanThanh: 0, soThongBao: 0 });
  assert.equal(du.cacDon[0].trangThai, 'confirmed');
  assert.equal(du.thongBao.length, 0);
  assert.equal(cacTruyVan.some((muc) => /^\s*UPDATE/.test(muc.cauTruyVan)), false);
});

test('job: chỉ đơn confirmed mới chuyển (đơn đã hủy/hết hạn/completed không bị đụng)', async () => {
  datLai([
    { maDatSan: 1, maDon: 'A', trangThai: 'cancelled' },
    { maDatSan: 2, maDon: 'B', trangThai: 'expired' },
    { maDatSan: 3, maDon: 'C', trangThai: 'completed' },
    { maDatSan: 4, maDon: 'D' },
  ]);
  const ketQua = await chayMotLan();
  assert.equal(ketQua.soDonHoanThanh, 1);
  assert.deepEqual(du.cacDon.map((don) => don.trangThai), ['cancelled', 'expired', 'completed', 'completed']);
  assert.deepEqual(du.thongBao.map((tb) => tb[5]), [4]);
});

test("job: đơn Nguon='owner' chuyển completed nhưng không có thông báo; đơn không có khách cũng vậy", async () => {
  datLai([
    { maDatSan: 5, maDon: 'BK5', nguon: 'owner', maKhachHang: null },
    { maDatSan: 6, maDon: 'BK6', nguon: 'owner', maKhachHang: 7 },
    { maDatSan: 7, maDon: 'BK7', nguon: 'app', maKhachHang: null },
  ]);
  const ketQua = await chayMotLan();
  assert.deepEqual(ketQua, { soDonHoanThanh: 3, soThongBao: 0 });
  assert.deepEqual(du.cacDon.map((don) => don.trangThai), ['completed', 'completed', 'completed']);
  assert.equal(du.thongBao.length, 0);
});

test('job: lịch cố định chỉ nhắc 1 lần mỗi lịch (cùng lượt quét và các lượt sau)', async () => {
  datLai([
    { maDatSan: 10, maDon: 'FX10', maLichCoDinh: 4 },
    { maDatSan: 11, maDon: 'FX11', maLichCoDinh: 4 },
    { maDatSan: 12, maDon: 'FX12', maLichCoDinh: 4, quaGio: false },
    { maDatSan: 20, maDon: 'BK20' }, // đơn lẻ cùng lượt vẫn được nhắc riêng
  ]);
  await chayMotLan();
  assert.equal(du.thongBao.length, 2);
  assert.deepEqual(du.thongBao.map((tb) => tb[6]), ['review_reminder:lich:4', 'review_reminder:20']);
  assert.equal(du.thongBao[0][5], 10); // tham chiếu buổi đầu tiên
  // Buổi cuối của lịch qua giờ ở lượt sau → đã completed nhưng không nhắc lại.
  du.cacDon[2].quaGio = true;
  const lanSau = await chayMotLan();
  assert.equal(lanSau.soDonHoanThanh, 1);
  assert.equal(du.cacDon[2].trangThai, 'completed');
  assert.equal(du.thongBao.length, 2);
});

test('batDauJob: không chạy khi NODE_ENV=test; ngược lại tạo setInterval đã unref', async () => {
  const goc = { moiTruong: cauHinh.moiTruong, phut: cauHinh.jobHoanThanhPhut };
  try {
    cauHinh.moiTruong = 'test';
    assert.equal(batDauJob(), null);

    datLai([]);
    cauHinh.moiTruong = 'development';
    cauHinh.jobHoanThanhPhut = 5;
    const hen = batDauJob();
    assert.ok(hen, 'phải trả về timer');
    assert.equal(hen.hasRef(), false, 'phải .unref() để không giữ process');
    clearInterval(hen);
    await new Promise((xong) => setImmediate(xong)); // cho lượt quét đầu tiên (không có đơn) kết thúc
  } finally {
    Object.assign(cauHinh, { moiTruong: goc.moiTruong, jobHoanThanhPhut: goc.phut });
  }
});

test('env: JOB_HOAN_THANH_PHUT mặc định 5 phút', () => {
  assert.equal(typeof cauHinh.jobHoanThanhPhut, 'number');
  assert.ok(cauHinh.jobHoanThanhPhut >= 1);
});
