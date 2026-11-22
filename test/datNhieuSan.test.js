// Task 2.3 — POST /khach/dat-san/nhieu (DAT_NHIEU_SAN_NHIEU_KHUNG_GIO.md mục 4, 5, 7 ca 9–15).
// DB giả có "rollback": lỗi ném ra trong giao dịch thì bảng DatSan/ThanhToan trở về như cũ.
// Cạnh tranh thật trên MySQL (2 khách, khóa chéo thứ tự sân) thuộc task 2.4.
const test = require('node:test');
const assert = require('node:assert/strict');

const HET_HAN_DB = '2026-11-21 10:10:00';
const cacTruyVan = [];
const bang = { datSan: [], thanhToan: [], thongBao: [] };
const cauHinh = {
  soPhutToiThieu: 60,
  cacSan: {
    31: { maCoSo: 12, tenSan: 'Sân 1', trangThaiSan: 'active' },
    32: { maCoSo: 12, tenSan: 'Sân 2', trangThaiSan: 'active' },
    33: { maCoSo: 12, tenSan: 'Sân 3', trangThaiSan: 'active' },
    40: { maCoSo: 99, tenSan: 'Sân khác cơ sở', trangThaiSan: 'active' },
    41: { maCoSo: 12, tenSan: 'Sân đóng', trangThaiSan: 'inactive' },
  },
  donBan: [], // { maSan, gioBatDau, gioKetThuc }
  khoa: [], // { maSan, gioBatDau, gioKetThuc }
};
let maDatSanTiepTheo = 500;

const chong = (a1, a2, b1, b2) => a1 < b2 && a2 > b1; // chuỗi HH:MM so sánh được

