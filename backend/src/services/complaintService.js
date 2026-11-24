const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { guiThongBao, guiChoQuanTri, rutGonVanBan, giaiPhongKhoaNhac } = require('./notificationService');

const nhatKy = require('./nhatKyService');
const { layCauHinhSo } = require('./cauHinhService');
const { dinhDangTien } = require('./notificationService');
const suKienAdmin = require('./suKienAdminService');
const sanCoSo = require('./sanCoSoService');
const { ngatKetNoiNguoiDung } = require('../realtime/phat');

const GIO_HAN_HOAN_LAI_MAC_DINH = 24;
// Hạn chủ sân phản hồi/giải trình khiếu nại (giờ). Quá hạn mà chưa phản hồi → Admin thấy cờ "quá hạn phản hồi" và có thể xử lý ngay.
const GIO_PHAN_HOI_MAC_DINH = 24;
// Hạn chủ sân kháng nghị quyết định chấp nhận khiếu nại (giờ, kể từ lúc Admin xử lý).
const GIO_KHANG_NGHI_MAC_DINH = 24; // G9.C1: appeal_hours 48 → 24
// Mã hiển thị của khiếu nại, vd KN000123 (chủ sân / Admin / khách dùng chung để tra cứu).
const maKhieuNaiHienThi = (ma) => `KN${String(ma).padStart(6, '0')}`;

// Khiếu nại chủ sân.
//  - Khách luôn có nút "Khiếu nại chủ sân" ở mọi đơn đặt qua app: đang chờ chủ sân duyệt ảnh chuyển khoản,
//    bị từ chối, đã thanh toán, ngay khi huỷ, và đơn đã huỷ. Mỗi đơn chỉ khiếu nại một lần.
//  - Admin đọc, rồi quyết định:  upheld (đúng)  → cộng 1 lần vi phạm cho chủ sân;  rejected → không tính.
//  - Số khiếu nại `upheld` của chủ sân: 1 = cảnh cáo · 2 = cảnh cáo nghiêm trọng (sắp bị khoá) · 3 = khoá tài khoản.
const SO_LAN_KHOA = 3;
const MUC_XU_LY = { 1: 'warning', 2: 'severe_warning' };
// Lý do ghi vào NguoiDung.LyDoKhoa khi đủ SO_LAN_KHOA gậy. G9.D3 dựa vào đúng chuỗi này để nhận ra tài khoản
// "chỉ bị khoá do gậy" (khoá tay bởi Admin có lý do khác nên không bao giờ bị tự mở khoá).
const lyDoKhoaTuDong = () => `Bị khoá do ${SO_LAN_KHOA} lần khiếu nại được xác nhận`;

function xacDinhMucXuLy(soLanViPham) {
  if (soLanViPham >= SO_LAN_KHOA) return 'banned';
  return MUC_XU_LY[soLanViPham] || 'none';
}

// Bằng chứng Admin đính kèm khi quyết định: mảng đường dẫn ảnh lưu dạng JSON (tối đa 3).
const docBangChung = (chuoi) => {
  try { const mang = JSON.parse(chuoi || '[]'); return Array.isArray(mang) ? mang : []; } catch { return []; }
};

// Số gậy đang tính của chủ sân: bỏ gậy đã thu hồi (revoked) và gậy đã hết hiệu lực.
async function demGayHieuLuc(ketNoi, maChuSan) {
  const [[dem]] = await ketNoi.query(
    `SELECT COUNT(*) AS so FROM Gay WHERE MaChuSan=? AND TrangThai IN ('active','appealed')
       AND (HetHieuLuc IS NULL OR HetHieuLuc > NOW())`, [maChuSan]);
  return Number(dem.so);
}

// Có 2 loại khiếu nại (mỗi đơn tối đa 1 khiếu nại mỗi loại):
//  - 'service': chủ sân CHẬM DUYỆT thanh toán (khách đã gửi ảnh mà chủ sân chưa xác nhận quá `ThanhToan.HanXacNhan`).
//    Đơn chủ sân ĐÃ duyệt thanh toán thì KHÔNG khiếu nại được nữa.
//  - 'refund': khoản hoàn đã quá `HoanTien.HanHoan` mà chủ sân chưa hoàn → "Chưa nhận được tiền hoàn".

