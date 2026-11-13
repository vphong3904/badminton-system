// Thống kê khách hàng đặt sân của chủ sân (chỉ đọc).
// Định danh khách: có tài khoản → MaKhachHang; khách vãng lai do chủ sân tạo → số điện thoại.
// "Lượt đặt" = đơn confirmed/completed; "lượt huỷ" = đơn cancelled (đơn chờ thanh toán/hết hạn bị bỏ qua).
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');

const KHOA = "COALESCE(CONCAT('kh', d.MaKhachHang), CONCAT('sdt', d.SoDienThoaiLienHe))";
const HOP_LE = "t.trangThai IN ('confirmed','completed')";
const SO_DONG_MAC_DINH = 20;

// Bảng "mỗi dòng = 1 đơn" kèm: ngày đặt đầu tiên của khách (toàn thời gian) và đơn có nằm trong khoảng lọc không.
// Không lọc ngày ở WHERE để vẫn biết khách đã từng đặt trước khoảng lọc hay chưa (phân biệt khách mới / khách cũ).
function taoBangDon(maChuSan, boLoc) {
  const dkNgay = [];
  const thamSoNgay = [];
  if (boLoc.tuNgay) { dkNgay.push('d.NgayChoi >= ?'); thamSoNgay.push(boLoc.tuNgay); }
  if (boLoc.denNgay) { dkNgay.push('d.NgayChoi <= ?'); thamSoNgay.push(boLoc.denNgay); }
  const trongKhoang = dkNgay.length ? `(${dkNgay.join(' AND ')})` : '1=1';
  const thamSo = [...thamSoNgay, maChuSan];
  let locCoSo = '';
  if (boLoc.maCoSo) { locCoSo = ' AND cs.MaCoSo = ?'; thamSo.push(boLoc.maCoSo); }
  const sql = `SELECT ${KHOA} AS khoa, d.MaKhachHang AS maKhachHang, d.TenKhach AS tenKhach,
      d.SoDienThoaiLienHe AS soDienThoai, d.NgayChoi AS ngayChoi, d.TongTien AS tongTien,
      d.TrangThai AS trangThai, d.Nguon AS nguon, d.TrangThaiThu AS trangThaiThu,
      MIN(CASE WHEN d.TrangThai IN ('confirmed','completed') THEN d.NgayChoi END)
        OVER (PARTITION BY ${KHOA}) AS ngayDauTien,
      ${trongKhoang} AS trongKhoang
    FROM DatSan d JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
    WHERE cs.MaChuSan = ? AND d.TrangThai IN ('confirmed','completed','cancelled')${locCoSo}`;
  return { sql, thamSo };
}

// Gộp theo khách: mỗi dòng = 1 khách có số liệu trong khoảng lọc.
function taoBangKhach(maChuSan, boLoc) {
  const bang = taoBangDon(maChuSan, boLoc);
  const sql = `SELECT t.khoa AS khoa, MAX(t.maKhachHang) AS maKhachHang, MAX(t.tenKhach) AS tenKhach,
      MAX(t.soDienThoai) AS soDienThoai, MIN(t.ngayDauTien) AS ngayDauTien,
      COALESCE(SUM(t.trongKhoang AND ${HOP_LE}), 0) AS soLuotDat,
      COALESCE(SUM(t.trongKhoang AND t.trangThai = 'cancelled'), 0) AS soLuotHuy,
      COALESCE(SUM(CASE WHEN t.trongKhoang AND ${HOP_LE} THEN t.tongTien END), 0) AS tongChiTieu,
      COALESCE(SUM(CASE WHEN t.trongKhoang AND ${HOP_LE} AND t.nguon = 'owner'
        AND t.trangThaiThu = 'unpaid' THEN t.tongTien END), 0) AS conNo,
      MAX(CASE WHEN t.trongKhoang AND ${HOP_LE} THEN t.ngayChoi END) AS lanDatGanNhat
    FROM (${bang.sql}) t GROUP BY t.khoa`;
  return { sql, thamSo: bang.thamSo };
}