const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    cacTruyVan.push({ cauTruyVan, thamSo });
    if (/FROM San WHERE MaSan IN/.test(cauTruyVan)) {
      return [thamSo.filter((ma) => cauHinh.cacSan[ma]).sort((a, b) => a - b)
        .map((ma) => ({ maSan: ma, ...cauHinh.cacSan[ma] }))];
    }
    if (/FROM CoSo WHERE MaCoSo=\? AND TrangThai='active' FOR UPDATE/.test(cauTruyVan)) {
      return [thamSo[0] === 12 ? [{
        maCoSo: 12, tenCoSo: 'Cơ sở test', gioMoCua: '06:00:00', gioDongCua: '22:00:00',
        soPhutDatToiThieu: cauHinh.soPhutToiThieu, maChuSan: 4,
      }] : []];
    }
    if (/SELECT HoTen AS hoTen/.test(cauTruyVan)) return [[{ hoTen: 'Khách Test', soDienThoai: '0901234567' }]];
    if (/SELECT MaDatSan FROM DatSan/.test(cauTruyVan)) {
      const [maSan, , gioKetThuc, gioBatDau] = thamSo;
      const trung = cauHinh.donBan.some((don) => don.maSan === maSan
        && chong(don.gioBatDau, don.gioKetThuc, gioBatDau, gioKetThuc));
      return [trung ? [{ maDatSan: 99 }] : []];
    }
    if (/SELECT MaKhoa FROM KhoaSan/.test(cauTruyVan)) {
      const [maSan, , gioKetThuc, gioBatDau] = thamSo;
      const trung = cauHinh.khoa.some((khoa) => khoa.maSan === maSan
        && chong(khoa.gioBatDau, khoa.gioKetThuc, gioBatDau, gioKetThuc));
      return [trung ? [{ maKhoa: 7 }] : []];
    }
    if (/FROM BangGia/.test(cauTruyVan)) return [[{ gioBatDau: '06:00:00', gioKetThuc: '22:00:00', giaMoiGio: 100000 }]];
    if (/FROM HoSoChuSan h/.test(cauTruyVan)) {
      return [[{ tenNganHang: 'Vietcombank', maNganHang: 'VCB', soTaiKhoan: '1234567890', chuTaiKhoan: 'NGUYEN VAN A' }]];
    }
    if (/FROM CauHinhHeThong/.test(cauTruyVan)) {
      return [[{ giaTri: thamSo[0] === 'commission_rate' ? '10' : '10' }]];
    }
    if (/SELECT DATE_ADD\(NOW\(\)/.test(cauTruyVan)) return [[{ hetHan: HET_HAN_DB }]];
    if (/UPDATE DatSan SET TrangThai='expired'/.test(cauTruyVan)) return [{ affectedRows: 0 }];
    if (/UPDATE DatSan SET MaNhomDat = MaDatSan WHERE MaDatSan=\?/.test(cauTruyVan)) {
      const don = bang.datSan.find((dong) => dong.maDatSan === thamSo[0]);
      don.maNhomDat = thamSo[0];
      return [{ affectedRows: 1 }];
    }
    if (/INSERT INTO DatSan/.test(cauTruyVan)) {
      const [maDon, , , , , maNhomDat, maSan, ngay, gioBatDau, gioKetThuc, soPhut, tongTien, phi, tienChuSan, hetHan] = thamSo;
      const maDatSan = maDatSanTiepTheo++;
      bang.datSan.push({ maDatSan, maDon, maNhomDat, maSan, ngay, gioBatDau, gioKetThuc, soPhut, tongTien, phi, tienChuSan, hetHan });
      return [{ insertId: maDatSan }];
    }
    if (/INSERT INTO ThanhToan/.test(cauTruyVan)) {
      bang.thanhToan.push({ maDatSan: thamSo[0], soTien: thamSo[1], noiDung: thamSo[2] });
      return [{ insertId: 900 }];
    }
    if (/INSERT IGNORE INTO ThongBao/.test(cauTruyVan)) {
      bang.thongBao.push({ maNguoiDung: thamSo[0], loai: thamSo[1], noiDung: thamSo[3], maThamChieu: thamSo[5], khoa: thamSo[6] });
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
  exports: {
    pool: ketNoiGia,
    // Giả giao dịch: lỗi thì trả bảng về như trước (như ROLLBACK).
    thucHienGiaoDich: async (hamThucThi) => {
      const truoc = {
        datSan: structuredClone(bang.datSan),
        thanhToan: structuredClone(bang.thanhToan),
        thongBao: structuredClone(bang.thongBao),
      };
      try {
        return await hamThucThi(ketNoiGia);
      } catch (loi) {
        Object.assign(bang, truoc);
        throw loi;
      }
    },
  },
};

const dichVu = require('../src/services/customerService');
const kiemTraDuLieu = require('../src/validators/customer');

const ngayMai = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const yeuCau = (cacMuc, them = {}) => ({
  maCoSo: 12, ngay: ngayMai, tenKhach: 'Khách Test', soDienThoai: '0901234567', cacMuc, ...them,
});
const muc = (maSan, gioBatDau, gioKetThuc) => ({ maSan, gioBatDau, gioKetThuc });

function datLai() {
  cacTruyVan.length = 0;
  bang.datSan.length = 0;
  bang.thanhToan.length = 0;
  bang.thongBao.length = 0;
  cauHinh.soPhutToiThieu = 60;
  cauHinh.donBan = [];
  cauHinh.khoa = [];
  maDatSanTiepTheo = 500;
}
const khongTaoGi = () => {
  assert.equal(bang.datSan.length, 0, 'không được có DatSan nào');
  assert.equal(bang.thanhToan.length, 0, 'không được có ThanhToan nào');
  assert.equal(bang.thongBao.length, 0, 'không được có thông báo nào');
};
const baoLoi = async (hamGoi) => {
  try {
    await hamGoi();
  } catch (loi) {
    return loi;
  }
  return assert.fail('Đáng lẽ phải ném lỗi');
};

test('9. Đặt 2 sân × 1 cụm → cùng MaNhomDat, đúng 1 ThanhToan, SoTien = tổng', async () => {
  datLai();
  // Cố ý đưa sân 32 (18:00) sau sân 31 (19:00) để kiểm đơn con đầu = cụm sớm nhất.
  const ketQua = await dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '19:00', '21:00'), muc(32, '18:00', '20:00')]));
  assert.equal(ketQua.cacDon.length, 2);
  assert.equal(ketQua.cacDon[0].maSan, 32);
  assert.equal(ketQua.cacDon[1].maSan, 31);
  assert.equal(ketQua.maNhomDat, ketQua.cacDon[0].maDatSan);
  assert.deepEqual(bang.datSan.map((don) => don.maNhomDat), [ketQua.maNhomDat, ketQua.maNhomDat]);
  assert.equal(bang.thanhToan.length, 1);
  assert.equal(ketQua.tongTien, 400000);
  assert.equal(bang.thanhToan[0].soTien, 400000);
  assert.equal(bang.thanhToan[0].maDatSan, ketQua.cacDon[0].maDatSan);
  assert.equal(bang.thanhToan[0].noiDung, ketQua.maDonThanhToan);
  assert.equal(ketQua.maDonThanhToan, ketQua.cacDon[0].maDon);
  assert.equal(ketQua.maThanhToan, 900);
  assert.equal(ketQua.ngay, ngayMai);
  assert.deepEqual(ketQua.cacDon[0], {
    maDatSan: 500, maDon: ketQua.cacDon[0].maDon, maSan: 32, tenSan: 'Sân 2', ngay: ngayMai,
    gioBatDau: '18:00', gioKetThuc: '20:00', tongTien: 200000,
  });
  assert.match(ketQua.anhQrUrl, /^https:\/\/img\.vietqr\.io\/image\/VCB-1234567890-compact2\.png/);
  assert.ok(ketQua.maQr);
  // Phí nền tảng tính theo từng đơn con (10%).
  assert.deepEqual(bang.datSan.map((don) => [don.phi, don.tienChuSan]), [[20000, 180000], [20000, 180000]]);
});