async function guiKhieuNai(maKhachHang, maDatSan, { noiDung, giaiDoan }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[don]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.TrangThai AS trangThai, d.TenKhach AS tenKhach,
         DATE_FORMAT(d.NgayChoi, '%d/%m/%Y') AS ngayChoi, TIME_FORMAT(d.GioBatDau, '%H:%i') AS gioBatDau,
         TIME_FORMAT(d.GioKetThuc, '%H:%i') AS gioKetThuc,
         s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan,
         DATE_FORMAT(NOW(), '%H:%i %d/%m/%Y') AS luc
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       WHERE d.MaDatSan=? AND d.MaKhachHang=? AND d.Nguon='app' FOR UPDATE`,
      [maDatSan, maKhachHang]);
    if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');

    // G9.C8: đơn đã gửi ảnh và đang chờ chủ sân duyệt: chỉ được khiếu nại sau khi QUÁ HanXacNhan thật → "Chậm duyệt".
    const [[thanhToan]] = await ketNoi.query(
      `SELECT t.TrangThai AS trangThai,
         DATE_FORMAT(t.HanXacNhan, '%H:%i %d/%m/%Y') AS hanXacNhan,
         (t.HanXacNhan IS NOT NULL AND t.HanXacNhan < NOW()) AS daQuaHan
       FROM DatSan d JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
       WHERE d.MaDatSan=?`, [maDatSan]);
    const dangChoDuyet = thanhToan?.trangThai === 'confirming';
    if (dangChoDuyet && !Number(thanhToan.daQuaHan)) {
      throw AppError.duLieuKhongHopLe(
        `Chủ sân vẫn còn trong thời gian xác nhận${thanhToan.hanXacNhan ? ` (đến ${thanhToan.hanXacNhan})` : ''}. `
        + 'Nếu quá hạn mà chủ sân chưa duyệt, bạn có thể khiếu nại.');
    }
    if (!dangChoDuyet) {
      throw AppError.duLieuKhongHopLe(
        'Chỉ khiếu nại được khi chủ sân chưa duyệt thanh toán quá hạn. '
        + 'Nếu bạn huỷ đơn mà chưa nhận được tiền hoàn, hãy dùng nút "Chưa nhận được tiền hoàn".');
    }
    const chamDuyet = dangChoDuyet;
    const noiDungLuu = chamDuyet && !noiDung.startsWith('[Chậm duyệt]') ? `[Chậm duyệt] ${noiDung}` : noiDung;
    const [[daCo]] = await ketNoi.query(
      "SELECT MaKhieuNai AS maKhieuNai FROM KhieuNai WHERE MaDatSan=? AND Loai='service'", [maDatSan]);
    if (daCo) throw AppError.biTrung('Bạn đã khiếu nại đơn này rồi.');

    // Màn hình xuất phát do server suy ra từ trạng thái đơn; FE chỉ phân biệt "ngay khi huỷ" với "đơn đã huỷ".
    const giaiDoanLuu = don.trangThai === 'cancelled'
      ? (giaiDoan === 'at_cancel' ? 'at_cancel' : 'after_cancel')
      : 'after_payment';
    const gioPhanHoi = await layCauHinhSo(ketNoi, 'complaint_owner_reply_hours', GIO_PHAN_HOI_MAC_DINH);
    const [ketQua] = await ketNoi.query(
      `INSERT INTO KhieuNai (MaDatSan, MaKhachHang, MaChuSan, MaCoSo, Loai, GiaiDoan, NoiDung, HanPhanHoi)
       VALUES (?,?,?,?,'service',?,?, NOW() + INTERVAL ? HOUR)`,
      [maDatSan, maKhachHang, don.maChuSan, don.maCoSo, giaiDoanLuu, noiDungLuu, gioPhanHoi]);
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
      tieuDe: chamDuyet ? 'Khiếu nại: bạn chưa duyệt đơn quá hạn' : 'Bạn nhận được một khiếu nại',
      noiDung: `${don.tenKhach} khiếu nại${chamDuyet ? ' (chậm duyệt)' : ''} lúc ${don.luc}. `
        + `Cơ sở: ${don.tenCoSo}. Đơn ${don.maDon} (${don.tenSan}, ${don.ngayChoi} ${don.gioBatDau}-${don.gioKetThuc}). `
        + `Lý do: ${rutGonVanBan(noiDung, 170)}`,
      loaiThamChieu: 'complaint',
      maThamChieu: maKhieuNai,
      khoa: `complaint_owner:${maKhieuNai}`,
    });
    await guiChoQuanTri(ketNoi, {
      loai: 'complaint_received',
      tieuDe: chamDuyet ? 'Khiếu nại mới (chậm duyệt) cần xử lý' : 'Khiếu nại mới cần xử lý',
      noiDung: `${don.tenKhach} khiếu nại${chamDuyet ? ' (chậm duyệt)' : ''} chủ sân lúc ${don.luc}. `
        + `Cơ sở: ${don.tenCoSo}. Đơn ${don.maDon} (${don.tenSan}, ${don.ngayChoi} ${don.gioBatDau}-${don.gioKetThuc}). `
        + `Lý do: ${rutGonVanBan(noiDung, 170)}`,
      loaiThamChieu: 'complaint',
      maThamChieu: maKhieuNai,
      khoa: `complaint_admin:${maKhieuNai}`,
    });
    return { maKhieuNai, trangThai: 'pending', maDatSan: Number(maDatSan) };
  });
}

async function guiKhieuNaiHoanTien(maKhachHang, maHoanTien, { lyDo }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[ht]] = await ketNoi.query(
      `SELECT h.MaHoanTien AS maHoanTien, h.MaDatSan AS maDatSan, h.TrangThai AS trangThai, h.SoTien AS soTien,
         (h.HanHoan IS NOT NULL AND h.HanHoan < NOW()) AS daDuCho,
         DATE_FORMAT(h.HanHoan, '%H:%i %d/%m/%Y') AS moKhiNao,
         d.MaDon AS maDon, d.TenKhach AS tenKhach, d.MaKhachHang AS maKhach,
         s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan,
         DATE_FORMAT(NOW(), '%H:%i %d/%m/%Y') AS luc
       FROM HoanTien h JOIN DatSan d ON d.MaDatSan=h.MaDatSan
         JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       WHERE h.MaHoanTien=? FOR UPDATE`,
      [maHoanTien]);
    if (!ht || Number(ht.maKhach) !== Number(maKhachHang)) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
    if (!['processing', 'not_received', 'escalated'].includes(ht.trangThai)) {
      throw AppError.biTrung(
        ht.trangThai === 'waiting_info'
          ? 'Khoản hoàn này đang do quản trị viên xử lý, bạn chưa cần khiếu nại.'
          : 'Khoản hoàn này đã được chuyển hoặc đã đóng, không cần khiếu nại.', 'REFUND_NOT_OVERDUE');
    }
    if (!Number(ht.daDuCho)) {
      throw AppError.duLieuKhongHopLe(
        ht.moKhiNao
          ? `Chủ sân còn trong thời gian hoàn tiền. Sau ${ht.moKhiNao} nếu vẫn chưa nhận được tiền, bạn có thể báo chưa nhận được tiền hoàn.`
          : 'Khoản hoàn này chưa có hạn chuyển hoàn (quản trị viên đang xử lý), bạn chưa cần báo chưa nhận được tiền.');
    }
    const [[daCo]] = await ketNoi.query(
      "SELECT MaKhieuNai AS maKhieuNai FROM KhieuNai WHERE MaDatSan=? AND Loai='refund'", [ht.maDatSan]);
    if (daCo) throw AppError.biTrung('Bạn đã báo chưa nhận được tiền hoàn của đơn này rồi.');

    const noiDungLuu = lyDo.startsWith('[Hoàn tiền]') ? lyDo : `[Hoàn tiền] ${lyDo}`;
    const gioPhanHoi = await layCauHinhSo(ketNoi, 'complaint_owner_reply_hours', GIO_PHAN_HOI_MAC_DINH);
    const [ketQua] = await ketNoi.query(
      `INSERT INTO KhieuNai (MaDatSan, MaKhachHang, MaChuSan, MaCoSo, Loai, MaHoanTien, GiaiDoan, NoiDung, HanPhanHoi)
       VALUES (?,?,?,?,'refund',?,'after_cancel',?, NOW() + INTERVAL ? HOUR)`,
      [ht.maDatSan, maKhachHang, ht.maChuSan, ht.maCoSo, ht.maHoanTien, noiDungLuu, gioPhanHoi]);
    const maKhieuNai = ketQua.insertId;
    const maHienThi = maKhieuNaiHienThi(maKhieuNai);
    const tienHoan = dinhDangTien(ht.soTien);
    // Cùng một khối thông tin gửi chủ sân và Admin: ngày giờ, mã khiếu nại, mã đơn, tên khách, lý do.
    const chiTiet = `Ngày giờ khiếu nại: ${ht.luc}. Mã khiếu nại: ${maHienThi}. Mã đơn: ${ht.maDon}. `
      + `Khách: ${ht.tenKhach}. Cơ sở: ${ht.tenCoSo} (${ht.tenSan}). Số tiền cần hoàn: ${tienHoan}. `
      + `Lý do: ${rutGonVanBan(lyDo, 170)}`;
    const thamChieu = { loaiThamChieu: 'complaint', maThamChieu: maKhieuNai };

    await guiThongBao(ketNoi, {
      maNguoiDung: maKhachHang, loai: 'complaint_received', tieuDe: 'Đã gửi báo chưa nhận được tiền hoàn',
      noiDung: `Khiếu nại ${maHienThi} về đơn ${ht.maDon} đã được gửi tới chủ sân và quản trị viên. `
        + 'Bạn sẽ nhận thông báo khi có kết quả.',
      ...thamChieu, khoa: `complaint_sent:${maKhieuNai}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: ht.maChuSan, loai: 'complaint_received',
      tieuDe: `Khách chưa nhận được tiền hoàn - ${maHienThi}`,
      noiDung: `${chiTiet} Vui lòng chuyển khoản hoàn và tải ảnh chứng từ ngay. `
        + 'Nếu quản trị viên xác nhận khiếu nại đúng, bạn sẽ bị tính 1 lần vi phạm (cảnh cáo; đủ 3 lần sẽ bị khoá tài khoản).',
      ...thamChieu, khoa: `complaint_owner:${maKhieuNai}`,
    });
    await guiChoQuanTri(ketNoi, {
      loai: 'complaint_received', tieuDe: `Khiếu nại chưa nhận được tiền hoàn - ${maHienThi}`,
      noiDung: chiTiet, ...thamChieu, khoa: `complaint_admin:${maKhieuNai}`,
    });
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maKhachHang, hanhDong: 'khieu_nai_hoan_tien', doiTuong: 'KhieuNai', maDoiTuong: maKhieuNai,
      chiTiet: `${maHienThi} - đơn ${ht.maDon} - ${tienHoan}`,
    });
    return { maKhieuNai, maKhieuNaiHienThi: maHienThi, trangThai: 'pending', maDatSan: Number(ht.maDatSan) };
  });
}

