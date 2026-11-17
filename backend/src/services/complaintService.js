const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { guiThongBao, guiChoQuanTri } = require('./notificationService');

// Khiếu nại chủ sân.
//  - Khách bấm "Khiếu nại chủ sân" cạnh: thanh toán thành công, ngay khi huỷ, và đơn đã huỷ.
//  - Admin đọc, rồi quyết định:  upheld (đúng)  → cộng 1 lần vi phạm cho chủ sân;  rejected → không tính.
//  - Số khiếu nại `upheld` của chủ sân: 1 = cảnh cáo · 2 = cảnh cáo nghiêm trọng (sắp bị khoá) · 3 = khoá tài khoản.
const SO_LAN_KHOA = 3;
const MUC_XU_LY = { 1: 'warning', 2: 'severe_warning' };

function xacDinhMucXuLy(soLanViPham) {
  if (soLanViPham >= SO_LAN_KHOA) return 'banned';
  return MUC_XU_LY[soLanViPham] || 'none';
}

// Đơn có thể khiếu nại: đơn của chính khách, đặt qua app, đã thanh toán thành công hoặc đã huỷ.
const TRANG_THAI_CO_THE_KHIEU_NAI = ['confirmed', 'completed', 'cancelled'];

async function guiKhieuNai(maKhachHang, maDatSan, { noiDung, giaiDoan }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[don]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.TrangThai AS trangThai, d.TenKhach AS tenKhach,
         s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       WHERE d.MaDatSan=? AND d.MaKhachHang=? AND d.Nguon='app' FOR UPDATE`,
      [maDatSan, maKhachHang]);
    if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    if (!TRANG_THAI_CO_THE_KHIEU_NAI.includes(don.trangThai)) {
      throw AppError.duLieuKhongHopLe('Chỉ khiếu nại được đơn đã thanh toán thành công hoặc đã huỷ.');
    }
    const [[daCo]] = await ketNoi.query(
      'SELECT MaKhieuNai AS maKhieuNai FROM KhieuNai WHERE MaDatSan=?', [maDatSan]);
    if (daCo) throw AppError.biTrung('Bạn đã khiếu nại đơn này rồi.');

    // Màn hình xuất phát do server suy ra từ trạng thái đơn; FE chỉ phân biệt "ngay khi huỷ" với "đơn đã huỷ".
    const giaiDoanLuu = don.trangThai === 'cancelled'
      ? (giaiDoan === 'at_cancel' ? 'at_cancel' : 'after_cancel')
      : 'after_payment';
    const [ketQua] = await ketNoi.query(
      `INSERT INTO KhieuNai (MaDatSan, MaKhachHang, MaChuSan, MaCoSo, GiaiDoan, NoiDung)
       VALUES (?,?,?,?,?,?)`,
      [maDatSan, maKhachHang, don.maChuSan, don.maCoSo, giaiDoanLuu, noiDung]);
    const maKhieuNai = ketQua.insertId;

    await guiThongBao(ketNoi, {
      maNguoiDung: maKhachHang,
      loai: 'complaint_received',
      tieuDe: 'Đã gửi khiếu nại',
      noiDung: `Khiếu nại của bạn về đơn ${don.maDon} (${don.tenCoSo}) đã được gửi tới quản trị viên. `
        + 'Bạn sẽ nhận thông báo khi có kết quả.',
      loaiThamChieu: 'complaint',
      maThamChieu: maKhieuNai,
      khoa: `complaint_sent:${maKhieuNai}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: don.maChuSan,
      loai: 'complaint_received',
      tieuDe: 'Bạn nhận được một khiếu nại',
      noiDung: `${don.tenKhach} khiếu nại về đơn ${don.maDon} (${don.tenCoSo}). `
        + 'Quản trị viên sẽ xem xét; khiếu nại được xác nhận đúng sẽ bị cảnh cáo, đủ 3 lần sẽ khoá tài khoản.',
      loaiThamChieu: 'complaint',
      maThamChieu: maKhieuNai,
      khoa: `complaint_owner:${maKhieuNai}`,
    });
    await guiChoQuanTri(ketNoi, {
      loai: 'complaint_received',
      tieuDe: 'Khiếu nại mới cần xử lý',
      noiDung: `${don.tenKhach} khiếu nại chủ sân của ${don.tenCoSo} (đơn ${don.maDon}).`,
      loaiThamChieu: 'complaint',
      maThamChieu: maKhieuNai,
      khoa: `complaint_admin:${maKhieuNai}`,
    });
    return { maKhieuNai, trangThai: 'pending', maDatSan: Number(maDatSan) };
  });
}