test('9b. Hai mục liền kề cùng sân gộp thành 1 đơn con; mục chồng nhau không tính tiền hai lần', async () => {
  datLai();
  const ketQua = await dichVu.taoDatNhieuSan(7, yeuCau([
    muc(31, '18:00', '19:00'), muc(31, '19:00', '20:00'), muc(31, '19:30', '20:00'),
  ]));
  assert.equal(ketQua.cacDon.length, 1);
  assert.equal(ketQua.cacDon[0].gioBatDau, '18:00');
  assert.equal(ketQua.cacDon[0].gioKetThuc, '20:00');
  assert.equal(ketQua.tongTien, 200000);
  assert.equal(ketQua.maNhomDat, ketQua.cacDon[0].maDatSan);
});

test('10. Một trong 3 cụm trùng → 409 liệt kê đúng cụm, không tạo DatSan/ThanhToan nào', async () => {
  datLai();
  cauHinh.donBan = [{ maSan: 32, gioBatDau: '18:30', gioKetThuc: '19:30' }];
  const loi = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([
    muc(31, '18:00', '20:00'), muc(32, '19:00', '21:00'), muc(33, '18:00', '19:00'),
  ])));
  assert.equal(loi.maTrangThai, 409);
  assert.equal(loi.maLoi, 'CONFLICT');
  // chiSo = vị trí của cụm trong danh sách cụm SAU KHI gộp và sắp (ngay, gioBatDau, maSan): 31 18:00, 33 18:00, 32 19:00.
  assert.deepEqual(loi.chiTiet.cacCumTrung, [{
    chiSo: 2, maSan: 32, tenSan: 'Sân 2', ngay: ngayMai, gioBatDau: '19:00', gioKetThuc: '21:00', lyDo: 'booked',
  }]);
  khongTaoGi();
});

test('11. Hai cụm trùng → 409 liệt kê cả hai (không dừng ở cụm đầu)', async () => {
  datLai();
  cauHinh.donBan = [{ maSan: 31, gioBatDau: '18:00', gioKetThuc: '19:00' }, { maSan: 33, gioBatDau: '20:00', gioKetThuc: '21:00' }];
  const loi = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([
    muc(31, '18:00', '20:00'), muc(32, '18:00', '20:00'), muc(33, '20:00', '21:00'),
  ])));
  assert.equal(loi.maTrangThai, 409);
  assert.deepEqual(loi.chiTiet.cacCumTrung.map((cum) => [cum.chiSo, cum.maSan, cum.lyDo]), [[0, 31, 'booked'], [2, 33, 'booked']]);
  khongTaoGi();
});

