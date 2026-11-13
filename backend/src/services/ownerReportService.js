const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');

async function capNhatDonDaHoanTat(maChuSan, ketNoi = pool) {
  await ketNoi.query(
    `UPDATE DatSan d JOIN San s ON s.MaSan=d.MaSan
       JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     SET d.TrangThai='completed'
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai='confirmed'
       AND TIMESTAMP(d.NgayChoi,d.GioKetThuc)<=NOW()`,
    [maChuSan]);
}

// Doanh thu theo năm/tháng/ngày. Bộ lọc (đều tuỳ chọn):
//  - tuNgay/denNgay: khoảng ngày tự chọn (ưu tiên hơn nam/thang)
//  - nam, nam+thang: xem 1 năm / 1 tháng
//  - maCoSo: chỉ 1 cơ sở của chủ sân
// Chỉ tính đơn đặt qua app đã xác nhận/hoàn tất. Danh sách luôn mới nhất trước.
async function layDoanhThu(maChuSan, boLoc = {}) {
  if (typeof boLoc !== 'object' || boLoc === null) boLoc = { nam: boLoc }; // tương thích kiểu gọi cũ
  await capNhatDonDaHoanTat(maChuSan);
  const thamSo = [maChuSan];
  let loc = '';
  if (boLoc.maCoSo) { loc += ' AND cs.MaCoSo=?'; thamSo.push(boLoc.maCoSo); }
  const coKhoangNgay = Boolean(boLoc.tuNgay || boLoc.denNgay);
  if (coKhoangNgay) {
    if (boLoc.tuNgay) { loc += ' AND d.NgayChoi>=?'; thamSo.push(boLoc.tuNgay); }
    if (boLoc.denNgay) { loc += ' AND d.NgayChoi<=?'; thamSo.push(boLoc.denNgay); }
  } else {
    if (boLoc.nam) { loc += ' AND YEAR(d.NgayChoi)=?'; thamSo.push(boLoc.nam); }
    if (boLoc.nam && boLoc.thang) { loc += ' AND MONTH(d.NgayChoi)=?'; thamSo.push(boLoc.thang); }
  }
  const tu = `FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai IN ('confirmed','completed')${loc}`;

  const [[tongCong]] = await pool.query(
    `SELECT COALESCE(SUM(d.TongTien),0) AS doanhThu, COALESCE(SUM(d.PhiNenTang),0) AS phiNenTang,
       COALESCE(SUM(d.TienChuSan),0) AS tienChuSan, COUNT(*) AS soLuotDat ${tu}`,
    thamSo);
  const [theoNam] = await pool.query(
    `SELECT YEAR(d.NgayChoi) AS nam, SUM(d.TongTien) AS doanhThu,
       SUM(d.PhiNenTang) AS phiNenTang, SUM(d.TienChuSan) AS tienChuSan,
       COUNT(*) AS soLuotDat
     ${tu} GROUP BY YEAR(d.NgayChoi) ORDER BY nam DESC`,
    thamSo);
  const [theoThang] = await pool.query(
    `SELECT YEAR(d.NgayChoi) AS nam, MONTH(d.NgayChoi) AS thang,
       SUM(d.TongTien) AS doanhThu, SUM(d.TienChuSan) AS tienChuSan,
       COUNT(*) AS soLuotDat
     ${tu} GROUP BY YEAR(d.NgayChoi), MONTH(d.NgayChoi)
     ORDER BY nam DESC, thang DESC`,
    thamSo);
  const [theoNgay] = await pool.query(
    `SELECT d.NgayChoi AS ngay, SUM(d.TongTien) AS doanhThu,
       SUM(d.TienChuSan) AS tienChuSan, COUNT(*) AS soLuotDat
     ${tu} GROUP BY d.NgayChoi ORDER BY ngay DESC LIMIT 366`,
    thamSo);
  return {
    boLoc: {
      nam: coKhoangNgay ? null : boLoc.nam || null,
      thang: coKhoangNgay ? null : boLoc.thang || null,
      tuNgay: boLoc.tuNgay || null,
      denNgay: boLoc.denNgay || null,
      maCoSo: boLoc.maCoSo || null,
    },
    tongCong: {
      doanhThu: Number(tongCong.doanhThu),
      phiNenTang: Number(tongCong.phiNenTang),
      tienChuSan: Number(tongCong.tienChuSan),
      soLuotDat: Number(tongCong.soLuotDat),
    },
    theoNam,
    theoThang,
    theoNgay,
  };
}

async function layTopKhach(maChuSan, boLoc) {
  const thamSo = [maChuSan];
  let locNgay = '';
  if (boLoc.tuNgay) {
    locNgay += ' AND d.NgayChoi>=?';
    thamSo.push(boLoc.tuNgay);
  }
  if (boLoc.denNgay) {
    locNgay += ' AND d.NgayChoi<=?';
    thamSo.push(boLoc.denNgay);
  }
  const [khachHang] = await pool.query(
    `SELECT d.MaKhachHang AS maKhachHang, d.TenKhach AS tenKhach,
       d.SoDienThoaiLienHe AS soDienThoai, COUNT(*) AS soLuotDat,
       SUM(d.TongTien) AS tongChiTieu
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai IN ('confirmed','completed')${locNgay}
     GROUP BY d.MaKhachHang, d.TenKhach, d.SoDienThoaiLienHe
     ORDER BY soLuotDat DESC, tongChiTieu DESC LIMIT 20`,
    thamSo);
  return khachHang;
}