async function lietKeKhieuNaiCuaKhach(maKhachHang) {
  const [cacKhieuNai] = await pool.query(
    `SELECT k.MaKhieuNai AS maKhieuNai, k.MaDatSan AS maDatSan, d.MaDon AS maDon,
       cs.TenCoSo AS tenCoSo, k.NoiDung AS noiDung, k.TrangThai AS trangThai,
       k.GhiChuQuanTri AS ghiChuQuanTri, k.NgayTao AS ngayTao, k.NgayXuLy AS ngayXuLy
     FROM KhieuNai k JOIN DatSan d ON d.MaDatSan=k.MaDatSan JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
     WHERE k.MaKhachHang=? ORDER BY k.NgayTao DESC`, [maKhachHang]);
  return cacKhieuNai;
}

// ---------------- Admin ----------------
async function lietKeKhieuNai({ trangThai = 'pending', gioiHan = 50 } = {}) {
  const [cacKhieuNai] = await pool.query(
    `SELECT k.MaKhieuNai AS maKhieuNai, k.GiaiDoan AS giaiDoan, k.NoiDung AS noiDung,
       k.TrangThai AS trangThai, k.MucXuLy AS mucXuLy, k.GhiChuQuanTri AS ghiChuQuanTri,
       k.NgayTao AS ngayTao, k.NgayXuLy AS ngayXuLy,
       kh.MaNguoiDung AS maKhachHang, kh.HoTen AS tenKhach, kh.SoDienThoai AS soDienThoaiKhach,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo,
       cu.MaNguoiDung AS maChuSan, cu.HoTen AS tenChuSan, cu.Email AS emailChuSan,
       cu.TrangThai AS trangThaiChuSan, hs.SoLanViPham AS soLanViPham,
       d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau,
       d.GioKetThuc AS gioKetThuc, d.TongTien AS tongTien, d.TrangThai AS trangThaiDon,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan
     FROM KhieuNai k
       JOIN DatSan d ON d.MaDatSan=k.MaDatSan
       JOIN NguoiDung kh ON kh.MaNguoiDung=k.MaKhachHang
       JOIN NguoiDung cu ON cu.MaNguoiDung=k.MaChuSan
       JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       LEFT JOIN HoSoChuSan hs ON hs.MaNguoiDung=k.MaChuSan
       LEFT JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
     WHERE (? = 'all' OR k.TrangThai = ?)
     ORDER BY k.NgayTao ASC LIMIT ?`,
    [trangThai, trangThai, Number(gioiHan)]);
  return cacKhieuNai.map((muc) => ({
    ...muc,
    soLanViPham: Number(muc.soLanViPham || 0),
    soLanConLaiTruocKhiKhoa: Math.max(SO_LAN_KHOA - Number(muc.soLanViPham || 0), 0),
  }));
}