test('12. Cụm trùng do khóa sân → lyDo=locked', async () => {
  datLai();
  cauHinh.khoa = [{ maSan: 32, gioBatDau: '10:00', gioKetThuc: '12:00' }];
  const loi = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '20:00'), muc(32, '11:00', '13:00')])));
  assert.equal(loi.maTrangThai, 409);
  assert.deepEqual(loi.chiTiet.cacCumTrung.map((cum) => [cum.maSan, cum.lyDo]), [[32, 'locked']]);
  khongTaoGi();
});

test('12b. Đơn kề sát (không chồng giờ) không bị coi là trùng', async () => {
  datLai();
  cauHinh.donBan = [{ maSan: 31, gioBatDau: '17:00', gioKetThuc: '18:00' }];
  const ketQua = await dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00')]));
  assert.equal(ketQua.cacDon.length, 1);
});

test('13. Sân không thuộc maCoSo → 400 chỉ đúng mục; sân không tồn tại/không active → 404', async () => {
  datLai();
  const loi400 = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00'), muc(40, '18:00', '19:00')])));
  assert.equal(loi400.maTrangThai, 400);
  assert.deepEqual(loi400.chiTiet.map((muc_) => muc_.truong), ['cacMuc[1].maSan']);
  const loiKhongCo = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00'), muc(999, '18:00', '19:00')])));
  assert.equal(loiKhongCo.maTrangThai, 404);
  const loiDong = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(41, '18:00', '19:00')])));
  assert.equal(loiDong.maTrangThai, 404);
  // Cơ sở không hoạt động/không tồn tại (sân 40 thuộc cơ sở 99, giả lập không có dòng CoSo active) → 404.
  const loiCoSo = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(40, '18:00', '19:00')], { maCoSo: 99 })));
  assert.equal(loiCoSo.maTrangThai, 404);
  // Gửi sân của cơ sở 12 nhưng ghi maCoSo khác → 400 (sân không thuộc cơ sở đã chọn).
  const loiLech = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00')], { maCoSo: 77 })));
  assert.equal(loiLech.maTrangThai, 400);
  khongTaoGi();
});

test('14. Cụm ngắn hơn tối thiểu → 400, chiTiet = { cacCumNgan: [...] } kèm số liệu từng cụm', async () => {
  datLai();
  cauHinh.soPhutToiThieu = 120;
  const loi = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([
    muc(31, '18:00', '19:00'), muc(32, '19:00', '20:00'), muc(33, '18:00', '20:00'),
  ])));
  assert.equal(loi.maTrangThai, 400);
  assert.equal(loi.maLoi, 'BAD_REQUEST');
  assert.deepEqual(loi.chiTiet, {
    cacCumNgan: [
      { maSan: 31, ngay: ngayMai, gioBatDau: '18:00', gioKetThuc: '19:00', soPhut: 60, soPhutToiThieu: 120 },
      { maSan: 32, ngay: ngayMai, gioBatDau: '19:00', gioKetThuc: '20:00', soPhut: 60, soPhutToiThieu: 120 },
    ],
  });
  assert.equal(loi.message, 'Sân 1, 18:00–19:00 chỉ 60 phút, tối thiểu 120 phút (và 1 khung khác).');
  khongTaoGi();
});

test('14b. Tối thiểu 120: 60′ + 60′ liền kề cùng sân là hợp lệ; đúng biên 120′ hợp lệ', async () => {
  datLai();
  cauHinh.soPhutToiThieu = 120;
  const ketQua = await dichVu.taoDatNhieuSan(7, yeuCau([
    muc(31, '11:00', '12:00'), muc(31, '12:00', '13:00'), muc(32, '18:00', '20:00'),
  ]));
  assert.deepEqual(ketQua.cacDon.map((don) => [don.maSan, don.gioBatDau, don.gioKetThuc]),
    [[31, '11:00', '13:00'], [32, '18:00', '20:00']]);
});

test('14c. Cụm ngắn được kiểm trước khi dò trùng lịch (không truy vấn DatSan)', async () => {
  datLai();
  cauHinh.soPhutToiThieu = 120;
  await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00')])));
  assert.equal(cacTruyVan.some((truyVan) => /FROM DatSan/.test(truyVan.cauTruyVan)), false);
});

