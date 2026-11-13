const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');

async function ghiNhatKy(ketNoi, maQuanTri, hanhDong, doiTuong, maDoiTuong, chiTiet) {
  await ketNoi.query(
    `INSERT INTO NhatKyHeThong (MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet)
     VALUES (?,?,?,?,?)`,
    [maQuanTri, hanhDong, doiTuong, maDoiTuong, chiTiet || null]);
}

async function lietKeHoSoChoDuyet() {
  const [hoSo] = await pool.query(
    `SELECT hs.MaNguoiDung AS maNguoiDung, nd.HoTen AS hoTen,
       nd.Email AS email, nd.SoDienThoai AS soDienThoai,
       hs.TenDoanhNghiep AS tenDoanhNghiep, hs.NgayGuiDuyet AS ngayGuiDuyet,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi,
       cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen
     FROM HoSoChuSan hs JOIN NguoiDung nd ON nd.MaNguoiDung=hs.MaNguoiDung
     LEFT JOIN CoSo cs ON cs.MaChuSan=hs.MaNguoiDung
     WHERE hs.TrangThaiDuyet='pending' ORDER BY hs.NgayGuiDuyet`);
  return hoSo;
}

async function duyetHoSo(maQuanTri, maNguoiDung, duLieu) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[hoSo]] = await ketNoi.query(
      'SELECT TrangThaiDuyet AS trangThaiDuyet FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE',
      [maNguoiDung]);
    if (!hoSo || hoSo.trangThaiDuyet !== 'pending') {
      throw AppError.biTrung('Hồ sơ không còn ở trạng thái chờ duyệt');
    }
    await ketNoi.query(
      `UPDATE HoSoChuSan SET TrangThaiDuyet=?, NgayDuyet=NOW(),
         MaQuanTriDuyet=?, LyDoTuChoi=? WHERE MaNguoiDung=?`,
      [
        duLieu.trangThai, maQuanTri,
        duLieu.trangThai === 'rejected' ? duLieu.lyDoTuChoi : null,
        maNguoiDung,
      ]);
    await ketNoi.query(
      'UPDATE CoSo SET TrangThai=? WHERE MaChuSan=?',
      [duLieu.trangThai === 'approved' ? 'active' : 'hidden', maNguoiDung]);
    await ghiNhatKy(
      ketNoi, maQuanTri, duLieu.trangThai === 'approved' ? 'duyet_chu_san' : 'tu_choi_chu_san',
      'HoSoChuSan', maNguoiDung, duLieu.lyDoTuChoi);
    return { maNguoiDung, trangThaiDuyet: duLieu.trangThai };
  });
}

// Đơn khách đã gửi ảnh chuyển khoản, đang đợi xác nhận (admin xem mọi cơ sở; có đường dẫn ảnh).
async function lietKeThanhToanChoXacNhan() {
  const [cacDon] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.TenKhach AS tenKhach,
       d.SoDienThoaiLienHe AS soDienThoaiLienHe, d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau,
       d.GioKetThuc AS gioKetThuc, d.HetHanGiuCho AS hetHanGiuCho,
       t.MaThanhToan AS maThanhToan, t.SoTien AS soTien, t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.AnhChuyenKhoan AS anhChuyenKhoanUrl, t.NgayGuiAnh AS ngayGuiAnh,
       s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo,
       nd.HoTen AS tenChuSan, nd.SoDienThoai AS soDienThoaiChuSan
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       JOIN NguoiDung nd ON nd.MaNguoiDung=cs.MaChuSan
     WHERE t.TrangThai='confirming' AND d.TrangThai='pending_payment'
     ORDER BY t.NgayGuiAnh`);
  return cacDon;
}

async function lietKeHoanTien() {
  const [cacThanhToan] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan, t.MaDatSan AS maDatSan, d.MaDon AS maDon,
       d.MaKhachHang AS maKhachHang, d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoai,
       t.SoTien AS soTien, t.SoTienHoan AS soTienHoan, t.TrangThai AS trangThai,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.LyDoLoi AS lyDo,
       t.TenNganHangHoan AS tenNganHang, t.MaNganHangHoan AS maNganHang,
       t.SoTaiKhoanHoan AS soTaiKhoan, t.ChuTaiKhoanHoan AS chuTaiKhoan,
       t.NgayCapNhat AS ngayCapNhat
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
     WHERE (t.TrangThai='late_payment' AND t.TrangThaiHoanTien IN ('none','waiting_info'))
        OR t.TrangThaiHoanTien='waiting_info'
        OR (t.TrangThaiHoanTien='processing' AND t.TrangThai<>'success')
     ORDER BY t.NgayCapNhat`);
  return cacThanhToan;
}

