const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { guiThongBao } = require('./notificationService');
const hoanTienService = require('./hoanTienService');
const fs = require('fs/promises');
const { layMucConThieuHoSo } = require('../utils/hoSoChuSan');
const nhatKy = require('./nhatKyService');
const chungTu = require('./chungTuService');
const suKienAdmin = require('./suKienAdminService');
const { ngatKetNoiNguoiDung } = require('../realtime/phat');

const ghiNhatKy = (ketNoi, maQuanTri, hanhDong, doiTuong, maDoiTuong, chiTiet) =>
  nhatKy.ghiNhatKy(ketNoi, { maNguoiThucHien: maQuanTri, hanhDong, doiTuong, maDoiTuong, chiTiet });

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

// Đơn khách đã gửi ảnh chuyển khoản, đang đợi xác nhận (admin xem mọi cơ sở). G2.6: kèm hạn xác nhận, cờ quá hạn,
// toàn bộ chứng từ (nhiều ảnh) và cảnh báo "ảnh đã dùng ở đơn khác". Quá hạn KHÔNG tự nhả slot → Admin xử lý tay.
// boLoc.quaHan: true = chỉ đơn đã quá HanXacNhan; false = chỉ đơn còn trong hạn; bỏ trống = tất cả (quá hạn lên đầu).
async function lietKeThanhToanChoXacNhan(boLoc = {}) {
  const dieuKien = ["t.TrangThai='confirming'", "d.TrangThai='pending_payment'"];
  if (boLoc.quaHan === true) dieuKien.push('t.HanXacNhan IS NOT NULL AND t.HanXacNhan<NOW()');
  if (boLoc.quaHan === false) dieuKien.push('(t.HanXacNhan IS NULL OR t.HanXacNhan>=NOW())');
  const [cacDon] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaNhomDat AS maNhomDat, d.MaDon AS maDon, d.TenKhach AS tenKhach,
       d.SoDienThoaiLienHe AS soDienThoaiLienHe, d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau,
       d.GioKetThuc AS gioKetThuc, d.HetHanGiuCho AS hetHanGiuCho,
       (SELECT COUNT(*) FROM DatSan x WHERE COALESCE(x.MaNhomDat, x.MaDatSan)=COALESCE(d.MaNhomDat, d.MaDatSan)
          AND x.MaLichCoDinh IS NULL) AS soDonCon,
       t.MaThanhToan AS maThanhToan, t.SoTien AS soTien, t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.AnhChuyenKhoan AS anhChuyenKhoanUrl, t.NgayGuiAnh AS ngayGuiAnh, t.HanXacNhan AS hanXacNhan,
       TIMESTAMPDIFF(SECOND, NOW(), t.HanXacNhan) AS conLaiXacNhanGiay,
       (t.HanXacNhan IS NOT NULL AND t.HanXacNhan<NOW()) AS quaHan,
       s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo,
       nd.HoTen AS tenChuSan, nd.SoDienThoai AS soDienThoaiChuSan
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       JOIN NguoiDung nd ON nd.MaNguoiDung=cs.MaChuSan
     WHERE ${dieuKien.join(' AND ')}
     ORDER BY quaHan DESC, t.HanXacNhan IS NULL, t.HanXacNhan, t.NgayGuiAnh`);
  const ketQua = [];
  for (const don of cacDon) {
    const cacChungTu = await chungTu.layChungTu(pool, don.maThanhToan, { goc: 'admin' });
    ketQua.push({
      ...don,
      quaHan: !!Number(don.quaHan),
      soDonCon: Number(don.soDonCon) || 1,
      conLaiXacNhanGiay: don.conLaiXacNhanGiay === null ? null : Number(don.conLaiXacNhanGiay),
      chungTu: cacChungTu,
      canhBaoTrungAnh: chungTu.gomCanhBaoTrungAnh(cacChungTu),
    });
  }
  return ketQua;
}

// Việc của Admin (G4): (1) khoản quá hạn xác nhận `late_proof` — chờ khách nhập TK rồi Admin duyệt / đánh dấu đã hoàn;
// (2) khoản chủ sân bỏ quá hạn đã `escalated`. Admin KHÔNG đánh dấu "đã hoàn" nếu không có ảnh chứng từ.
async function lietKeHoanTien() {
  const [cacThanhToan] = await pool.query(
    `SELECT h.MaHoanTien AS maHoanTien, t.MaThanhToan AS maThanhToan, t.MaDatSan AS maDatSan, d.MaDon AS maDon,
       d.MaKhachHang AS maKhachHang, d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoai,
       t.SoTien AS soTien, h.SoTien AS soTienHoan, t.TrangThai AS trangThai, h.Loai AS loai,
       h.TrangThai AS trangThaiHoanTien, h.LyDo AS lyDo, h.HanHoan AS hanHoan, h.AnhChungTu AS anhChungTuUrl,
       h.TenNganHang AS tenNganHang, h.MaNganHang AS maNganHang,
       h.SoTaiKhoan AS soTaiKhoan, h.ChuTaiKhoan AS chuTaiKhoan,
       h.NgayCapNhat AS ngayCapNhat
     FROM HoanTien h JOIN ThanhToan t ON t.MaThanhToan=h.MaThanhToan JOIN DatSan d ON d.MaDatSan=h.MaDatSan
     WHERE (h.Loai='late_proof' AND h.TrangThai IN ('waiting_info','processing','not_received','escalated'))
        OR h.TrangThai='escalated'
     ORDER BY h.NgayCapNhat`);
  return cacThanhToan;
}

async function xuLyHoanTien(maQuanTri, maThanhToan) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[thanhToan]] = await ketNoi.query(
      `SELECT TrangThai AS trangThai, TrangThaiHoanTien AS trangThaiHoanTien, SoTien AS soTien
       FROM ThanhToan WHERE MaThanhToan=? FOR UPDATE`, [maThanhToan]);
    if (!thanhToan) throw AppError.khongTimThay('Không tìm thấy thanh toán');
    let yeuCau = await hoanTienService.layYeuCauDangMo(ketNoi, maThanhToan, true);
    if (!yeuCau) {
      // Thanh toán quá hạn (late_payment) chưa có khoản hoàn → mở khoản hoàn, chờ khách nhập tài khoản.
      if (thanhToan.trangThai !== 'late_payment') throw AppError.khongTimThay('Không có khoản hoàn tiền cần xử lý');
      const [[dat]] = await ketNoi.query('SELECT MaDatSan AS maDatSan FROM ThanhToan WHERE MaThanhToan=?', [maThanhToan]);
      yeuCau = await hoanTienService.taoYeuCauHoan(ketNoi, {
        maThanhToan, maDatSan: dat.maDatSan, loai: 'late_proof', soTien: thanhToan.soTien, tyLe: 100,
        lyDo: 'Quá hạn giữ chỗ khi chủ sân chưa xác nhận', trangThai: 'waiting_info',
      });
      await ghiNhatKy(ketNoi, maQuanTri, 'cho_khach_cap_nhat_tai_khoan_hoan', 'HoanTien', yeuCau.maHoanTien);
      return { maThanhToan, trangThaiHoanTien: 'waiting_info', canCapNhatTaiKhoanHoan: true };
    }
    if (yeuCau.trangThai !== 'waiting_info'
      || !yeuCau.tenNganHang || !yeuCau.maNganHang || !yeuCau.soTaiKhoan || !yeuCau.chuTaiKhoan
      || Number(yeuCau.soTien) <= 0) {
      throw AppError.duLieuKhongHopLe('Yêu cầu chưa có đủ thông tin hoàn tiền');
    }
    await ketNoi.query("UPDATE HoanTien SET TrangThai='processing' WHERE MaHoanTien=?", [yeuCau.maHoanTien]);
    await ketNoi.query("UPDATE ThanhToan SET TrangThaiHoanTien='processing', MaQuanTriDuyetHoan=? WHERE MaThanhToan=?",
      [maQuanTri, maThanhToan]);
    await ghiNhatKy(ketNoi, maQuanTri, 'xu_ly_hoan_tien', 'HoanTien', yeuCau.maHoanTien);
    return { maThanhToan, trangThaiHoanTien: 'processing', soTienHoan: Number(yeuCau.soTien) };
  });
}

// Admin đánh dấu đã hoàn: BẮT BUỘC có ảnh chứng từ (field `anhChungTu`), giống chủ sân.
async function hoanTatHoanTien(maQuanTri, maThanhToan, tep) {
  const duongDanAnh = await hoanTienService.kiemTraAnhChungTu(tep);
  try {
    return await thucHienGiaoDich(async (ketNoi) => {
      const yeuCau = await hoanTienService.layYeuCauDangMo(ketNoi, maThanhToan, true);
      if (!yeuCau) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
      if (!hoanTienService.TRANG_THAI_CHO_HOAN.includes(yeuCau.trangThai)) {
        throw AppError.biTrung('Thanh toán không ở trạng thái chờ hoàn tất hoàn tiền');
      }
      return hoanTienService.danhDauDaHoan(ketNoi, {
        maHoanTien: yeuCau.maHoanTien, nguoi: { maNguoiDung: maQuanTri, vaiTro: 'admin' }, duongDanAnh,
      });
    });
  } catch (loi) {
    await fs.unlink(tep.path).catch(() => {});
    throw loi;
  }
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
  const ketQuaKhoa = await khoaTaiKhoanTrongGiaoDich(maQuanTri, maNguoiDung, { lyDo });
  // Sau commit: ngắt mọi socket của người bị khóa (G8.0).
  ngatKetNoiNguoiDung(maNguoiDung);
  return ketQuaKhoa;
}

async function khoaTaiKhoanTrongGiaoDich(maQuanTri, maNguoiDung, { lyDo }) {
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
    let ketQuaSuKien = { soSuKienBiHuy: 0, soDangKyBiHuy: 0, soCanHoanPhi: 0 };
    if (taiKhoan.vaiTro === 'owner') {
      const [ketQua] = await ketNoi.query(
        "UPDATE CoSo SET TrangThai='locked', LyDoKhoa=? WHERE MaChuSan=? AND TrangThai='active'",
        [LY_DO_KHOA_CO_SO, maNguoiDung]);
      soCoSoBiKhoa = ketQua.affectedRows;
      ketQuaSuKien = await suKienAdmin.huySuKienSapToi(ketNoi, {
        maQuanTri, maChuSan: maNguoiDung,
        lyDo: `Tài khoản chủ sân đã bị quản trị viên khóa. Lý do: ${lyDo}`,
      });
    }
    await ghiNhatKy(ketNoi, maQuanTri, 'khoa_tai_khoan', 'NguoiDung', maNguoiDung,
      `Khóa ${taiKhoan.vaiTro === 'owner' ? 'chủ sân' : 'khách hàng'} ${taiKhoan.hoTen}: ${lyDo}`);
    return {
      maNguoiDung: Number(maNguoiDung), trangThai: 'locked', lyDoKhoa: lyDo,
      soCoSoBiKhoa, ...ketQuaSuKien,
    };
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

// Admin khóa cơ sở độc lập: các sự kiện chưa bắt đầu bị hủy hệ thống và giải phóng sân.
async function khoaCoSo(maQuanTri, maCoSo, { lyDo }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[coSo]] = await ketNoi.query(
      `SELECT MaCoSo AS maCoSo, MaChuSan AS maChuSan, TenCoSo AS tenCoSo, TrangThai AS trangThai
       FROM CoSo WHERE MaCoSo=? FOR UPDATE`, [maCoSo]);
    if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở');
    if (coSo.trangThai === 'locked') {
      throw AppError.biTrung('Cơ sở này đã bị khóa rồi.', 'VENUE_ALREADY_LOCKED');
    }
    await ketNoi.query("UPDATE CoSo SET TrangThai='locked', LyDoKhoa=? WHERE MaCoSo=?", [lyDo, maCoSo]);
    const ketQuaSuKien = await suKienAdmin.huySuKienSapToi(ketNoi, {
      maQuanTri, maCoSo,
      lyDo: `Cơ sở “${coSo.tenCoSo}” đã bị quản trị viên khóa. Lý do: ${lyDo}`,
    });
    await ghiNhatKy(ketNoi, maQuanTri, 'khoa_co_so', 'CoSo', maCoSo, lyDo);
    await guiThongBao(ketNoi, {
      maNguoiDung: coSo.maChuSan, loai: 'system', tieuDe: 'Cơ sở đã bị khóa',
      noiDung: `Cơ sở “${coSo.tenCoSo}” đã bị quản trị viên khóa. Lý do: ${lyDo}`,
      loaiThamChieu: 'venue', maThamChieu: Number(maCoSo), khoa: `khoa_co_so:${maCoSo}`,
    });
    return { maCoSo: Number(maCoSo), trangThai: 'locked', ...ketQuaSuKien };
  });
}

// Mở khóa không tự công khai cơ sở: trả về `closed`, chủ sân chủ động mở lại sau.
async function moKhoaCoSo(maQuanTri, maCoSo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[coSo]] = await ketNoi.query(
      `SELECT MaCoSo AS maCoSo, MaChuSan AS maChuSan, TenCoSo AS tenCoSo, TrangThai AS trangThai
       FROM CoSo WHERE MaCoSo=? FOR UPDATE`, [maCoSo]);
    if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở');
    if (coSo.trangThai !== 'locked') {
      throw AppError.biTrung('Cơ sở này không ở trạng thái bị khóa.', 'VENUE_NOT_LOCKED');
    }
    await ketNoi.query("UPDATE CoSo SET TrangThai='closed', LyDoKhoa=NULL WHERE MaCoSo=?", [maCoSo]);
    await ghiNhatKy(ketNoi, maQuanTri, 'mo_khoa_co_so', 'CoSo', maCoSo, coSo.tenCoSo);
    await guiThongBao(ketNoi, {
      maNguoiDung: coSo.maChuSan, loai: 'system', tieuDe: 'Cơ sở đã được mở khóa',
      noiDung: `Cơ sở “${coSo.tenCoSo}” đã được quản trị viên mở khóa. Cơ sở đang ở trạng thái đóng; hãy mở lại khi sẵn sàng hoạt động.`,
      loaiThamChieu: 'venue', maThamChieu: Number(maCoSo), khoa: `mo_khoa_co_so:${maCoSo}`,
    });
    return { maCoSo: Number(maCoSo), trangThai: 'closed' };
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
  khoaCoSo,
  moKhoaCoSo,
  lietKeCoSo,
};
