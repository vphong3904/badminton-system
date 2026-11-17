const { pool } = require('../config/db');
const AppError = require('../utils/AppError');

// Ghi thông báo cho một người dùng. Dùng chung `ketNoi` của giao dịch nghiệp vụ để thông báo
// chỉ tồn tại khi nghiệp vụ thành công. Lỗi ghi thông báo KHÔNG được làm hỏng nghiệp vụ chính
// (đặt sân, huỷ, hoàn tiền...) nên nuốt lỗi, chỉ log.
// `khoa` (tuỳ chọn) chống gửi trùng nhờ UNIQUE KhoaChongTrung; bỏ trống nếu sự kiện được lặp lại.
async function guiThongBao(ketNoi, {
  maNguoiDung, loai, tieuDe, noiDung, loaiThamChieu = null, maThamChieu = null, khoa = null,
}) {
  if (!maNguoiDung) return;
  try {
    await ketNoi.query(
      `INSERT IGNORE INTO ThongBao
       (MaNguoiDung, Loai, TieuDe, NoiDung, LoaiThamChieu, MaThamChieu, KhoaChongTrung)
       VALUES (?,?,?,?,?,?,?)`,
      [maNguoiDung, loai, tieuDe, noiDung, loaiThamChieu, maThamChieu, khoa]);
  } catch (loi) {
    console.error('[thong-bao] Không ghi được thông báo:', loi.message);
  }
}

// Thông báo cho mọi admin đang hoạt động (vd có khiếu nại mới).
async function guiChoQuanTri(ketNoi, thongBao) {
  try {
    const [cacAdmin] = await ketNoi.query(
      "SELECT MaNguoiDung AS maNguoiDung FROM NguoiDung WHERE VaiTro='admin' AND TrangThai='active'");
    for (const admin of cacAdmin) {
      await guiThongBao(ketNoi, {
        ...thongBao,
        maNguoiDung: admin.maNguoiDung,
        khoa: thongBao.khoa ? `${thongBao.khoa}:${admin.maNguoiDung}` : null,
      });
    }
  } catch (loi) {
    console.error('[thong-bao] Không gửi được cho quản trị:', loi.message);
  }
}

const dinhDangTien = (soTien) => `${Number(soTien).toLocaleString('vi-VN')}đ`;

// Báo khách khi tiền hoàn đã được chuyển (chủ sân hoặc admin bấm hoàn tất). Best-effort.
async function baoKhachDaHoanTien(ketNoi, maThanhToan, maGiaoDichHoan = null) {
  try {
    const [[muc]] = await ketNoi.query(
      `SELECT d.MaKhachHang AS maKhachHang, d.MaDatSan AS maDatSan, d.MaDon AS maDon,
         t.SoTienHoan AS soTienHoan, cs.TenCoSo AS tenCoSo
       FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
         JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       WHERE t.MaThanhToan=?`, [maThanhToan]);
    if (!muc || !muc.maKhachHang) return;
    await guiThongBao(ketNoi, {
      maNguoiDung: muc.maKhachHang,
      loai: 'refund_completed',
      tieuDe: 'Bạn đã được hoàn tiền',
      noiDung: `${dinhDangTien(muc.soTienHoan)} của đơn ${muc.maDon} (${muc.tenCoSo}) đã được hoàn lại`
        + `${maGiaoDichHoan ? ` (mã giao dịch ${maGiaoDichHoan})` : ''}. Vui lòng kiểm tra tài khoản.`,
      loaiThamChieu: 'booking',
      maThamChieu: muc.maDatSan,
      khoa: `refund_completed:${maThanhToan}`,
    });
  } catch (loi) {
    console.error('[thong-bao] Không báo được hoàn tiền:', loi.message);
  }
}

// Cắt nhận xét còn tối đa `soKyTu` ký tự (đếm theo ký tự Unicode, không cắt đôi emoji), thêm … nếu bị cắt.
function rutGonVanBan(vanBan, soKyTu = 80) {
  const cacKyTu = Array.from(String(vanBan || '').trim());
  return cacKyTu.length > soKyTu ? `${cacKyTu.slice(0, soKyTu).join('')}…` : cacKyTu.join('');
}

