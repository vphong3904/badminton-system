// Chủ sân xem đơn đặt sân của khách tại cơ sở của mình (chỉ đọc).
// Luồng: khách đặt (customerService) → khách trả tiền (paymentService) → chủ sân xem ở đây.
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { doiGioRaPhut } = require('../utils/time');
const khach = require('./customerService');

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
  if (boLoc.trangThaiThanhToan) { dieuKien.push('t.TrangThai = ?'); thamSo.push(boLoc.trangThaiThanhToan); }
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
  // Mặc định mới nhất trước (cũ nhất ở cuối); sapXep=cu-nhat đảo ngược. Giá trị đã được zod giới hạn.
  const sapXep = boLoc.sapXep === 'cu-nhat' ? 'cu-nhat' : 'moi-nhat';
  const huong = sapXep === 'cu-nhat' ? 'ASC' : 'DESC';
  const [cacDon] = await pool.query(
    `SELECT ${COT_DON}, t.TrangThai AS trangThaiThanhToan,
       t.AnhChuyenKhoan AS anhChuyenKhoanUrl, t.NgayGuiAnh AS ngayGuiAnh
     ${tuHang} WHERE ${loc}
     ORDER BY d.NgayChoi ${huong}, d.GioBatDau ${huong}, d.MaDatSan ${huong}
     LIMIT ? OFFSET ?`,
    [...thamSo, soDong, (trang - 1) * soDong]);
  return { cacDon, trang, soDongMoiTrang: soDong, tong, sapXep };
}

// Chi tiết 1 đơn = hoá đơn: tiền khách trả, phí nền tảng, tiền chủ sân nhận, trạng thái thanh toán.
async function layChiTietDon(maChuSan, maDatSan) {
  const [[don]] = await pool.query(
    `SELECT ${COT_DON},
       d.HetHanGiuCho AS hetHanGiuCho, d.NguoiHuy AS nguoiHuy, d.LyDoHuy AS lyDoHuy,
       d.NgayHuy AS ngayHuy, d.TrangThaiThu AS trangThaiThu,
       t.MaThanhToan AS maThanhToan, t.SoTien AS soTienThanhToan,
       t.TrangThai AS trangThaiThanhToan, t.NgayThanhToan AS ngayThanhToan,
       t.AnhChuyenKhoan AS anhChuyenKhoanUrl, t.NgayGuiAnh AS ngayGuiAnh,
       t.LyDoLoi AS lyDoTuChoiThanhToan, t.VaiTroXacNhan AS vaiTroXacNhan,
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

// ----- Hoàn tiền cho khách huỷ đơn đã trả (chủ sân tự chuyển khoản rồi bấm hoàn thành) -----
// Hàng đợi = ThanhToan success có TrangThaiHoanTien 'processing' (chờ hoàn) / 'refunded' (đã hoàn)
// của cơ sở thuộc chủ sân. Hoàn tiền do trả muộn (late_payment) vẫn do admin xử lý.
async function lietKeHoanTien(maChuSan, trangThai = 'processing') {
  const [cacYeuCau] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaDon AS maDon,
       d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoai,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, s.TenSan AS tenSan,
       d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       d.NgayHuy AS ngayHuy, t.SoTien AS soTienDaTra, t.SoTienHoan AS soTienHoan,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.MaGiaoDichHoan AS maGiaoDichHoan,
       t.NgayHoan AS ngayHoan, t.TenNganHangHoan AS tenNganHang, t.MaNganHangHoan AS maNganHang,
       t.SoTaiKhoanHoan AS soTaiKhoan, t.ChuTaiKhoanHoan AS chuTaiKhoan
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan = t.MaDatSan
       JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     WHERE cs.MaChuSan = ? AND t.TrangThai = 'success' AND t.TrangThaiHoanTien = ?
     ORDER BY COALESCE(t.NgayHoan, d.NgayHuy) DESC, t.MaThanhToan DESC`,
    [maChuSan, trangThai]);
  return cacYeuCau;
}

async function hoanThanhHoanTien(maChuSan, maThanhToan, maGiaoDichHoan) {
  const [ketQua] = await pool.query(
    `UPDATE ThanhToan t JOIN DatSan d ON d.MaDatSan = t.MaDatSan
       JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     SET t.TrangThaiHoanTien = 'refunded', t.MaGiaoDichHoan = ?, t.NgayHoan = NOW()
     WHERE t.MaThanhToan = ? AND cs.MaChuSan = ? AND t.TrangThai = 'success'
       AND t.TrangThaiHoanTien = 'processing'`,
    [maGiaoDichHoan || null, maThanhToan, maChuSan]);
  if (!ketQua.affectedRows) {
    // Phân biệt "không phải của chủ sân" với "đã hoàn / không ở trạng thái chờ hoàn".
    const [[dong]] = await pool.query(
      `SELECT t.TrangThaiHoanTien AS trangThaiHoanTien
       FROM ThanhToan t JOIN DatSan d ON d.MaDatSan = t.MaDatSan
         JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
       WHERE t.MaThanhToan = ? AND cs.MaChuSan = ?`,
      [maThanhToan, maChuSan]);
    if (!dong) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
    throw AppError.biTrung('Yêu cầu hoàn tiền không ở trạng thái chờ hoàn');
  }
  return { maThanhToan: Number(maThanhToan), trangThaiHoanTien: 'refunded' };
}

