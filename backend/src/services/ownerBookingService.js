// Chủ sân xem đơn đặt sân của khách tại cơ sở của mình (chỉ đọc).
// Luồng: khách đặt (customerService) → khách trả tiền (paymentService) → chủ sân xem ở đây.
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');

const SO_DONG_MAC_DINH = 20;

// Cột trả về cho 1 đơn (dùng chung cho danh sách và chi tiết).
const COT_DON = `
  d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaLichCoDinh AS maLichCoDinh,
  d.Nguon AS nguon, d.LoaiKhach AS loaiKhach,
  d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc, d.SoPhut AS soPhut,
  d.TongTien AS tongTien, d.PhiNenTang AS phiNenTang, d.TienChuSan AS tienChuSan,
  d.TrangThai AS trangThai, d.GhiChu AS ghiChu, d.NgayTao AS ngayTao,
  d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoaiLienHe,
  s.MaSan AS maSan, s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo`;

// Thanh toán của đơn: đơn cố định nhiều buổi dùng chung 1 thanh toán (của buổi đầu).
const NOI_THANH_TOAN = `
  LEFT JOIN ThanhToan t ON t.MaDatSan = CASE
    WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
    ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh = d.MaLichCoDinh)
  END`;

async function lietKeDon(maChuSan, boLoc) {
  const dieuKien = ['cs.MaChuSan = ?'];
  const thamSo = [maChuSan];

  // Đơn chưa thanh toán (đang giữ chỗ / hết hạn) vẫn hiện để chủ sân biết sân đang bị giữ.
  if (boLoc.trangThai) { dieuKien.push('d.TrangThai = ?'); thamSo.push(boLoc.trangThai); }
  if (boLoc.maCoSo) { dieuKien.push('cs.MaCoSo = ?'); thamSo.push(boLoc.maCoSo); }
  if (boLoc.maSan) { dieuKien.push('d.MaSan = ?'); thamSo.push(boLoc.maSan); }
  if (boLoc.ngay) {
    dieuKien.push('d.NgayChoi = ?'); thamSo.push(boLoc.ngay);
  } else {
    if (boLoc.tuNgay) { dieuKien.push('d.NgayChoi >= ?'); thamSo.push(boLoc.tuNgay); }
    if (boLoc.denNgay) { dieuKien.push('d.NgayChoi <= ?'); thamSo.push(boLoc.denNgay); }
  }
  if (boLoc.tuKhoa) {
    dieuKien.push('(d.MaDon LIKE ? OR d.TenKhach LIKE ? OR d.SoDienThoaiLienHe LIKE ?)');
    const mau = `%${boLoc.tuKhoa}%`;
    thamSo.push(mau, mau, mau);
  }
  const loc = dieuKien.join(' AND ');
  const tuHang = `FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
                  JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo ${NOI_THANH_TOAN}`;

  const [[{ tong }]] = await pool.query(`SELECT COUNT(*) AS tong ${tuHang} WHERE ${loc}`, thamSo);
  const trang = boLoc.trang || 1;
  const soDong = boLoc.soDong || SO_DONG_MAC_DINH;
  const [cacDon] = await pool.query(
    `SELECT ${COT_DON}, t.TrangThai AS trangThaiThanhToan
     ${tuHang} WHERE ${loc}
     ORDER BY d.NgayChoi DESC, d.GioBatDau DESC, d.MaDatSan DESC
     LIMIT ? OFFSET ?`,
    [...thamSo, soDong, (trang - 1) * soDong]);
  return { cacDon, trang, soDongMoiTrang: soDong, tong };
}

// Chi tiết 1 đơn = hoá đơn: tiền khách trả, phí nền tảng, tiền chủ sân nhận, trạng thái thanh toán.
async function layChiTietDon(maChuSan, maDatSan) {
  const [[don]] = await pool.query(
    `SELECT ${COT_DON},
       d.HetHanGiuCho AS hetHanGiuCho, d.NguoiHuy AS nguoiHuy, d.LyDoHuy AS lyDoHuy,
       d.NgayHuy AS ngayHuy, d.TrangThaiThu AS trangThaiThu,
       t.MaThanhToan AS maThanhToan, t.SoTien AS soTienThanhToan,
       t.TrangThai AS trangThaiThanhToan, t.NgayThanhToan AS ngayThanhToan,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan
     FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
       JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo ${NOI_THANH_TOAN}
     WHERE d.MaDatSan = ? AND cs.MaChuSan = ?`,
    [maDatSan, maChuSan]);
  if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');

  // Đơn thuộc lịch cố định: kèm các buổi còn lại để chủ sân thấy cả chuỗi.
  let cacBuoiCungLich = [];
  if (don.maLichCoDinh) {
    [cacBuoiCungLich] = await pool.query(
      `SELECT MaDatSan AS maDatSan, MaDon AS maDon, NgayChoi AS ngay, TrangThai AS trangThai,
         TongTien AS tongTien
       FROM DatSan WHERE MaLichCoDinh = ? ORDER BY NgayChoi`,
      [don.maLichCoDinh]);
  }
  return { ...don, cacBuoiCungLich };
}

module.exports = { lietKeDon, layChiTietDon };