test('15. Mọi đơn con có CÙNG HetHanGiuCho (tính 1 lần), kết quả trả dạng ISO +07:00', async () => {
  datLai();
  const ketQua = await dichVu.taoDatNhieuSan(7, yeuCau([
    muc(31, '18:00', '20:00'), muc(32, '18:00', '20:00'), muc(33, '18:00', '20:00'),
  ]));
  assert.equal(bang.datSan.length, 3);
  assert.deepEqual([...new Set(bang.datSan.map((don) => don.hetHan))], [HET_HAN_DB]);
  assert.equal(cacTruyVan.filter((truyVan) => /DATE_ADD\(NOW\(\)/.test(truyVan.cauTruyVan)).length, 1);
  assert.equal(ketQua.hetHanGiuCho, '2026-11-21T10:10:00+07:00');
});

test('Khóa San theo maSan TĂNG DẦN trong 1 câu, rồi mới khóa CoSo (chống deadlock khi khóa chéo thứ tự)', async () => {
  datLai();
  await dichVu.taoDatNhieuSan(7, yeuCau([muc(33, '18:00', '19:00'), muc(31, '18:00', '19:00'), muc(32, '18:00', '19:00')]));
  const viTriSan = cacTruyVan.findIndex((truyVan) => /FROM San WHERE MaSan IN/.test(truyVan.cauTruyVan));
  const viTriCoSo = cacTruyVan.findIndex((truyVan) => /FROM CoSo WHERE MaCoSo=\? AND TrangThai='active' FOR UPDATE/.test(truyVan.cauTruyVan));
  assert.equal(viTriSan, 0);
  assert.ok(viTriCoSo > viTriSan);
  assert.deepEqual(cacTruyVan[viTriSan].thamSo, [31, 32, 33]);
  assert.match(cacTruyVan[viTriSan].cauTruyVan, /ORDER BY MaSan ASC FOR UPDATE/);
});

test('Dùng SLOT_BAN để dò trùng (không viết cứng trạng thái)', async () => {
  datLai();
  await dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00')]));
  const truyVan = cacTruyVan.find((muc_) => /SELECT MaDatSan FROM DatSan/.test(muc_.cauTruyVan));
  assert.match(truyVan.cauTruyVan, /HetHanGiuCho IS NULL OR DatSan\.HetHanGiuCho>NOW\(\)/);
});

test('Ngoài giờ hoạt động và giờ bắt đầu đã qua → 400, gom đủ mọi cụm lỗi', async () => {
  datLai();
  const ngoaiGio = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '05:00', '07:00'), muc(32, '21:00', '23:00')])));
  assert.equal(ngoaiGio.maTrangThai, 400);
  assert.equal(ngoaiGio.chiTiet.length, 2);
  assert.match(ngoaiGio.chiTiet[0].thongBao, /ngoài giờ hoạt động \(06:00–22:00\)/);
  const quaKhu = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00')], { ngay: '2000-01-01' })));
  assert.equal(quaKhu.maTrangThai, 400);
  assert.deepEqual(quaKhu.chiTiet.map((chiTiet) => chiTiet.truong), ['ngay']);
  assert.equal(quaKhu.chiTiet[0].thongBao, 'Không thể chọn ngày đã qua.');
  khongTaoGi();
});

