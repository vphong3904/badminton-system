const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { baoKhachDaHoanTien, guiThongBao } = require('./notificationService');
const { layMucConThieuHoSo } = require('../utils/hoSoChuSan');

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
       hs.TenNganHang AS tenNganHang, hs.SoTaiKhoan AS soTaiKhoan, hs.ChuTaiKhoan AS chuTaiKhoan,
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
    if (duLieu.trangThai === 'approved') {
      const mucConThieu = await layMucConThieuHoSo(ketNoi, maNguoiDung);
      if (mucConThieu.length) {
        throw AppError.duLieuKhongHopLe(`Hồ sơ chưa đủ thông tin để duyệt: ${mucConThieu.join(', ')}`);
      }
    }
    await ketNoi.query(
      `UPDATE HoSoChuSan SET TrangThaiDuyet=?, NgayDuyet=NOW(),
         MaQuanTriDuyet=?, LyDoTuChoi=? WHERE MaNguoiDung=?`,
      [
        duLieu.trangThai, maQuanTri,
        duLieu.trangThai === 'rejected' ? duLieu.lyDoTuChoi : null,
        maNguoiDung,
      ]);
    // Chỉ đổi cơ sở active/hidden; không đụng cơ sở đã đóng hoặc bị admin khoá.
    await ketNoi.query(
      duLieu.trangThai === 'approved'
        ? "UPDATE CoSo SET TrangThai='active' WHERE MaChuSan=? AND TrangThai='hidden'"
        : "UPDATE CoSo SET TrangThai='hidden' WHERE MaChuSan=? AND TrangThai='active'",
      [maNguoiDung]);
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
    await baoKhachDaHoanTien(ketNoi, maThanhToan, maGiaoDichHoan);
    return { maThanhToan, trangThaiHoanTien: 'refunded' };
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

// ---------------- Quản lý tài khoản khách / chủ sân ----------------
// Khóa tài khoản bắt buộc có lý do (hiện cho người dùng khi đăng nhập). Chủ sân bị khóa thì các cơ sở đang
// hoạt động chuyển sang `locked` kèm lý do mặc định dưới đây; mở khóa chỉ trả lại đúng những cơ sở đó.
const LY_DO_KHOA_CO_SO = 'Chủ sân bị khóa tài khoản';

const escapeLike = (chuoi) => chuoi.replace(/[\\%_]/g, (kyTu) => `\\${kyTu}`);

async function lietKeNguoiDung({ vaiTro, trangThai = 'all', tuKhoa, trang = 1, soLuong = 20 }) {
  const dieuKien = ['nd.VaiTro = ?'];
  const thamSo = [vaiTro];
  if (trangThai !== 'all') {
    dieuKien.push('nd.TrangThai = ?');
    thamSo.push(trangThai);
  }
  if (tuKhoa) {
    const mau = `%${escapeLike(tuKhoa)}%`;
    dieuKien.push('(nd.HoTen LIKE ? OR nd.Email LIKE ? OR nd.SoDienThoai LIKE ?)');
    thamSo.push(mau, mau, mau);
  }
  const loc = dieuKien.join(' AND ');
  const cotThem = vaiTro === 'owner'
    ? `, hs.TrangThaiDuyet AS trangThaiDuyet, hs.TenDoanhNghiep AS tenDoanhNghiep,
       COALESCE(hs.SoLanViPham, 0) AS soLanViPham,
       (SELECT COUNT(*) FROM CoSo cs WHERE cs.MaChuSan = nd.MaNguoiDung) AS soCoSo`
    : `, (SELECT COUNT(*) FROM DatSan d WHERE d.MaKhachHang = nd.MaNguoiDung) AS soDon`;
  const noiBang = vaiTro === 'owner' ? 'LEFT JOIN HoSoChuSan hs ON hs.MaNguoiDung = nd.MaNguoiDung' : '';

  const [[{ tong }]] = await pool.query(`SELECT COUNT(*) AS tong FROM NguoiDung nd WHERE ${loc}`, thamSo);
  const [cacTaiKhoan] = await pool.query(
    `SELECT nd.MaNguoiDung AS maNguoiDung, nd.HoTen AS hoTen, nd.Email AS email,
       nd.SoDienThoai AS soDienThoai, nd.TrangThai AS trangThai, nd.LyDoKhoa AS lyDoKhoa,
       nd.NgayTao AS ngayTao${cotThem}
     FROM NguoiDung nd ${noiBang}
     WHERE ${loc}
     ORDER BY nd.NgayTao DESC, nd.MaNguoiDung DESC LIMIT ? OFFSET ?`,
    [...thamSo, soLuong, (trang - 1) * soLuong]);
  const [[dem]] = await pool.query(
    `SELECT COUNT(*) AS tong, COALESCE(SUM(TrangThai = 'locked'), 0) AS biKhoa
     FROM NguoiDung WHERE VaiTro = ?`, [vaiTro]);
  return {
    cacTaiKhoan: cacTaiKhoan.map((muc) => ({
      ...muc,
      ...(vaiTro === 'owner'
        ? { soLanViPham: Number(muc.soLanViPham), soCoSo: Number(muc.soCoSo) }
        : { soDon: Number(muc.soDon) }),
    })),
    tong: Number(tong),
    trang,
    soDongMoiTrang: soLuong,
    tongTheoVaiTro: Number(dem.tong),
    soBiKhoaTheoVaiTro: Number(dem.biKhoa),
  };
}