// Điều kiện "khách mới" = lần đặt đầu tiên rơi vào khoảng lọc (không có khoảng lọc → mọi khách đều mới).
function dieuKienKhachMoi(boLoc, tenCot = 'k.ngayDauTien') {
  const dk = [];
  const thamSo = [];
  if (boLoc.tuNgay) { dk.push(`${tenCot} >= ?`); thamSo.push(boLoc.tuNgay); }
  if (boLoc.denNgay) { dk.push(`${tenCot} <= ?`); thamSo.push(boLoc.denNgay); }
  return { sql: dk.length ? `(${dk.join(' AND ')})` : '1=1', thamSo };
}

const lamTron = (so, soLe = 1) => Number(so.toFixed(soLe));
const tyLe = (tu, mau) => (mau > 0 ? lamTron((tu / mau) * 100) : 0);

async function layTongQuanKhach(maChuSan, boLoc = {}) {
  const khach = taoBangKhach(maChuSan, boLoc);
  const moi = dieuKienKhachMoi(boLoc);
  const [[tong]] = await pool.query(
    `SELECT COALESCE(SUM(k.soLuotDat > 0), 0) AS tongKhach,
       COALESCE(SUM(k.soLuotDat), 0) AS soLuotDat, COALESCE(SUM(k.soLuotHuy), 0) AS soLuotHuy,
       COALESCE(SUM(k.tongChiTieu), 0) AS tongChiTieu, COALESCE(SUM(k.conNo), 0) AS tongCongNo,
       COALESCE(SUM(k.soLuotDat > 0 AND ${moi.sql}), 0) AS khachMoi,
       COALESCE(SUM(k.soLuotDat >= 2), 0) AS khachDatLai
     FROM (${khach.sql}) k`,
    [...moi.thamSo, ...khach.thamSo]);

  const thamSoNguon = [maChuSan];
  let locNguon = '';
  if (boLoc.maCoSo) { locNguon += ' AND cs.MaCoSo = ?'; thamSoNguon.push(boLoc.maCoSo); }
  if (boLoc.tuNgay) { locNguon += ' AND d.NgayChoi >= ?'; thamSoNguon.push(boLoc.tuNgay); }
  if (boLoc.denNgay) { locNguon += ' AND d.NgayChoi <= ?'; thamSoNguon.push(boLoc.denNgay); }
  const [theoNguon] = await pool.query(
    `SELECT d.Nguon AS nguon, d.LoaiKhach AS loaiKhach, COUNT(DISTINCT ${KHOA}) AS soKhach,
       COUNT(*) AS soLuotDat, SUM(d.TongTien) AS tongChiTieu
     FROM DatSan d JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     WHERE cs.MaChuSan = ? AND d.TrangThai IN ('confirmed','completed')${locNguon}
     GROUP BY d.Nguon, d.LoaiKhach ORDER BY soLuotDat DESC`,
    thamSoNguon);

  const [khachMoiTheoThang] = await pool.query(
    `SELECT DATE_FORMAT(k.ngayDauTien, '%Y-%m') AS thang, COUNT(*) AS soKhachMoi
     FROM (${khach.sql}) k WHERE k.soLuotDat > 0 AND ${moi.sql}
     GROUP BY DATE_FORMAT(k.ngayDauTien, '%Y-%m') ORDER BY thang DESC LIMIT 24`,
    [...khach.thamSo, ...moi.thamSo]);

  const tongKhach = Number(tong.tongKhach);
  const soLuotDat = Number(tong.soLuotDat);
  const soLuotHuy = Number(tong.soLuotHuy);
  const khachMoi = Number(tong.khachMoi);
  const khachDatLai = Number(tong.khachDatLai);
  return {
    boLoc: {
      tuNgay: boLoc.tuNgay || null, denNgay: boLoc.denNgay || null, maCoSo: boLoc.maCoSo || null,
    },
    tongKhach,
    khachMoi,
    khachCu: tongKhach - khachMoi,
    khachDatLai,
    tyLeQuayLai: tyLe(khachDatLai, tongKhach),
    soLuotDat,
    soLuotHuy,
    tyLeHuy: tyLe(soLuotHuy, soLuotDat + soLuotHuy),
    tongChiTieu: Number(tong.tongChiTieu),
    chiTieuTrungBinhMoiKhach: tongKhach ? Math.round(Number(tong.tongChiTieu) / tongKhach) : 0,
    soLuotDatTrungBinhMoiKhach: tongKhach ? lamTron(soLuotDat / tongKhach, 2) : 0,
    tongCongNo: Number(tong.tongCongNo),
    theoNguon,
    khachMoiTheoThang,
  };
}