async function lietKeKhieuNaiCuaKhach(maKhachHang) {
  const [cacKhieuNai] = await pool.query(
    `SELECT k.MaKhieuNai AS maKhieuNai, k.Loai AS loai, k.MaDatSan AS maDatSan, d.MaDon AS maDon,
       cs.TenCoSo AS tenCoSo, k.NoiDung AS noiDung, k.TrangThai AS trangThai,
       k.GhiChuQuanTri AS ghiChuQuanTri, k.NgayTao AS ngayTao, k.NgayXuLy AS ngayXuLy
     FROM KhieuNai k JOIN DatSan d ON d.MaDatSan=k.MaDatSan JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
     WHERE k.MaKhachHang=? AND k.DaXoa=0 ORDER BY k.NgayTao DESC`, [maKhachHang]);
  return cacKhieuNai.map((k) => ({ ...k, maKhieuNaiHienThi: maKhieuNaiHienThi(k.maKhieuNai) }));
}

// ---------------- Chủ sân ----------------
// Khiếu nại gửi tới chủ sân (mới nhất trước). Có hạn phản hồi + thông tin hoàn tiền để chủ sân xử lý ngay.
async function lietKeKhieuNaiCuaChuSan(maChuSan, { trangThai = 'all', gioiHan = 100 } = {}) {
  const gio = await layCauHinhSo(pool, 'complaint_owner_reply_hours', GIO_PHAN_HOI_MAC_DINH);
  const gioKhangNghi = await layCauHinhSo(pool, 'appeal_hours', GIO_KHANG_NGHI_MAC_DINH);
  const [cacKhieuNai] = await pool.query(
    `SELECT k.MaKhieuNai AS maKhieuNai, k.Loai AS loai, k.NoiDung AS noiDung, k.TrangThai AS trangThai,
       k.MucXuLy AS mucXuLy, k.GhiChuQuanTri AS ghiChuQuanTri, k.NgayTao AS ngayTao, k.NgayXuLy AS ngayXuLy,
       k.PhanHoiChuSan AS phanHoiChuSan, k.NgayPhanHoi AS ngayPhanHoi,
       (k.NgayTao + INTERVAL ? HOUR) AS hanPhanHoi,
       (k.TrangThai='pending' AND k.PhanHoiChuSan IS NULL AND k.NgayTao + INTERVAL ? HOUR < NOW()) AS quaHanPhanHoi,
       kh.HoTen AS tenKhach, kh.SoDienThoai AS soDienThoaiKhach,
       cs.TenCoSo AS tenCoSo, s.TenSan AS tenSan,
       d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau,
       d.GioKetThuc AS gioKetThuc, d.TongTien AS tongTien,
       h.MaHoanTien AS maHoanTien, h.SoTien AS soTienHoan, h.TrangThai AS trangThaiHoanTien,
       h.AnhChungTu AS anhChungTuHoan, h.HanHoan AS hanHoan,
       k.BangChungQuanTri AS bangChungQuanTri, g.MaGay AS maGay, g.TrangThai AS trangThaiGay,
       (k.NgayXuLy + INTERVAL ? HOUR) AS hanKhangNghi,
       (k.TrangThai='upheld' AND g.TrangThai='active' AND kn.MaKhangNghi IS NULL
         AND k.NgayXuLy + INTERVAL ? HOUR >= NOW()) AS coTheKhangNghi,
       kn.MaKhangNghi AS maKhangNghi, kn.TrangThai AS trangThaiKhangNghi, kn.GhiChuQuanTri AS ghiChuKhangNghi
     FROM KhieuNai k
       LEFT JOIN Gay g ON g.MaKhieuNai=k.MaKhieuNai
       LEFT JOIN KhangNghi kn ON kn.MaKhieuNai=k.MaKhieuNai
       JOIN DatSan d ON d.MaDatSan=k.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan
       JOIN NguoiDung kh ON kh.MaNguoiDung=k.MaKhachHang
       JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       LEFT JOIN HoanTien h ON h.MaHoanTien=k.MaHoanTien
     WHERE k.MaChuSan=? AND k.DaXoa=0 AND (? = 'all' OR k.TrangThai = ?)
     ORDER BY (k.TrangThai='pending') DESC, k.NgayTao DESC LIMIT ?`,
    [gio, gioKhangNghi, gioKhangNghi, gio, gio, maChuSan, trangThai, trangThai, Number(gioiHan)]);
  return cacKhieuNai.map(({ bangChungQuanTri, ...k }) => ({
    ...k,
    bangChung: docBangChung(bangChungQuanTri),
    maKhieuNaiHienThi: maKhieuNaiHienThi(k.maKhieuNai),
    quaHanPhanHoi: !!Number(k.quaHanPhanHoi),
    coTheKhangNghi: !!Number(k.coTheKhangNghi),
  }));
}