async function layTopSan(maChuSan, boLoc) {
  const thamSo = [maChuSan];
  let locNgay = '';
  if (boLoc.tuNgay) {
    locNgay += ' AND d.NgayChoi>=?';
    thamSo.push(boLoc.tuNgay);
  }
  if (boLoc.denNgay) {
    locNgay += ' AND d.NgayChoi<=?';
    thamSo.push(boLoc.denNgay);
  }
  const [cacSan] = await pool.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan, cs.TenCoSo AS tenCoSo,
       COUNT(*) AS soLuotDat, SUM(d.TongTien) AS tongDoanhThu
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai IN ('confirmed','completed')${locNgay}
     GROUP BY s.MaSan, s.TenSan, cs.TenCoSo
     ORDER BY tongDoanhThu DESC, soLuotDat DESC LIMIT 20`,
    thamSo);
  return cacSan;
}

async function layCongNo(maChuSan) {
  const [cacDon] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.TenKhach AS tenKhach,
       d.SoDienThoaiLienHe AS soDienThoai, d.NgayChoi AS ngay,
       d.TongTien AS tongTien, d.TrangThai AS trangThai
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='owner' AND d.TrangThaiThu='unpaid'
       AND d.TrangThai NOT IN ('cancelled','expired')
     ORDER BY d.NgayChoi DESC`,
    [maChuSan]);
  return {
    tongNo: cacDon.reduce((tong, don) => tong + Number(don.tongTien), 0),
    cacDon,
  };
}

async function laySoDuRutTien(maChuSan) {
  await capNhatDonDaHoanTat(maChuSan);
  const [[soDu]] = await pool.query(
    `SELECT COALESCE(SUM(d.TienChuSan),0) AS soTienCoTheRut
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai='completed'
       AND d.MaYeuCauRutTien IS NULL`,
    [maChuSan]);
  const [[taiKhoan]] = await pool.query(
    `SELECT TenNganHang AS tenNganHang, MaNganHang AS maNganHang,
       SoTaiKhoan AS soTaiKhoan, ChuTaiKhoan AS chuTaiKhoan
     FROM HoSoChuSan WHERE MaNguoiDung=?`,
    [maChuSan]);
  return { soTienCoTheRut: Number(soDu.soTienCoTheRut), taiKhoan };
}

async function taoYeuCauRutTien(maChuSan) {
  return thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('SELECT MaNguoiDung FROM NguoiDung WHERE MaNguoiDung=? FOR UPDATE', [maChuSan]);
    await capNhatDonDaHoanTat(maChuSan, ketNoi);
    const [[taiKhoan]] = await ketNoi.query(
      `SELECT TenNganHang AS tenNganHang, MaNganHang AS maNganHang,
         SoTaiKhoan AS soTaiKhoan, ChuTaiKhoan AS chuTaiKhoan
       FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE`,
      [maChuSan]);
    if (!taiKhoan?.tenNganHang || !taiKhoan.maNganHang || !taiKhoan.soTaiKhoan || !taiKhoan.chuTaiKhoan) {
      throw AppError.duLieuKhongHopLe('Hồ sơ chưa có đủ thông tin tài khoản nhận tiền');
    }
    const [[cauHinh]] = await ketNoi.query(
      "SELECT GiaTri AS giaTri FROM CauHinhHeThong WHERE KhoaCauHinh='min_payout'");
    const mucRutToiThieu = Number(cauHinh?.giaTri || 0);
    const [cacDon] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.TienChuSan AS tienChuSan
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai='completed'
         AND d.MaYeuCauRutTien IS NULL FOR UPDATE`,
      [maChuSan]);
    const soTien = cacDon.reduce((tong, don) => tong + Number(don.tienChuSan), 0);
    if (!cacDon.length || soTien < Math.max(mucRutToiThieu, 1)) {
      throw AppError.duLieuKhongHopLe(`Số dư phải đạt tối thiểu ${mucRutToiThieu} đồng mới được rút`);
    }
    const [yeuCau] = await ketNoi.query(
      `INSERT INTO YeuCauRutTien
       (MaChuSan, SoTien, TenNganHang, MaNganHang, SoTaiKhoan, ChuTaiKhoan)
       VALUES (?,?,?,?,?,?)`,
      [
        maChuSan, soTien, taiKhoan.tenNganHang, taiKhoan.maNganHang,
        taiKhoan.soTaiKhoan, taiKhoan.chuTaiKhoan,
      ]);
    await ketNoi.query(
      `UPDATE DatSan SET MaYeuCauRutTien=? WHERE MaDatSan IN (${cacDon.map(() => '?').join(',')})`,
      [yeuCau.insertId, ...cacDon.map((don) => don.maDatSan)]);
    return { maYeuCau: yeuCau.insertId, soTien, trangThai: 'pending' };
  });
}

module.exports = {
  layDoanhThu,
  layTopKhach,
  layTopSan,
  layCongNo,
  laySoDuRutTien,
  taoYeuCauRutTien,
};