const SAP_XEP = {
  'luot-dat': 'k.soLuotDat DESC, k.tongChiTieu DESC, k.khoa',
  'chi-tieu': 'k.tongChiTieu DESC, k.soLuotDat DESC, k.khoa',
  'gan-nhat': 'k.lanDatGanNhat DESC, k.soLuotDat DESC, k.khoa',
  ten: 'k.tenKhach ASC, k.khoa',
};

async function lietKeKhach(maChuSan, boLoc = {}) {
  const khach = taoBangKhach(maChuSan, boLoc);
  const dieuKien = ['k.soLuotDat > 0'];
  const thamSo = [];
  if (boLoc.nhom === 'moi') {
    const moi = dieuKienKhachMoi(boLoc);
    dieuKien.push(moi.sql);
    thamSo.push(...moi.thamSo);
  } else if (boLoc.nhom === 'quay-lai') {
    dieuKien.push('k.soLuotDat >= 2');
  }
  if (boLoc.tuKhoa) {
    dieuKien.push('(k.tenKhach LIKE ? OR k.soDienThoai LIKE ?)');
    const mau = `%${boLoc.tuKhoa}%`;
    thamSo.push(mau, mau);
  }
  const loc = dieuKien.join(' AND ');
  const sapXep = SAP_XEP[boLoc.sapXep] ? boLoc.sapXep : 'luot-dat';
  const trang = boLoc.trang || 1;
  const soDong = boLoc.soDong || SO_DONG_MAC_DINH;
  // Các mệnh đề trong ${loc} đứng sau FROM (bảng khách) nên tham số bảng khách đi trước.
  const [[{ tong }]] = await pool.query(
    `SELECT COUNT(*) AS tong FROM (${khach.sql}) k WHERE ${loc}`, [...khach.thamSo, ...thamSo]);
  const [cacKhach] = await pool.query(
    `SELECT k.khoa AS khoa, k.maKhachHang AS maKhachHang, k.tenKhach AS tenKhach,
       k.soDienThoai AS soDienThoai, k.soLuotDat AS soLuotDat, k.soLuotHuy AS soLuotHuy,
       k.tongChiTieu AS tongChiTieu, k.conNo AS conNo, k.lanDatGanNhat AS lanDatGanNhat,
       k.ngayDauTien AS lanDauDat
     FROM (${khach.sql}) k WHERE ${loc}
     ORDER BY ${SAP_XEP[sapXep]} LIMIT ? OFFSET ?`,
    [...khach.thamSo, ...thamSo, soDong, (trang - 1) * soDong]);
  return {
    cacKhach: cacKhach.map((dong) => ({
      ...dong,
      soLuotDat: Number(dong.soLuotDat),
      soLuotHuy: Number(dong.soLuotHuy),
      tongChiTieu: Number(dong.tongChiTieu),
      conNo: Number(dong.conNo),
      khachQuayLai: Number(dong.soLuotDat) >= 2,
    })),
    trang, soDongMoiTrang: soDong, tong, sapXep,
  };
}