test('Chưa có giá cho khung giờ → 400 và không giữ cụm nào', async () => {
  datLai();
  const goc = ketNoiGia.query;
  ketNoiGia.query = async (cauTruyVan, thamSo = []) => (/FROM BangGia/.test(cauTruyVan)
    ? [[{ gioBatDau: '06:00:00', gioKetThuc: '19:00:00', giaMoiGio: 100000 }]]
    : goc(cauTruyVan, thamSo));
  try {
    const loi = await baoLoi(() => dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00'), muc(32, '18:00', '20:00')])));
    assert.equal(loi.maTrangThai, 400);
    assert.match(loi.message, /Chưa có giá cho khung 19:00/);
    khongTaoGi();
  } finally {
    ketNoiGia.query = goc;
  }
});

test('Thông báo: đúng 1 cho khách và 1 cho chủ sân, khóa chống trùng theo maNhomDat', async () => {
  datLai();
  const ketQua = await dichVu.taoDatNhieuSan(7, yeuCau([
    muc(31, '18:00', '20:00'), muc(32, '18:00', '20:00'), muc(33, '18:00', '20:00'), muc(31, '21:00', '22:00'),
  ]));
  assert.equal(bang.thongBao.length, 2);
  const [khach, chuSan] = bang.thongBao;
  assert.deepEqual([khach.maNguoiDung, khach.loai, khach.khoa], [7, 'booking_created', `booking_created:${ketQua.maNhomDat}`]);
  assert.deepEqual([chuSan.maNguoiDung, chuSan.loai, chuSan.khoa], [4, 'new_booking_for_owner', `new_booking_for_owner:${ketQua.maNhomDat}`]);
  assert.equal(khach.maThamChieu, ketQua.cacDon[0].maDatSan);
  assert.match(khach.noiDung, /và 1 khung khác/);
  assert.match(khach.noiDung, new RegExp(ketQua.maDonThanhToan));
});

test('Hủy đơn hết hạn cũ chỉ trên các sân của yêu cầu, trong ngày đã chọn', async () => {
  datLai();
  await dichVu.taoDatNhieuSan(7, yeuCau([muc(31, '18:00', '19:00'), muc(32, '18:00', '19:00')]));
  const lenh = cacTruyVan.find((truyVan) => /UPDATE DatSan SET TrangThai='expired'/.test(truyVan.cauTruyVan));
  assert.deepEqual(lenh.thamSo, [31, 32, ngayMai]);
});

// ---- Validator (zod) ----
const kiemTra = (body) => kiemTraDuLieu.datNhieu.body.safeParse(body);
const duongDan = (ketQua) => ketQua.error.issues.map((loi) => loi.path.join('.'));

test('Validator: body hợp lệ được nhận, mảng 1 mục là đủ', () => {
  assert.equal(kiemTra(yeuCau([muc(31, '18:00', '20:00')])).success, true);
  assert.equal(kiemTra(yeuCau([muc(31, '18:00', '20:00')], { ghiChu: 'Mang vợt' })).success, true);
});

test('Validator: thiếu/sai trường báo đúng đường dẫn', () => {
  assert.deepEqual(duongDan(kiemTra(yeuCau([]))), ['cacMuc']);
  const khongCoMuc = kiemTra({ maCoSo: 12, ngay: ngayMai, tenKhach: 'Khách Test', soDienThoai: '0901234567' });
  assert.ok(duongDan(khongCoMuc).includes('cacMuc'));
  assert.ok(duongDan(kiemTra(yeuCau([muc(31, '18:00', '20:00')], { maCoSo: undefined }))).includes('maCoSo'));
  assert.ok(duongDan(kiemTra(yeuCau([muc(31, '18:00', '20:00')], { ngay: '2026-02-30' }))).includes('ngay'));
  assert.ok(duongDan(kiemTra(yeuCau([muc(31, '18:00', '20:00')], { tenKhach: '' }))).includes('tenKhach'));
});

test('Validator: lỗi từng mục kèm chỉ số (giờ lệch mốc 30′, kết thúc ≤ bắt đầu, mã sân sai)', () => {
  assert.deepEqual(duongDan(kiemTra(yeuCau([muc(31, '18:00', '20:00'), muc(32, '18:15', '20:00')]))), ['cacMuc.1.gioBatDau']);
  assert.deepEqual(duongDan(kiemTra(yeuCau([muc(31, '20:00', '20:00')]))), ['cacMuc.0.gioKetThuc']);
  assert.deepEqual(duongDan(kiemTra(yeuCau([muc(0, '18:00', '20:00')]))), ['cacMuc.0.maSan']);
});

test('Validator: không giới hạn số mục (quyết định C)', () => {
  const nhieuMuc = Array.from({ length: 200 }, (_gia, chiSo) => muc(chiSo + 1, '18:00', '20:00'));
  assert.equal(kiemTra(yeuCau(nhieuMuc)).success, true);
});