// Chủ sân giải trình MỘT lần cho khiếu nại đang chờ. Báo Admin (để xem xét) và khách (biết chủ sân đã phản hồi).
// Với khiếu nại hoàn tiền: giải trình KHÔNG thay cho việc chuyển hoàn — chủ sân vẫn phải tải ảnh chứng từ ở mục Hoàn tiền.
async function phanHoiKhieuNai(maChuSan, maKhieuNai, { noiDung }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[kn]] = await ketNoi.query(
      `SELECT k.MaKhieuNai AS maKhieuNai, k.TrangThai AS trangThai, k.PhanHoiChuSan AS daPhanHoi, k.MaKhachHang AS maKhach,
         k.Loai AS loai, d.MaDon AS maDon, d.TenKhach AS tenKhach, cs.TenCoSo AS tenCoSo,
         DATE_FORMAT(NOW(), '%H:%i %d/%m/%Y') AS luc
       FROM KhieuNai k JOIN DatSan d ON d.MaDatSan=k.MaDatSan JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       WHERE k.MaKhieuNai=? AND k.MaChuSan=? AND k.DaXoa=0 FOR UPDATE`, [maKhieuNai, maChuSan]);
    if (!kn) throw AppError.khongTimThay('Không tìm thấy khiếu nại');
    if (kn.trangThai !== 'pending') throw AppError.biTrung('Khiếu nại này đã được quản trị viên xử lý, không thể phản hồi thêm.');
    if (kn.daPhanHoi) throw AppError.biTrung('Bạn đã phản hồi khiếu nại này rồi.');
    await ketNoi.query('UPDATE KhieuNai SET PhanHoiChuSan=?, NgayPhanHoi=NOW() WHERE MaKhieuNai=?', [noiDung, maKhieuNai]);
    const maHienThi = maKhieuNaiHienThi(maKhieuNai);
    const tham = { loaiThamChieu: 'complaint', maThamChieu: Number(maKhieuNai) };
    await guiChoQuanTri(ketNoi, {
      loai: 'complaint_received', tieuDe: `Chủ sân đã phản hồi khiếu nại ${maHienThi}`,
      noiDung: `Lúc ${kn.luc}, chủ sân (${kn.tenCoSo}) phản hồi khiếu nại ${maHienThi} của ${kn.tenKhach} về đơn ${kn.maDon}. `
        + `Nội dung: ${rutGonVanBan(noiDung, 220)}`,
      ...tham, khoa: `complaint_reply_admin:${maKhieuNai}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: kn.maKhach, loai: 'complaint_received', tieuDe: `Chủ sân đã phản hồi khiếu nại ${maHienThi}`,
      noiDung: `Chủ sân ${kn.tenCoSo} đã phản hồi về đơn ${kn.maDon}: ${rutGonVanBan(noiDung, 220)} `
        + 'Quản trị viên sẽ xem xét và thông báo kết quả cho bạn.',
      ...tham, khoa: `complaint_reply_khach:${maKhieuNai}`,
    });
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'chu_san_phan_hoi_khieu_nai', doiTuong: 'KhieuNai', maDoiTuong: maKhieuNai,
      chiTiet: rutGonVanBan(noiDung, 200),
    });
    return { maKhieuNai: Number(maKhieuNai), daPhanHoi: true };
  });
}

// ---------------- Admin ----------------
async function lietKeKhieuNai({ trangThai = 'pending', gioiHan = 50 } = {}) {
  const gioPhanHoi = await layCauHinhSo(pool, 'complaint_owner_reply_hours', GIO_PHAN_HOI_MAC_DINH);
  const [cacKhieuNai] = await pool.query(
    `SELECT k.MaKhieuNai AS maKhieuNai, k.Loai AS loai, k.MaHoanTien AS maHoanTien, k.GiaiDoan AS giaiDoan, k.NoiDung AS noiDung,
       k.TrangThai AS trangThai, k.MucXuLy AS mucXuLy, k.GhiChuQuanTri AS ghiChuQuanTri,
       k.BangChungQuanTri AS bangChungQuanTri, g.MaGay AS maGay, g.TrangThai AS trangThaiGay,
       k.NgayTao AS ngayTao, k.NgayXuLy AS ngayXuLy,
       kh.MaNguoiDung AS maKhachHang, kh.HoTen AS tenKhach, kh.SoDienThoai AS soDienThoaiKhach,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo,
       cu.MaNguoiDung AS maChuSan, cu.HoTen AS tenChuSan, cu.Email AS emailChuSan,
       cu.TrangThai AS trangThaiChuSan, hs.SoLanViPham AS soLanViPham,
       d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau,
       d.GioKetThuc AS gioKetThuc, d.TongTien AS tongTien, d.TrangThai AS trangThaiDon,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan,
       k.PhanHoiChuSan AS phanHoiChuSan, k.NgayPhanHoi AS ngayPhanHoi,
       (k.NgayTao + INTERVAL ? HOUR) AS hanPhanHoi,
       (k.TrangThai='pending' AND k.PhanHoiChuSan IS NULL AND k.NgayTao + INTERVAL ? HOUR < NOW()) AS quaHanPhanHoi,
       ht.TrangThai AS trangThaiKhoanHoan, ht.AnhChungTu AS anhChungTuHoan, ht.HanHoan AS hanHoan
     FROM KhieuNai k
       JOIN DatSan d ON d.MaDatSan=k.MaDatSan
       JOIN NguoiDung kh ON kh.MaNguoiDung=k.MaKhachHang
       JOIN NguoiDung cu ON cu.MaNguoiDung=k.MaChuSan
       JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       LEFT JOIN HoSoChuSan hs ON hs.MaNguoiDung=k.MaChuSan
       LEFT JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
       LEFT JOIN HoanTien ht ON ht.MaHoanTien=k.MaHoanTien
       LEFT JOIN Gay g ON g.MaKhieuNai=k.MaKhieuNai
     WHERE k.DaXoa=0 AND (? = 'all' OR k.TrangThai = ?)
     ORDER BY k.NgayTao ASC LIMIT ?`,
    [gioPhanHoi, gioPhanHoi, trangThai, trangThai, Number(gioiHan)]);
  return cacKhieuNai.map(({ bangChungQuanTri, ...muc }) => ({
    ...muc,
    bangChung: docBangChung(bangChungQuanTri),
    maKhieuNaiHienThi: maKhieuNaiHienThi(muc.maKhieuNai),
    quaHanPhanHoi: !!Number(muc.quaHanPhanHoi),
    soLanViPham: Number(muc.soLanViPham || 0),
    soLanConLaiTruocKhiKhoa: Math.max(SO_LAN_KHOA - Number(muc.soLanViPham || 0), 0),
  }));
}

async function xuLyKhieuNai(maQuanTri, maKhieuNai, { quyetDinh, ghiChu }, cacAnhBangChung = []) {
  const bangChung = cacAnhBangChung.map((tep) => `/tep-tai-len/${tep.filename}`);
  return thucHienGiaoDich(async (ketNoi) => {
    const [[khieuNai]] = await ketNoi.query(
      `SELECT k.MaKhieuNai AS maKhieuNai, k.TrangThai AS trangThai, k.MaKhachHang AS maKhachHang,
         k.MaChuSan AS maChuSan, k.MaDatSan AS maDatSan, k.Loai AS loai, k.MaHoanTien AS maHoanTien,
         d.MaDon AS maDon, cs.TenCoSo AS tenCoSo
       FROM KhieuNai k JOIN DatSan d ON d.MaDatSan=k.MaDatSan JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       WHERE k.MaKhieuNai=? AND k.DaXoa=0 FOR UPDATE`, [maKhieuNai]);
    if (!khieuNai) throw AppError.khongTimThay('Không tìm thấy khiếu nại');
    if (khieuNai.trangThai !== 'pending') throw AppError.biTrung('Khiếu nại này đã được xử lý');

    // Khiếu nại hoàn tiền mà khách ĐÃ xác nhận nhận được tiền thì không còn vi phạm để chấp nhận.
    if (quyetDinh === 'upheld' && khieuNai.loai === 'refund' && khieuNai.maHoanTien) {
      const [[ht]] = await ketNoi.query('SELECT TrangThai AS trangThai FROM HoanTien WHERE MaHoanTien=?', [khieuNai.maHoanTien]);
      if (ht?.trangThai === 'received') {
        throw AppError.biTrung(
          'Khách đã xác nhận nhận được tiền hoàn nên không thể chấp nhận khiếu nại này. Hãy bác bỏ để đóng.', 'REFUND_ALREADY_RECEIVED');
      }
    }

    let mucXuLy = 'none';
    let soLanViPham = null;
    let maGay = null;
    if (quyetDinh === 'upheld') {
      // Khoá hồ sơ chủ sân để hai admin xử lý cùng lúc không đếm sai.
      await ketNoi.query('SELECT MaNguoiDung FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE', [khieuNai.maChuSan]);
      // Gậy chỉ được cộng khi khiếu nại được chấp nhận (mỗi khiếu nại tối đa 1 gậy — UNIQUE MaKhieuNai).
      const [themGay] = await ketNoi.query(
        "INSERT INTO Gay (MaChuSan, MaKhieuNai, TrangThai) VALUES (?, ?, 'active')", [khieuNai.maChuSan, maKhieuNai]);
      maGay = themGay.insertId;
      soLanViPham = await demGayHieuLuc(ketNoi, khieuNai.maChuSan);
      mucXuLy = xacDinhMucXuLy(soLanViPham);
      await ketNoi.query(
        'UPDATE HoSoChuSan SET SoLanViPham=? WHERE MaNguoiDung=?', [soLanViPham, khieuNai.maChuSan]);
    }
    await ketNoi.query(
      `UPDATE KhieuNai SET TrangThai=?, GhiChuQuanTri=?, BangChungQuanTri=?, MucXuLy=?, MaQuanTri=?, NgayXuLy=NOW()
       WHERE MaKhieuNai=?`,
      [quyetDinh, ghiChu, bangChung.length ? JSON.stringify(bangChung) : null, mucXuLy, maQuanTri, maKhieuNai]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri, hanhDong: quyetDinh === 'upheld' ? 'chap_nhan_khieu_nai' : 'bac_bo_khieu_nai',
      doiTuong: 'KhieuNai', maDoiTuong: maKhieuNai, chiTiet: ghiChu,
      truoc: { trangThai: 'pending' },
      sau: { trangThai: quyetDinh, mucXuLy, maGay, soLanViPham, bangChung },
    });

    if (mucXuLy === 'banned') {
      await ketNoi.query(
        "UPDATE NguoiDung SET TrangThai='locked', LyDoKhoa=? WHERE MaNguoiDung=?",
        [lyDoKhoaTuDong(), khieuNai.maChuSan]);
      // Đang trong giao dịch → ngắt trễ để lệnh khóa kịp commit (G8.0).
      ngatKetNoiNguoiDung(khieuNai.maChuSan, { troMs: 1000 });
      await ketNoi.query("UPDATE CoSo SET TrangThai='hidden' WHERE MaChuSan=? AND TrangThai='active'", [khieuNai.maChuSan]);
      await suKienAdmin.huySuKienSapToi(ketNoi, {
        maQuanTri, maChuSan: khieuNai.maChuSan,
        lyDo: `Tài khoản chủ sân bị khóa tự động do đủ ${SO_LAN_KHOA} khiếu nại được xác nhận.`,
      });
      await nhatKy.ghiNhatKy(ketNoi, {
        maNguoiThucHien: maQuanTri, hanhDong: 'khoa_tai_khoan', doiTuong: 'NguoiDung', maDoiTuong: khieuNai.maChuSan,
        chiTiet: `Đủ ${SO_LAN_KHOA} khiếu nại hợp lệ`,
      });
    }

    // Khiếu nại hoàn tiền được chấp nhận: chủ sân phải hoàn trong hạn mới (mặc định 24 giờ), báo cho chủ sân.
    let hanHoanMoi = null;
    if (quyetDinh === 'upheld' && khieuNai.loai === 'refund' && khieuNai.maHoanTien) {
      // G9.C2: tính bằng phút (refund_grace_hours × 60) để cùng đơn vị với HanHoan ở hoanTienService.
      const phut = (await layCauHinhSo(ketNoi, 'refund_grace_hours', GIO_HAN_HOAN_LAI_MAC_DINH)) * 60;
      const [capNhat] = await ketNoi.query(
        `UPDATE HoanTien SET HanHoan=NOW() + INTERVAL ? MINUTE, NgayNhacHan=NULL,
           TrangThai=IF(TrangThai='escalated','processing',TrangThai)
         WHERE MaHoanTien=? AND TrangThai IN ('processing','not_received','escalated')`, [phut, khieuNai.maHoanTien]);
      if (capNhat.affectedRows) {
        // Hạn mới → nhắc mốc và báo quá hạn (escalated) được phép chạy lại từ đầu (G9.C5).
        const maHT = khieuNai.maHoanTien;
        await giaiPhongKhoaNhac(ketNoi, `refund_expiring:${maHT}:`);
        await giaiPhongKhoaNhac(ketNoi, `refund_escalated:${maHT}:`);
        await giaiPhongKhoaNhac(ketNoi, `refund_escalated_khach:${maHT}`, { chinhXac: true });
        await giaiPhongKhoaNhac(ketNoi, `refund_escalated_chu_san:${maHT}`, { chinhXac: true });
        const [[h]] = await ketNoi.query(
          "SELECT DATE_FORMAT(HanHoan, '%H:%i %d/%m/%Y') AS han FROM HoanTien WHERE MaHoanTien=?", [khieuNai.maHoanTien]);
        hanHoanMoi = h.han;
      }
    }

    // Báo khách kết quả.
    await guiThongBao(ketNoi, {
      maNguoiDung: khieuNai.maKhachHang,
      loai: 'complaint_resolved',
      tieuDe: quyetDinh === 'upheld' ? 'Khiếu nại được chấp nhận' : 'Khiếu nại đã được xem xét',
      noiDung: quyetDinh === 'upheld'
        ? `Quản trị viên xác nhận khiếu nại của bạn về đơn ${khieuNai.maDon} là đúng và đã xử lý chủ sân.`
        : `Quản trị viên đã xem xét khiếu nại về đơn ${khieuNai.maDon} nhưng chưa thấy vi phạm.`
          + ` Lý do: ${ghiChu}`,
      loaiThamChieu: 'complaint',
      maThamChieu: Number(maKhieuNai),
      khoa: `complaint_resolved:${maKhieuNai}`,
    });
    // Báo chủ sân mức xử lý.
    const gioKhangNghi = await layCauHinhSo(ketNoi, 'appeal_hours', GIO_KHANG_NGHI_MAC_DINH);
    const noiDungPhu = ` Lý do của quản trị viên: ${ghiChu}`
      + (quyetDinh === 'upheld' ? ` Bạn có thể kháng nghị 1 lần trong ${gioKhangNghi} giờ.` : '')
      + (hanHoanMoi ? ` Bạn phải chuyển hoàn và tải ảnh chứng từ trước ${hanHoanMoi}.` : '');
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
      maGay,
      bangChung,
      daKhoaChuSan: mucXuLy === 'banned',
    };
  });
}

// ---------------- Kháng nghị (G5.5) ----------------
// Số gậy hiệu lực của chủ sân → ghi lại HoSoChuSan.SoLanViPham (cột tính sẵn).
async function dongBoSoLanViPham(ketNoi, maChuSan) {
  const so = await demGayHieuLuc(ketNoi, maChuSan);
  await ketNoi.query('UPDATE HoSoChuSan SET SoLanViPham=? WHERE MaNguoiDung=?', [so, maChuSan]);
  return so;
}

// Số ảnh bằng chứng kháng nghị (G9.C9): bắt buộc ≥1, tối đa 3.
const TOI_THIEU_ANH_KHANG_NGHI = 1;
const TOI_DA_ANH_KHANG_NGHI = 3;

// Chủ sân kháng nghị MỘT lần quyết định chấp nhận khiếu nại, trong appeal_hours kể từ lúc Admin xử lý.
// G9.C9: kèm 1–3 ảnh bằng chứng (`KhangNghi.BangChung` = JSON mảng đường dẫn ảnh).
async function khangNghiKhieuNai(maChuSan, maKhieuNai, { noiDung }, cacAnhBangChung = []) {
  if (cacAnhBangChung.length < TOI_THIEU_ANH_KHANG_NGHI) {
    throw AppError.duLieuKhongHopLe('Vui lòng đính kèm ít nhất 1 ảnh bằng chứng cho kháng nghị.');
  }
  if (cacAnhBangChung.length > TOI_DA_ANH_KHANG_NGHI) {
    throw AppError.duLieuKhongHopLe(`Chỉ đính kèm tối đa ${TOI_DA_ANH_KHANG_NGHI} ảnh bằng chứng.`);
  }
  const bangChung = cacAnhBangChung.map((tep) => `/tep-tai-len/${tep.filename}`);
  const gio = await layCauHinhSo(pool, 'appeal_hours', GIO_KHANG_NGHI_MAC_DINH);
  return thucHienGiaoDich(async (ketNoi) => {
    const [[kn]] = await ketNoi.query(
      `SELECT k.MaKhieuNai AS maKhieuNai, k.TrangThai AS trangThai, k.MaKhachHang AS maKhach, d.MaDon AS maDon,
         cs.TenCoSo AS tenCoSo, g.MaGay AS maGay, g.TrangThai AS trangThaiGay,
         (k.NgayXuLy + INTERVAL ? HOUR >= NOW()) AS conHan
       FROM KhieuNai k JOIN DatSan d ON d.MaDatSan=k.MaDatSan JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
         LEFT JOIN Gay g ON g.MaKhieuNai=k.MaKhieuNai
       WHERE k.MaKhieuNai=? AND k.MaChuSan=? AND k.DaXoa=0 FOR UPDATE`, [gio, maKhieuNai, maChuSan]);
    if (!kn) throw AppError.khongTimThay('Không tìm thấy khiếu nại');
    if (kn.trangThai !== 'upheld' || !kn.maGay) throw AppError.biTrung('Chỉ kháng nghị được khiếu nại đã bị chấp nhận (có gậy).', 'APPEAL_NOT_ALLOWED');
    const [[daCo]] = await ketNoi.query('SELECT MaKhangNghi FROM KhangNghi WHERE MaKhieuNai=?', [maKhieuNai]);
    if (daCo) throw AppError.biTrung('Bạn đã kháng nghị khiếu nại này rồi (mỗi khiếu nại một lần).', 'APPEAL_ALREADY_SENT');
    if (!Number(kn.conHan)) throw new AppError(400, `Đã quá hạn kháng nghị (${gio} giờ kể từ lúc quản trị viên xử lý).`, 'APPEAL_EXPIRED');
    if (kn.trangThaiGay !== 'active') throw AppError.biTrung('Gậy này không còn hiệu lực để kháng nghị.', 'APPEAL_NOT_ALLOWED');

    const [them] = await ketNoi.query(
      'INSERT INTO KhangNghi (MaKhieuNai, MaGay, MaChuSan, NoiDung, BangChung) VALUES (?,?,?,?,?)',
      [maKhieuNai, kn.maGay, maChuSan, noiDung, JSON.stringify(bangChung)]);
    await ketNoi.query("UPDATE Gay SET TrangThai='appealed' WHERE MaGay=?", [kn.maGay]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'khang_nghi_khieu_nai', doiTuong: 'KhieuNai', maDoiTuong: maKhieuNai,
      chiTiet: noiDung, truoc: { trangThaiGay: 'active' },
      sau: { trangThaiGay: 'appealed', maKhangNghi: them.insertId, soAnhBangChung: bangChung.length },
    });
    const maHienThi = maKhieuNaiHienThi(maKhieuNai);
    await guiChoQuanTri(ketNoi, {
      loai: 'complaint_received', tieuDe: `Chủ sân kháng nghị khiếu nại ${maHienThi}`,
      noiDung: `Chủ sân (${kn.tenCoSo}) kháng nghị quyết định về khiếu nại ${maHienThi} (đơn ${kn.maDon}). Nội dung: ${rutGonVanBan(noiDung, 250)}`,
      loaiThamChieu: 'complaint', maThamChieu: Number(maKhieuNai), khoa: `appeal_admin:${maKhieuNai}`,
    });
    return { maKhangNghi: them.insertId, maKhieuNai: Number(maKhieuNai), trangThai: 'pending', bangChung };
  });
}

async function lietKeKhangNghi({ trangThai = 'pending', gioiHan = 50 } = {}) {
  const [cacDong] = await pool.query(
    `SELECT kn.MaKhangNghi AS maKhangNghi, kn.MaKhieuNai AS maKhieuNai, kn.MaGay AS maGay, kn.NoiDung AS noiDung,
       kn.TrangThai AS trangThai, kn.GhiChuQuanTri AS ghiChuQuanTri, kn.NgayTao AS ngayTao, kn.NgayXuLy AS ngayXuLy,
       kn.BangChung AS bangChungKhangNghi,
       k.NoiDung AS noiDungKhieuNai, k.GhiChuQuanTri AS lyDoQuyetDinh, k.BangChungQuanTri AS bangChungQuanTri,
       k.Loai AS loaiKhieuNai, k.PhanHoiChuSan AS phanHoiChuSan, g.TrangThai AS trangThaiGay,
       cu.MaNguoiDung AS maChuSan, cu.HoTen AS tenChuSan, cs.TenCoSo AS tenCoSo, d.MaDon AS maDon,
       -- G9.C9: để Admin biết khách đã nhận tiền hoàn chưa trước khi chấp nhận kháng nghị.
       ht.MaHoanTien AS maHoanTien, ht.TrangThai AS trangThaiHoanTien, ht.NgayKhachXacNhan AS ngayKhachXacNhan,
       ht.AnhChungTu AS anhChungTuHoan
     FROM KhangNghi kn
       JOIN KhieuNai k ON k.MaKhieuNai=kn.MaKhieuNai
       LEFT JOIN HoanTien ht ON ht.MaHoanTien=k.MaHoanTien
       JOIN Gay g ON g.MaGay=kn.MaGay
       JOIN NguoiDung cu ON cu.MaNguoiDung=kn.MaChuSan
       JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       JOIN DatSan d ON d.MaDatSan=k.MaDatSan
     WHERE k.DaXoa=0 AND (? = 'all' OR kn.TrangThai = ?) ORDER BY kn.NgayTao ASC LIMIT ?`, [trangThai, trangThai, Number(gioiHan)]);
  // G9.C9: `bangChung` = ảnh chủ sân đính kèm kháng nghị; ảnh Admin đính kèm khi xử lý khiếu nại đổi tên `bangChungQuanTri`.
  return cacDong.map(({ bangChungQuanTri, bangChungKhangNghi, ...d }) => ({
    ...d,
    bangChung: docBangChung(bangChungKhangNghi),
    bangChungQuanTri: docBangChung(bangChungQuanTri),
    maKhieuNaiHienThi: maKhieuNaiHienThi(d.maKhieuNai),
  }));
}

// Admin xét kháng nghị: accepted → thu hồi gậy (revoked, không tính vào SoLanViPham); rejected → gậy active lại.
// Không tự mở khóa tài khoản đã bị khóa do đủ 3 gậy: trả `canMoKhoaTaiKhoan` để Admin tự quyết (có nhật ký).
async function xuLyKhangNghi(maQuanTri, maKhangNghi, { quyetDinh, ghiChu }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[kn]] = await ketNoi.query(
      `SELECT kn.MaKhangNghi AS maKhangNghi, kn.TrangThai AS trangThai, kn.MaGay AS maGay, kn.MaKhieuNai AS maKhieuNai,
         kn.MaChuSan AS maChuSan, d.MaDon AS maDon, k.Loai AS loaiKhieuNai, k.MaHoanTien AS maHoanTien,
         ht.TrangThai AS trangThaiHoanTien, ht.NgayKhachXacNhan AS ngayKhachXacNhan, ht.AnhChungTu AS anhChungTuHoan
       FROM KhangNghi kn JOIN KhieuNai k ON k.MaKhieuNai=kn.MaKhieuNai JOIN DatSan d ON d.MaDatSan=k.MaDatSan
         LEFT JOIN HoanTien ht ON ht.MaHoanTien=k.MaHoanTien
       WHERE kn.MaKhangNghi=? AND k.DaXoa=0 FOR UPDATE`, [maKhangNghi]);
    if (!kn) throw AppError.khongTimThay('Không tìm thấy kháng nghị');
    if (kn.trangThai !== 'pending') throw AppError.biTrung('Kháng nghị này đã được xử lý');
    // G9.C9: kháng nghị khiếu nại hoàn tiền chỉ được CHẤP NHẬN khi khách đã bấm "đã nhận tiền" hoặc có ảnh chứng từ hoàn
    // (điều kiện đã đồng ý). Khiếu nại `service` (chậm duyệt) không có khoản hoàn → không áp điều kiện này.
    if (quyetDinh === 'accepted' && kn.loaiKhieuNai === 'refund' && kn.maHoanTien) {
      const khachDaNhan = kn.trangThaiHoanTien === 'received' || kn.ngayKhachXacNhan != null;
      if (!khachDaNhan && !kn.anhChungTuHoan) {
        throw AppError.biTrung(
          'Chưa thể chấp nhận kháng nghị: khách chưa xác nhận đã nhận tiền hoàn và chưa có ảnh chứng từ hoàn tiền.',
          'APPEAL_REFUND_NOT_CONFIRMED');
      }
    }
    await ketNoi.query('SELECT MaNguoiDung FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE', [kn.maChuSan]);
    const chapNhan = quyetDinh === 'accepted';
    await ketNoi.query(
      'UPDATE KhangNghi SET TrangThai=?, GhiChuQuanTri=?, MaQuanTri=?, NgayXuLy=NOW() WHERE MaKhangNghi=?',
      [quyetDinh, ghiChu, maQuanTri, maKhangNghi]);
    if (chapNhan) {
      await ketNoi.query(
        "UPDATE Gay SET TrangThai='revoked', NgayThuHoi=NOW(), LyDoThuHoi=?, MaQuanTriThuHoi=? WHERE MaGay=?",
        [ghiChu, maQuanTri, kn.maGay]);
    } else {
      await ketNoi.query("UPDATE Gay SET TrangThai='active' WHERE MaGay=?", [kn.maGay]);
    }
    const soLanViPham = await dongBoSoLanViPham(ketNoi, kn.maChuSan);
    const [[tk]] = await ketNoi.query('SELECT TrangThai AS trangThai, LyDoKhoa AS lyDoKhoa FROM NguoiDung WHERE MaNguoiDung=?', [kn.maChuSan]);
    const canMoKhoaTaiKhoan = chapNhan && tk?.trangThai === 'locked' && soLanViPham < SO_LAN_KHOA;
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri, hanhDong: chapNhan ? 'thu_hoi_gay' : 'bac_khang_nghi',
      doiTuong: 'KhieuNai', maDoiTuong: kn.maKhieuNai, chiTiet: ghiChu,
      truoc: { trangThaiGay: 'appealed' }, sau: { trangThaiGay: chapNhan ? 'revoked' : 'active', soLanViPham, maKhangNghi: Number(maKhangNghi) },
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: kn.maChuSan, loai: 'complaint_resolved',
      tieuDe: chapNhan ? 'Kháng nghị được chấp nhận' : 'Kháng nghị bị bác',
      noiDung: chapNhan
        ? `Gậy từ khiếu nại đơn ${kn.maDon} đã được thu hồi. Lý do: ${ghiChu}`
        : `Kháng nghị về khiếu nại đơn ${kn.maDon} bị bác, gậy được giữ nguyên. Lý do: ${ghiChu}`,
      loaiThamChieu: 'complaint', maThamChieu: Number(kn.maKhieuNai), khoa: `appeal_resolved:${maKhangNghi}`,
    });
    return { maKhangNghi: Number(maKhangNghi), trangThai: quyetDinh, soLanViPham, canMoKhoaTaiKhoan };
  });
}

// ---------------- Thu hồi khiếu nại (G9.D3) ----------------
// Admin "xoá" một khiếu nại đã xử lý nhầm (hoặc còn chờ). Xoá MỀM (KhieuNai.DaXoa=1) vì Gay.MaKhieuNai có FK + CHK_Gay_Nguon.
// - Khiếu nại `upheld`: gậy (Gay) → revoked, tính lại SoLanViPham, kháng nghị đang chờ → cancelled.
// - Chủ sân đang bị khoá CHỈ do đủ gậy (LyDoKhoa đúng chuỗi tự động) mà gậy hiệu lực nay < SO_LAN_KHOA → tự mở khoá,
//   cơ sở `hidden` do khoá được bật lại qua kichHoatCoSoNeuSanSang. Khoá tay bởi Admin (lý do khác) giữ nguyên.
// - Báo chủ sân + khách, ghi NhatKyHeThong. Không hoàn tác được các việc phụ của lần khoá cũ (sự kiện đã tự huỷ vẫn huỷ).
async function thuHoiKhieuNai(maQuanTri, maKhieuNai, { lyDo }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[kn]] = await ketNoi.query(
      `SELECT k.MaKhieuNai AS maKhieuNai, k.TrangThai AS trangThai, k.MaKhachHang AS maKhachHang,
         k.MaChuSan AS maChuSan, k.DaXoa AS daXoa, d.MaDon AS maDon, cs.TenCoSo AS tenCoSo
       FROM KhieuNai k JOIN DatSan d ON d.MaDatSan=k.MaDatSan JOIN CoSo cs ON cs.MaCoSo=k.MaCoSo
       WHERE k.MaKhieuNai=? FOR UPDATE`, [maKhieuNai]);
    if (!kn) throw AppError.khongTimThay('Không tìm thấy khiếu nại');
    if (Number(kn.daXoa)) throw AppError.biTrung('Khiếu nại này đã được thu hồi trước đó.', 'COMPLAINT_ALREADY_DELETED');

    // Khoá hồ sơ chủ sân trước (cùng thứ tự với xuLyKhieuNai/xuLyKhangNghi) để các thao tác gậy không chạy song song.
    await ketNoi.query('SELECT MaNguoiDung FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE', [kn.maChuSan]);
    const soLanTruoc = await demGayHieuLuc(ketNoi, kn.maChuSan);

    let daThuHoiGay = false;
    let trangThaiGayTruoc = null;
    if (kn.trangThai === 'upheld') {
      const [[gay]] = await ketNoi.query(
        'SELECT MaGay AS maGay, TrangThai AS trangThai FROM Gay WHERE MaKhieuNai=? FOR UPDATE', [maKhieuNai]);
      if (gay) {
        trangThaiGayTruoc = gay.trangThai;
        if (gay.trangThai !== 'revoked') { // đã thu hồi qua kháng nghị rồi thì không làm lại
          await ketNoi.query(
            "UPDATE Gay SET TrangThai='revoked', NgayThuHoi=NOW(), LyDoThuHoi=?, MaQuanTriThuHoi=? WHERE MaGay=?",
            [`Thu hồi khiếu nại: ${lyDo}`.slice(0, 500), maQuanTri, gay.maGay]);
          daThuHoiGay = true;
        }
      }
    }
    // Kháng nghị chưa xử lý của khiếu nại này không còn đối tượng → huỷ (đã xử lý thì giữ làm lịch sử).
    await ketNoi.query(
      `UPDATE KhangNghi SET TrangThai='cancelled', GhiChuQuanTri=?, MaQuanTri=?, NgayXuLy=NOW()
       WHERE MaKhieuNai=? AND TrangThai='pending'`,
      [`Khiếu nại đã bị thu hồi: ${lyDo}`.slice(0, 500), maQuanTri, maKhieuNai]);

    await ketNoi.query(
      'UPDATE KhieuNai SET DaXoa=1, NgayXoa=NOW(), LyDoXoa=?, MaQuanTriXoa=? WHERE MaKhieuNai=?',
      [lyDo, maQuanTri, maKhieuNai]);

    const soLanViPham = await dongBoSoLanViPham(ketNoi, kn.maChuSan);

    // Tự mở khoá khi tài khoản chỉ bị khoá do đủ gậy và nay không còn đủ.
    let daMoKhoaChuSan = false;
    let soCoSoBatLai = 0;
    if (daThuHoiGay && soLanViPham < SO_LAN_KHOA) {
      const [[tk]] = await ketNoi.query(
        'SELECT TrangThai AS trangThai, LyDoKhoa AS lyDoKhoa FROM NguoiDung WHERE MaNguoiDung=? FOR UPDATE', [kn.maChuSan]);
      if (tk?.trangThai === 'locked' && tk.lyDoKhoa === lyDoKhoaTuDong()) {
        await ketNoi.query("UPDATE NguoiDung SET TrangThai='active', LyDoKhoa=NULL WHERE MaNguoiDung=?", [kn.maChuSan]);
        daMoKhoaChuSan = true;
        // Cơ sở bị ẩn lúc khoá (`hidden`): bật lại nếu đủ điều kiện hiển thị (sân hoạt động + bảng giá + chủ sân đã duyệt).
        const [cacCoSoAn] = await ketNoi.query(
          "SELECT MaCoSo AS maCoSo FROM CoSo WHERE MaChuSan=? AND TrangThai='hidden'", [kn.maChuSan]);
        for (const { maCoSo } of cacCoSoAn) await sanCoSo.kichHoatCoSoNeuSanSang(ketNoi, maCoSo);
        if (cacCoSoAn.length) {
          const [[dem]] = await ketNoi.query(
            `SELECT COUNT(*) AS so FROM CoSo WHERE MaCoSo IN (${cacCoSoAn.map(() => '?').join(',')}) AND TrangThai='active'`,
            cacCoSoAn.map((c) => c.maCoSo));
          soCoSoBatLai = Number(dem.so);
        }
      }
    }

    const maHienThi = maKhieuNaiHienThi(maKhieuNai);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri, hanhDong: 'thu_hoi_khieu_nai', doiTuong: 'KhieuNai', maDoiTuong: maKhieuNai,
      chiTiet: lyDo,
      truoc: { trangThai: kn.trangThai, trangThaiGay: trangThaiGayTruoc, soLanViPham: soLanTruoc },
      sau: { daXoa: true, daThuHoiGay, soLanViPham, daMoKhoaChuSan, soCoSoBatLai },
    });

    const tham = { loaiThamChieu: 'complaint', maThamChieu: Number(maKhieuNai) };
    await guiThongBao(ketNoi, {
      maNguoiDung: kn.maChuSan, loai: 'complaint_resolved',
      tieuDe: `Khiếu nại ${maHienThi} đã được thu hồi`,
      noiDung: `Quản trị viên đã thu hồi khiếu nại ${maHienThi} về đơn ${kn.maDon} (${kn.tenCoSo}).`
        + (daThuHoiGay ? ` Lần vi phạm tương ứng đã được gỡ (hiện còn ${soLanViPham}/${SO_LAN_KHOA}).` : '')
        + ` Lý do: ${lyDo}`,
      ...tham, khoa: `complaint_revoked_owner:${maKhieuNai}`,
    });
    if (daMoKhoaChuSan) {
      await guiThongBao(ketNoi, {
        maNguoiDung: kn.maChuSan, loai: 'system', tieuDe: 'Tài khoản đã được mở khoá',
        noiDung: 'Khiếu nại dẫn tới việc khoá tài khoản đã bị thu hồi, nên tài khoản chủ sân được mở khoá.'
          + (soCoSoBatLai ? ` ${soCoSoBatLai} cơ sở đã hiển thị lại cho khách.` : ''),
        ...tham, khoa: `owner_unlocked_by_revoke:${maKhieuNai}`,
      });
    }
    await guiThongBao(ketNoi, {
      maNguoiDung: kn.maKhachHang, loai: 'complaint_resolved',
      tieuDe: `Khiếu nại ${maHienThi} đã bị thu hồi`,
      noiDung: `Quản trị viên đã thu hồi khiếu nại ${maHienThi} của bạn về đơn ${kn.maDon}. Lý do: ${lyDo}`,
      ...tham, khoa: `complaint_revoked_khach:${maKhieuNai}`,
    });

    return { maKhieuNai: Number(maKhieuNai), daThuHoi: daThuHoiGay, soLanViPham, daMoKhoaChuSan };
  });
}

// Admin đặt/gỡ "khóa nhận đặt mới" cho chủ sân: chặn khách đặt MỚI, lịch đã đặt giữ nguyên (không tự hủy).
async function datKhoaDatMoi(maQuanTri, maChuSan, { khoa, lyDo }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[hs]] = await ketNoi.query('SELECT KhoaDatMoi AS khoa FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE', [maChuSan]);
    if (!hs) throw AppError.khongTimThay('Không tìm thấy chủ sân');
    if (!!hs.khoa === khoa) throw AppError.biTrung(khoa ? 'Chủ sân đã đang bị khóa nhận đặt mới.' : 'Chủ sân không bị khóa nhận đặt mới.');
    await ketNoi.query('UPDATE HoSoChuSan SET KhoaDatMoi=? WHERE MaNguoiDung=?', [khoa ? 1 : 0, maChuSan]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri, hanhDong: khoa ? 'khoa_dat_moi' : 'mo_khoa_dat_moi', doiTuong: 'NguoiDung', maDoiTuong: maChuSan,
      chiTiet: lyDo, truoc: { khoaDatMoi: !!hs.khoa }, sau: { khoaDatMoi: khoa },
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: maChuSan, loai: 'owner_warning',
      tieuDe: khoa ? 'Tạm khóa nhận đặt sân mới' : 'Đã mở lại nhận đặt sân mới',
      noiDung: khoa
        ? `Khách tạm thời không đặt mới được tại cơ sở của bạn; lịch đã đặt vẫn giữ nguyên. Lý do: ${lyDo}`
        : `Cơ sở của bạn đã nhận đặt sân mới trở lại. ${lyDo}`,
      loaiThamChieu: null, maThamChieu: null, khoa: null,
    });
    return { maChuSan: Number(maChuSan), khoaDatMoi: khoa };
  });
}

module.exports = {
  SO_LAN_KHOA, xacDinhMucXuLy, maKhieuNaiHienThi, guiKhieuNai, guiKhieuNaiHoanTien, lietKeKhieuNaiCuaChuSan, phanHoiKhieuNai, lietKeKhieuNaiCuaKhach, lietKeKhieuNai, xuLyKhieuNai,
  khangNghiKhieuNai, lietKeKhangNghi, xuLyKhangNghi, thuHoiKhieuNai, datKhoaDatMoi,
};