// Chi tiết 1 khách: tổng hợp + sân hay đặt + lịch sử đơn (mới nhất trước).
async function layChiTietKhach(maChuSan, boLoc = {}) {
  const dieuKien = ['cs.MaChuSan = ?'];
  const thamSo = [maChuSan];
  if (boLoc.maKhachHang) {
    dieuKien.push('d.MaKhachHang = ?');
    thamSo.push(boLoc.maKhachHang);
  } else if (boLoc.soDienThoai) {
    dieuKien.push('d.MaKhachHang IS NULL AND d.SoDienThoaiLienHe = ?');
    thamSo.push(boLoc.soDienThoai);
  } else {
    throw AppError.duLieuKhongHopLe('Cần truyền maKhachHang hoặc soDienThoai');
  }
  if (boLoc.maCoSo) { dieuKien.push('cs.MaCoSo = ?'); thamSo.push(boLoc.maCoSo); }
  if (boLoc.tuNgay) { dieuKien.push('d.NgayChoi >= ?'); thamSo.push(boLoc.tuNgay); }
  if (boLoc.denNgay) { dieuKien.push('d.NgayChoi <= ?'); thamSo.push(boLoc.denNgay); }
  const loc = dieuKien.join(' AND ');
  const tu = `FROM DatSan d JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo`;
  const hopLe = "d.TrangThai IN ('confirmed','completed')";

  const [[tongHop]] = await pool.query(
    `SELECT COUNT(*) AS soDon, COALESCE(SUM(${hopLe}), 0) AS soLuotDat,
       COALESCE(SUM(d.TrangThai = 'cancelled'), 0) AS soLuotHuy,
       COALESCE(SUM(CASE WHEN ${hopLe} THEN d.TongTien END), 0) AS tongChiTieu,
       COALESCE(SUM(CASE WHEN ${hopLe} AND d.Nguon = 'owner' AND d.TrangThaiThu = 'unpaid'
         THEN d.TongTien END), 0) AS conNo,
       COALESCE(SUM(CASE WHEN ${hopLe} THEN d.SoPhut END), 0) AS tongSoPhut,
       MIN(CASE WHEN ${hopLe} THEN d.NgayChoi END) AS lanDauDat,
       MAX(CASE WHEN ${hopLe} THEN d.NgayChoi END) AS lanDatGanNhat,
       MAX(d.TenKhach) AS tenKhach, MAX(d.SoDienThoaiLienHe) AS soDienThoai,
       MAX(d.MaKhachHang) AS maKhachHang
     ${tu} WHERE ${loc} AND d.TrangThai IN ('confirmed','completed','cancelled')`,
    thamSo);
  if (!Number(tongHop.soDon)) throw AppError.khongTimThay('Không tìm thấy khách hàng này tại cơ sở của bạn');

  const [sanHayDat] = await pool.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan, cs.TenCoSo AS tenCoSo,
       COUNT(*) AS soLuotDat, SUM(d.TongTien) AS tongChiTieu
     ${tu} WHERE ${loc} AND ${hopLe}
     GROUP BY s.MaSan, s.TenSan, cs.TenCoSo ORDER BY soLuotDat DESC, tongChiTieu DESC LIMIT 3`,
    thamSo);

  const trang = boLoc.trang || 1;
  const soDong = boLoc.soDong || SO_DONG_MAC_DINH;
  const [[{ tong }]] = await pool.query(`SELECT COUNT(*) AS tong ${tu} WHERE ${loc}`, thamSo);
  const [cacDon] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.Nguon AS nguon, d.LoaiKhach AS loaiKhach,
       d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       d.TongTien AS tongTien, d.TrangThai AS trangThai, d.TrangThaiThu AS trangThaiThu,
       s.TenSan AS tenSan, cs.TenCoSo AS tenCoSo
     ${tu} WHERE ${loc}
     ORDER BY d.NgayChoi DESC, d.GioBatDau DESC, d.MaDatSan DESC LIMIT ? OFFSET ?`,
    [...thamSo, soDong, (trang - 1) * soDong]);

  const soLuotDat = Number(tongHop.soLuotDat);
  const soLuotHuy = Number(tongHop.soLuotHuy);
  const tongChiTieu = Number(tongHop.tongChiTieu);
  return {
    khach: {
      maKhachHang: tongHop.maKhachHang || null,
      tenKhach: tongHop.tenKhach,
      soDienThoai: tongHop.soDienThoai,
      soLuotDat,
      soLuotHuy,
      tyLeHuy: tyLe(soLuotHuy, soLuotDat + soLuotHuy),
      tongChiTieu,
      chiTieuTrungBinhMoiLuot: soLuotDat ? Math.round(tongChiTieu / soLuotDat) : 0,
      tongSoGio: lamTron(Number(tongHop.tongSoPhut) / 60, 1),
      conNo: Number(tongHop.conNo),
      lanDauDat: tongHop.lanDauDat,
      lanDatGanNhat: tongHop.lanDatGanNhat,
      khachQuayLai: soLuotDat >= 2,
    },
    sanHayDat,
    cacDon,
    trang, soDongMoiTrang: soDong, tong,
  };
}

module.exports = { layTongQuanKhach, lietKeKhach, layChiTietKhach };