async function xuLyKhieuNai(maQuanTri, maKhieuNai, { quyetDinh, ghiChu }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[khieuNai]] = await ketNoi.query(
      `SELECT k.MaKhieuNai AS maKhieuNai, k.TrangThai AS trangThai, k.MaKhachHang AS maKhachHang,
         k.MaChuSan AS maChuSan, k.MaDatSan AS maDatSan, d.MaDon AS maDon, cs.TenCoSo AS tenCoSo
       FROM KhieuNai k JOIN DatSan d ON d.MaDatSan=k.MaDatSan JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       WHERE k.MaKhieuNai=? FOR UPDATE`, [maKhieuNai]);
    if (!khieuNai) throw AppError.khongTimThay('Không tìm thấy khiếu nại');
    if (khieuNai.trangThai !== 'pending') throw AppError.biTrung('Khiếu nại này đã được xử lý');

    let mucXuLy = 'none';
    let soLanViPham = null;
    if (quyetDinh === 'upheld') {
      // Khoá hồ sơ chủ sân để hai admin xử lý cùng lúc không đếm sai.
      await ketNoi.query('SELECT MaNguoiDung FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE', [khieuNai.maChuSan]);
      await ketNoi.query(
        "UPDATE KhieuNai SET TrangThai='upheld' WHERE MaKhieuNai=?", [maKhieuNai]);
      const [[dem]] = await ketNoi.query(
        "SELECT COUNT(*) AS so FROM KhieuNai WHERE MaChuSan=? AND TrangThai='upheld'", [khieuNai.maChuSan]);
      soLanViPham = Number(dem.so);
      mucXuLy = xacDinhMucXuLy(soLanViPham);
      await ketNoi.query(
        'UPDATE HoSoChuSan SET SoLanViPham=? WHERE MaNguoiDung=?', [soLanViPham, khieuNai.maChuSan]);
    }
    await ketNoi.query(
      `UPDATE KhieuNai SET TrangThai=?, GhiChuQuanTri=?, MucXuLy=?, MaQuanTri=?, NgayXuLy=NOW()
       WHERE MaKhieuNai=?`,
      [quyetDinh, ghiChu || null, mucXuLy, maQuanTri, maKhieuNai]);
    await ketNoi.query(
      `INSERT INTO NhatKyHeThong (MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet)
       VALUES (?,?,?,?,?)`,
      [maQuanTri, quyetDinh === 'upheld' ? 'chap_nhan_khieu_nai' : 'bac_bo_khieu_nai',
        'KhieuNai', maKhieuNai, ghiChu || null]);

    if (mucXuLy === 'banned') {
      await ketNoi.query(
        "UPDATE NguoiDung SET TrangThai='locked', LyDoKhoa=? WHERE MaNguoiDung=?",
        [`Bị khoá do ${SO_LAN_KHOA} lần khiếu nại được xác nhận`, khieuNai.maChuSan]);
      await ketNoi.query("UPDATE CoSo SET TrangThai='hidden' WHERE MaChuSan=? AND TrangThai='active'", [khieuNai.maChuSan]);
      await ketNoi.query(
        `INSERT INTO NhatKyHeThong (MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet)
         VALUES (?,?,?,?,?)`,
        [maQuanTri, 'khoa_tai_khoan', 'NguoiDung', khieuNai.maChuSan,
          `Đủ ${SO_LAN_KHOA} khiếu nại hợp lệ`]);
    }

    // Báo khách kết quả.
    await guiThongBao(ketNoi, {
      maNguoiDung: khieuNai.maKhachHang,
      loai: 'complaint_resolved',
      tieuDe: quyetDinh === 'upheld' ? 'Khiếu nại được chấp nhận' : 'Khiếu nại đã được xem xét',
      noiDung: quyetDinh === 'upheld'
        ? `Quản trị viên xác nhận khiếu nại của bạn về đơn ${khieuNai.maDon} là đúng và đã xử lý chủ sân.`
        : `Quản trị viên đã xem xét khiếu nại về đơn ${khieuNai.maDon} nhưng chưa thấy vi phạm.`
          + `${ghiChu ? ` Ghi chú: ${ghiChu}` : ''}`,
      loaiThamChieu: 'complaint',
      maThamChieu: Number(maKhieuNai),
      khoa: `complaint_resolved:${maKhieuNai}`,
    });
    // Báo chủ sân mức xử lý.
    const noiDungPhu = ghiChu ? ` Ghi chú của quản trị viên: ${ghiChu}` : '';
    if (mucXuLy === 'warning') {
      await guiThongBao(ketNoi, {
        maNguoiDung: khieuNai.maChuSan,
        loai: 'owner_warning',
        tieuDe: 'Cảnh cáo',
        noiDung: `Khiếu nại về đơn ${khieuNai.maDon} (${khieuNai.tenCoSo}) đã được xác nhận. `
          + `Đây là lần vi phạm thứ 1/${SO_LAN_KHOA}. Vui lòng tuân thủ quy định đặt sân và hoàn tiền.${noiDungPhu}`,
        loaiThamChieu: 'complaint',
        maThamChieu: Number(maKhieuNai),
        khoa: `owner_warning:${maKhieuNai}`,
      });
    } else if (mucXuLy === 'severe_warning') {
      await guiThongBao(ketNoi, {
        maNguoiDung: khieuNai.maChuSan,
        loai: 'owner_warning',
        tieuDe: 'Cảnh cáo nghiêm trọng - sắp bị khoá tài khoản',
        noiDung: `Khiếu nại về đơn ${khieuNai.maDon} (${khieuNai.tenCoSo}) đã được xác nhận. `
          + `Đây là lần vi phạm thứ 2/${SO_LAN_KHOA}. Chỉ cần thêm 1 lần nữa, tài khoản và cơ sở của bạn sẽ bị khoá.${noiDungPhu}`,
        loaiThamChieu: 'complaint',
        maThamChieu: Number(maKhieuNai),
        khoa: `owner_warning:${maKhieuNai}`,
      });
    } else if (mucXuLy === 'banned') {
      await guiThongBao(ketNoi, {
        maNguoiDung: khieuNai.maChuSan,
        loai: 'owner_banned',
        tieuDe: 'Tài khoản đã bị khoá',
        noiDung: `Bạn đã có ${SO_LAN_KHOA} khiếu nại được xác nhận. Tài khoản chủ sân và các cơ sở đã bị khoá.${noiDungPhu}`,
        loaiThamChieu: 'complaint',
        maThamChieu: Number(maKhieuNai),
        khoa: `owner_banned:${maKhieuNai}`,
      });
    }
    return {
      maKhieuNai: Number(maKhieuNai),
      trangThai: quyetDinh,
      mucXuLy,
      soLanViPham,
      daKhoaChuSan: mucXuLy === 'banned',
    };
  });
}

module.exports = {
  SO_LAN_KHOA, xacDinhMucXuLy, guiKhieuNai, lietKeKhieuNaiCuaKhach, lietKeKhieuNai, xuLyKhieuNai,
};