async function khoaTaiKhoan(maQuanTri, maNguoiDung, { lyDo }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[taiKhoan]] = await ketNoi.query(
      `SELECT MaNguoiDung AS maNguoiDung, VaiTro AS vaiTro, HoTen AS hoTen, TrangThai AS trangThai
       FROM NguoiDung WHERE MaNguoiDung = ? FOR UPDATE`, [maNguoiDung]);
    if (!taiKhoan) throw AppError.khongTimThay('Không tìm thấy tài khoản');
    if (taiKhoan.vaiTro === 'admin') {
      throw AppError.duLieuKhongHopLe('Chỉ khóa được tài khoản khách hàng hoặc chủ sân');
    }
    if (taiKhoan.trangThai === 'locked') {
      throw AppError.biTrung('Tài khoản này đã bị khóa rồi.', 'ACCOUNT_ALREADY_LOCKED');
    }
    await ketNoi.query(
      "UPDATE NguoiDung SET TrangThai='locked', LyDoKhoa=? WHERE MaNguoiDung=?", [lyDo, maNguoiDung]);
    let soCoSoBiKhoa = 0;
    if (taiKhoan.vaiTro === 'owner') {
      const [ketQua] = await ketNoi.query(
        "UPDATE CoSo SET TrangThai='locked', LyDoKhoa=? WHERE MaChuSan=? AND TrangThai='active'",
        [LY_DO_KHOA_CO_SO, maNguoiDung]);
      soCoSoBiKhoa = ketQua.affectedRows;
    }
    await ghiNhatKy(ketNoi, maQuanTri, 'khoa_tai_khoan', 'NguoiDung', maNguoiDung,
      `Khóa ${taiKhoan.vaiTro === 'owner' ? 'chủ sân' : 'khách hàng'} ${taiKhoan.hoTen}: ${lyDo}`);
    return { maNguoiDung: Number(maNguoiDung), trangThai: 'locked', lyDoKhoa: lyDo, soCoSoBiKhoa };
  });
}

async function moKhoaTaiKhoan(maQuanTri, maNguoiDung) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[taiKhoan]] = await ketNoi.query(
      `SELECT MaNguoiDung AS maNguoiDung, VaiTro AS vaiTro, HoTen AS hoTen, TrangThai AS trangThai
       FROM NguoiDung WHERE MaNguoiDung = ? FOR UPDATE`, [maNguoiDung]);
    if (!taiKhoan) throw AppError.khongTimThay('Không tìm thấy tài khoản');
    if (taiKhoan.vaiTro === 'admin') {
      throw AppError.duLieuKhongHopLe('Chỉ mở khóa được tài khoản khách hàng hoặc chủ sân');
    }
    if (taiKhoan.trangThai !== 'locked') {
      throw AppError.biTrung('Tài khoản này đang hoạt động.', 'ACCOUNT_NOT_LOCKED');
    }
    await ketNoi.query(
      "UPDATE NguoiDung SET TrangThai='active', LyDoKhoa=NULL WHERE MaNguoiDung=?", [maNguoiDung]);
    let soCoSoMoLai = 0;
    if (taiKhoan.vaiTro === 'owner') {
      const [ketQua] = await ketNoi.query(
        "UPDATE CoSo SET TrangThai='active', LyDoKhoa=NULL WHERE MaChuSan=? AND TrangThai='locked' AND LyDoKhoa=?",
        [maNguoiDung, LY_DO_KHOA_CO_SO]);
      soCoSoMoLai = ketQua.affectedRows;
    }
    await ghiNhatKy(ketNoi, maQuanTri, 'mo_khoa_tai_khoan', 'NguoiDung', maNguoiDung,
      `Mở khóa ${taiKhoan.vaiTro === 'owner' ? 'chủ sân' : 'khách hàng'} ${taiKhoan.hoTen}`);
    await guiThongBao(ketNoi, {
      maNguoiDung,
      loai: 'system',
      tieuDe: 'Tài khoản đã được mở khóa',
      noiDung: 'Quản trị viên đã mở khóa tài khoản của bạn. Bạn có thể sử dụng hệ thống bình thường.',
    });
    return { maNguoiDung: Number(maNguoiDung), trangThai: 'active', soCoSoMoLai };
  });
}

// Danh sách cơ sở kèm số đánh giá hiển thị / đã xóa, để admin chọn cơ sở cần quản lý đánh giá.
async function lietKeCoSo({ tuKhoa } = {}) {
  const thamSo = [];
  let loc = '';
  if (tuKhoa) {
    const mau = `%${escapeLike(tuKhoa)}%`;
    loc = 'WHERE (cs.TenCoSo LIKE ? OR cu.HoTen LIKE ?)';
    thamSo.push(mau, mau);
  }
  const [cacCoSo] = await pool.query(
    `SELECT cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.TrangThai AS trangThai,
       cu.MaNguoiDung AS maChuSan, cu.HoTen AS tenChuSan,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia,
       (SELECT COUNT(*) FROM DanhGia dg WHERE dg.MaCoSo = cs.MaCoSo AND dg.BiAn = 1) AS soDanhGiaDaXoa
     FROM CoSo cs JOIN NguoiDung cu ON cu.MaNguoiDung = cs.MaChuSan
     ${loc}
     ORDER BY cs.TenCoSo ASC LIMIT 200`,
    thamSo);
  return cacCoSo.map((muc) => ({
    ...muc,
    diemTrungBinh: Number(muc.diemTrungBinh),
    soDanhGia: Number(muc.soDanhGia),
    soDanhGiaDaXoa: Number(muc.soDanhGiaDaXoa),
  }));
}

module.exports = {
  lietKeThanhToanChoXacNhan,
  lietKeHoSoChoDuyet,
  duyetHoSo,
  lietKeHoanTien,
  xuLyHoanTien,
  hoanTatHoanTien,
  lietKeNhatKy,
  lietKeNguoiDung,
  khoaTaiKhoan,
  moKhoaTaiKhoan,
  lietKeCoSo,
};