// Khách vừa gửi đánh giá: báo chủ sân (review_received) và cảm ơn khách (review_sent).
// Best-effort như các thông báo khác: lỗi ở đây không được làm hỏng việc gửi đánh giá.
async function baoDanhGiaMoi(ketNoi, { maDanhGia, maCoSo, maKhachHang, soSao, noiDung }) {
  try {
    const [[muc]] = await ketNoi.query(
      `SELECT cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan, nd.HoTen AS tenKhach
       FROM CoSo cs JOIN NguoiDung nd ON nd.MaNguoiDung=?
       WHERE cs.MaCoSo=?`, [maKhachHang, maCoSo]);
    if (!muc) return;
    const nhanXet = noiDung ? rutGonVanBan(noiDung, 80) : '';
    await guiThongBao(ketNoi, {
      maNguoiDung: muc.maChuSan,
      loai: 'review_received',
      tieuDe: 'Bạn nhận được đánh giá mới',
      noiDung: `${muc.tenKhach} đánh giá ${soSao} sao cho ${muc.tenCoSo}${nhanXet ? `: "${nhanXet}"` : ''}`,
      loaiThamChieu: 'venue',
      maThamChieu: maCoSo,
      khoa: `review_received:${maDanhGia}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: maKhachHang,
      loai: 'review_sent',
      tieuDe: 'Cảm ơn bạn đã đánh giá',
      noiDung: `Đánh giá ${soSao} sao của bạn cho ${muc.tenCoSo} đã được ghi nhận.`,
      loaiThamChieu: 'venue',
      maThamChieu: maCoSo,
      khoa: `review_sent:${maDanhGia}`,
    });
  } catch (loi) {
    console.error('[thong-bao] Không báo được đánh giá mới:', loi.message);
  }
}

async function lietKe(maNguoiDung, { trang = 1, soLuong = 30, chiChuaDoc = false } = {}) {
  const gioiHan = Math.min(Math.max(Number(soLuong) || 30, 1), 50);
  const lech = (Math.max(Number(trang) || 1, 1) - 1) * gioiHan;
  const dieuKien = chiChuaDoc ? 'AND DaDoc=0' : '';
  const [cacThongBao] = await pool.query(
    `SELECT MaThongBao AS maThongBao, Loai AS loai, TieuDe AS tieuDe, NoiDung AS noiDung,
       LoaiThamChieu AS loaiThamChieu, MaThamChieu AS maThamChieu,
       DaDoc AS daDoc, NgayTao AS ngayTao
     FROM ThongBao WHERE MaNguoiDung=? ${dieuKien}
     ORDER BY NgayTao DESC, MaThongBao DESC LIMIT ? OFFSET ?`,
    [maNguoiDung, gioiHan, lech]);
  const [[dem]] = await pool.query(
    'SELECT COUNT(*) AS soChuaDoc FROM ThongBao WHERE MaNguoiDung=? AND DaDoc=0', [maNguoiDung]);
  return {
    cacThongBao: cacThongBao.map((muc) => ({ ...muc, daDoc: !!muc.daDoc })),
    soChuaDoc: Number(dem.soChuaDoc),
    trang: Math.max(Number(trang) || 1, 1),
  };
}

async function demChuaDoc(maNguoiDung) {
  const [[dem]] = await pool.query(
    'SELECT COUNT(*) AS soChuaDoc FROM ThongBao WHERE MaNguoiDung=? AND DaDoc=0', [maNguoiDung]);
  return { soChuaDoc: Number(dem.soChuaDoc) };
}

async function danhDauDaDoc(maNguoiDung, maThongBao) {
  const [ketQua] = await pool.query(
    'UPDATE ThongBao SET DaDoc=1 WHERE MaThongBao=? AND MaNguoiDung=?', [maThongBao, maNguoiDung]);
  if (!ketQua.affectedRows) throw AppError.khongTimThay('Không tìm thấy thông báo');
  return { maThongBao: Number(maThongBao), daDoc: true };
}

async function danhDauTatCaDaDoc(maNguoiDung) {
  const [ketQua] = await pool.query(
    'UPDATE ThongBao SET DaDoc=1 WHERE MaNguoiDung=? AND DaDoc=0', [maNguoiDung]);
  return { soDaDanhDau: ketQua.affectedRows };
}

module.exports = {
  guiThongBao, guiChoQuanTri, baoKhachDaHoanTien, baoDanhGiaMoi, rutGonVanBan, dinhDangTien, lietKe, demChuaDoc, danhDauDaDoc, danhDauTatCaDaDoc,
};