async function xuLyHoanTien(maQuanTri, maThanhToan) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[thanhToan]] = await ketNoi.query(
      `SELECT TrangThaiHoanTien AS trangThaiHoanTien, SoTienHoan AS soTienHoan,
         TenNganHangHoan AS tenNganHang, MaNganHangHoan AS maNganHang,
         SoTaiKhoanHoan AS soTaiKhoan, ChuTaiKhoanHoan AS chuTaiKhoan
       FROM ThanhToan WHERE MaThanhToan=? FOR UPDATE`,
      [maThanhToan]);
    if (!thanhToan) throw AppError.khongTimThay('Không tìm thấy thanh toán');
    if (thanhToan.trangThaiHoanTien === 'none') {
      await ketNoi.query(
        `UPDATE ThanhToan SET SoTienHoan=SoTien, TrangThaiHoanTien='waiting_info',
           MaQuanTriDuyetHoan=? WHERE MaThanhToan=?`,
        [maQuanTri, maThanhToan]);
      await ghiNhatKy(ketNoi, maQuanTri, 'cho_khach_cap_nhat_tai_khoan_hoan', 'ThanhToan', maThanhToan);
      return { maThanhToan, trangThaiHoanTien: 'waiting_info', canCapNhatTaiKhoanHoan: true };
    }
    if (thanhToan.trangThaiHoanTien !== 'waiting_info'
      || !thanhToan.tenNganHang || !thanhToan.maNganHang
      || !thanhToan.soTaiKhoan || !thanhToan.chuTaiKhoan
      || Number(thanhToan.soTienHoan) <= 0) {
      throw AppError.duLieuKhongHopLe('Yêu cầu chưa có đủ thông tin hoàn tiền');
    }
    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThaiHoanTien='processing', MaQuanTriDuyetHoan=?
       WHERE MaThanhToan=?`,
      [maQuanTri, maThanhToan]);
    await ghiNhatKy(ketNoi, maQuanTri, 'xu_ly_hoan_tien', 'ThanhToan', maThanhToan);
    return { maThanhToan, trangThaiHoanTien: 'processing', soTienHoan: Number(thanhToan.soTienHoan) };
  });
}

async function hoanTatHoanTien(maQuanTri, maThanhToan, maGiaoDichHoan) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [ketQua] = await ketNoi.query(
      `UPDATE ThanhToan SET TrangThaiHoanTien='refunded', MaGiaoDichHoan=?, NgayHoan=NOW()
       WHERE MaThanhToan=? AND TrangThaiHoanTien='processing'`,
      [maGiaoDichHoan, maThanhToan]);
    if (!ketQua.affectedRows) throw AppError.biTrung('Thanh toán không ở trạng thái chờ hoàn tất hoàn tiền');
    await ghiNhatKy(ketNoi, maQuanTri, 'hoan_tat_hoan_tien', 'ThanhToan', maThanhToan, maGiaoDichHoan);
    return { maThanhToan, trangThaiHoanTien: 'refunded' };
  });
}

async function lietKeRutTien() {
  const [cacYeuCau] = await pool.query(
    `SELECT r.MaYeuCau AS maYeuCau, r.MaChuSan AS maChuSan,
       nd.HoTen AS tenChuSan, nd.SoDienThoai AS soDienThoai,
       r.SoTien AS soTien, r.TenNganHang AS tenNganHang, r.MaNganHang AS maNganHang,
       r.SoTaiKhoan AS soTaiKhoan, r.ChuTaiKhoan AS chuTaiKhoan, r.NgayYeuCau AS ngayYeuCau
     FROM YeuCauRutTien r JOIN NguoiDung nd ON nd.MaNguoiDung=r.MaChuSan
     WHERE r.TrangThai='pending' ORDER BY r.NgayYeuCau`);
  return cacYeuCau;
}

async function xacNhanChiRutTien(maQuanTri, maYeuCau, maGiaoDich) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [ketQua] = await ketNoi.query(
      `UPDATE YeuCauRutTien SET TrangThai='paid', MaQuanTriXuLy=?, NgayXuLy=NOW(), MaGiaoDich=?
       WHERE MaYeuCau=? AND TrangThai='pending'`,
      [maQuanTri, maGiaoDich, maYeuCau]);
    if (!ketQua.affectedRows) throw AppError.biTrung('Yêu cầu rút tiền không còn chờ xử lý');
    await ghiNhatKy(ketNoi, maQuanTri, 'xac_nhan_chi_tien', 'YeuCauRutTien', maYeuCau, maGiaoDich);
    return { maYeuCau, trangThai: 'paid' };
  });
}

async function tuChoiRutTien(maQuanTri, maYeuCau, lyDoTuChoi) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [ketQua] = await ketNoi.query(
      `UPDATE YeuCauRutTien SET TrangThai='rejected', MaQuanTriXuLy=?, NgayXuLy=NOW(),
         LyDoTuChoi=? WHERE MaYeuCau=? AND TrangThai='pending'`,
      [maQuanTri, lyDoTuChoi, maYeuCau]);
    if (!ketQua.affectedRows) throw AppError.biTrung('Yêu cầu rút tiền không còn chờ xử lý');
    await ketNoi.query('UPDATE DatSan SET MaYeuCauRutTien=NULL WHERE MaYeuCauRutTien=?', [maYeuCau]);
    await ghiNhatKy(ketNoi, maQuanTri, 'tu_choi_rut_tien', 'YeuCauRutTien', maYeuCau, lyDoTuChoi);
    return { maYeuCau, trangThai: 'rejected' };
  });
}

async function lietKeNhatKy(boLoc) {
  const thamSo = [];
  let locNgay = '';
  if (boLoc.tuNgay) {
    locNgay += ' AND nk.NgayTao>=?';
    thamSo.push(`${boLoc.tuNgay} 00:00:00`);
  }
  if (boLoc.denNgay) {
    locNgay += ' AND nk.NgayTao<?';
    const ngaySau = new Date(`${boLoc.denNgay}T00:00:00Z`);
    ngaySau.setUTCDate(ngaySau.getUTCDate() + 1);
    thamSo.push(`${ngaySau.toISOString().slice(0, 10)} 00:00:00`);
  }
  const [nhatKy] = await pool.query(
    `SELECT nk.MaNhatKy AS maNhatKy, nk.MaNguoiThucHien AS maNguoiThucHien,
       nd.HoTen AS tenNguoiThucHien, nk.HanhDong AS hanhDong,
       nk.DoiTuong AS doiTuong, nk.MaDoiTuong AS maDoiTuong,
       nk.ChiTiet AS chiTiet, nk.NgayTao AS ngayTao
     FROM NhatKyHeThong nk LEFT JOIN NguoiDung nd ON nd.MaNguoiDung=nk.MaNguoiThucHien
     WHERE 1=1${locNgay} ORDER BY nk.NgayTao DESC LIMIT ?`,
    [...thamSo, boLoc.gioiHan]);
  return nhatKy;
}

module.exports = {
  lietKeThanhToanChoXacNhan,
  lietKeHoSoChoDuyet,
  duyetHoSo,
  lietKeHoanTien,
  xuLyHoanTien,
  hoanTatHoanTien,
  lietKeRutTien,
  xacNhanChiRutTien,
  tuChoiRutTien,
  lietKeNhatKy,
};