// Chủ sân tạo đơn cho khách đặt tại chỗ (1 ngày) hoặc khách cố định (nhiều ngày liên tiếp, có `ngayKetThuc`).
// Khác đơn của khách: không giữ chỗ/QR, xác nhận ngay (`confirmed`), không thu hoa hồng
// (PhiNenTang=0), theo dõi công nợ bằng TrangThaiThu (`daThu` = khách đã trả tiền mặt/chuyển khoản).
// Cùng quy tắc kiểm tra giờ/giá/trùng lịch/khoá sân với đơn của khách, trong 1 giao dịch.
async function taoDon(maChuSan, duLieu) {
  const ngayKetThuc = duLieu.ngayKetThuc || duLieu.ngay;
  const coDinh = ngayKetThuc !== duLieu.ngay;
  const loaiKhach = coDinh ? 'fixed' : 'walk_in';
  const cacNgay = khach.taoDanhSachNgay(duLieu.ngay, ngayKetThuc);
  const soPhut = doiGioRaPhut(duLieu.gioKetThuc) - doiGioRaPhut(duLieu.gioBatDau);

  return thucHienGiaoDich(async (ketNoi) => {
    const san = await khach.layThongTinSan(duLieu.maSan, ketNoi, true);
    if (san.maChuSan !== maChuSan) throw AppError.khongTimThay('Không tìm thấy sân đang hoạt động');

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='expired'
       WHERE MaSan=? AND NgayChoi IN (${cacNgay.map(() => '?').join(',')})
         AND TrangThai='pending_payment' AND HetHanGiuCho<=NOW()`,
      [san.maSan, ...cacNgay]);
    const cacGia = [];
    for (const ngay of cacNgay) {
      if (!await khach.kiemTraKhungDat(san, ngay, duLieu.gioBatDau, duLieu.gioKetThuc, ketNoi)) {
        throw AppError.biTrung(`Sân đã có lịch hoặc bị khóa vào ngày ${ngay}`);
      }
      cacGia.push(await khach.tinhTongTien(
        san.maCoSo, ngay, duLieu.gioBatDau, duLieu.gioKetThuc, loaiKhach, ketNoi));
    }

    let maLichCoDinh = null;
    if (coDinh) {
      const [lich] = await ketNoi.query(
        `INSERT INTO LichCoDinh
         (MaSan, MaKhachHang, TenKhach, SoDienThoai, CacThu, NgayBatDau, NgayKetThuc,
          GioBatDau, GioKetThuc, SoPhut, DonGiaMoiBuoi, GhiChu, MaNguoiTao)
         VALUES (?,NULL,?,?, 'T2,T3,T4,T5,T6,T7,CN', ?,?,?,?,?,?,?,?)`,
        [san.maSan, duLieu.tenKhach, duLieu.soDienThoai, duLieu.ngay, ngayKetThuc,
          duLieu.gioBatDau, duLieu.gioKetThuc, soPhut, cacGia[0], duLieu.ghiChu || null, maChuSan]);
      maLichCoDinh = lich.insertId;
    }

    const daThu = duLieu.daThu === true;
    const cacDon = [];
    for (let viTri = 0; viTri < cacNgay.length; viTri += 1) {
      const maDon = khach.taoMaDon();
      const [don] = await ketNoi.query(
        `INSERT INTO DatSan
         (MaDon, MaKhachHang, TenKhach, SoDienThoaiLienHe, GhiChu, Nguon, LoaiKhach,
          MaLichCoDinh, MaSan, NgayChoi, GioBatDau, GioKetThuc, SoPhut, TongTien,
          PhiNenTang, TienChuSan, TrangThaiThu, NgayThu, TrangThai)
         VALUES (?,NULL,?,?,?,'owner',?,?,?,?,?,?,?,?,0,?,?,${daThu ? 'NOW()' : 'NULL'},'confirmed')`,
        [maDon, duLieu.tenKhach, duLieu.soDienThoai, duLieu.ghiChu || null, loaiKhach, maLichCoDinh,
          san.maSan, cacNgay[viTri], duLieu.gioBatDau, duLieu.gioKetThuc, soPhut,
          cacGia[viTri], cacGia[viTri], daThu ? 'paid' : 'unpaid']);
      cacDon.push({ maDatSan: don.insertId, maDon, ngay: cacNgay[viTri], tongTien: cacGia[viTri] });
    }
    return {
      maLichCoDinh,
      loaiKhach,
      soNgay: cacNgay.length,
      tongTien: cacGia.reduce((tong, gia) => tong + gia, 0),
      trangThai: 'confirmed',
      trangThaiThu: daThu ? 'paid' : 'unpaid',
      cacDon,
    };
  });
}

module.exports = {
  taoDon, lietKeDon, layChiTietDon, lietKeHoanTien, hoanThanhHoanTien };
