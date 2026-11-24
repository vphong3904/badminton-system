const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { phatChoNguoiDung, phatSauGiaoDich } = require('../realtime/phat');

// Ghi thông báo cho một người dùng. Dùng chung `ketNoi` của giao dịch nghiệp vụ để thông báo
// chỉ tồn tại khi nghiệp vụ thành công. Lỗi ghi thông báo KHÔNG được làm hỏng nghiệp vụ chính
// (đặt sân, huỷ, hoàn tiền...) nên nuốt lỗi, chỉ log.
// `khoa` (tuỳ chọn) chống gửi trùng nhờ UNIQUE KhoaChongTrung; bỏ trống nếu sự kiện được lặp lại.
async function guiThongBao(ketNoi, {
  maNguoiDung, loai, tieuDe, noiDung, loaiThamChieu = null, maThamChieu = null, khoa = null,
}) {
  if (!maNguoiDung) return;
  try {
    const [ketQua] = await ketNoi.query(
      `INSERT IGNORE INTO ThongBao
       (MaNguoiDung, Loai, TieuDe, NoiDung, LoaiThamChieu, MaThamChieu, KhoaChongTrung)
       VALUES (?,?,?,?,?,?,?)`,
      [maNguoiDung, loai, tieuDe, noiDung, loaiThamChieu, maThamChieu, khoa]);
    // affectedRows=0 khi INSERT IGNORE gặp khóa chống trùng: tuyệt đối không phát socket.
    if (ketQua.affectedRows === 1) {
      const payload = { maThongBao: Number(ketQua.insertId), loai, tieuDe, noiDung,
        loaiThamChieu, maThamChieu: maThamChieu == null ? null : Number(maThamChieu) };
      // Nhiều nơi gọi trong transaction; trì hoãn ngắn để DB commit trước khi client tải REST.
      phatSauGiaoDich(() => phatChoNguoiDung(maNguoiDung, 'thong-bao:moi', payload));
    }
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

// Hạn mới (chủ sân duyệt lại / Admin gia hạn hoàn tiền) → cho phép nhắc mốc lại từ đầu: bỏ KhoaChongTrung của các
// thông báo nhắc cũ có tiền tố `tienTo` (vd 'confirm_expiring:12:'), GIỮ nguyên thông báo trong lịch sử.
async function giaiPhongKhoaNhac(ketNoi, tienTo, { chinhXac = false } = {}) {
  try {
    await ketNoi.query(
      chinhXac
        ? 'UPDATE ThongBao SET KhoaChongTrung=NULL WHERE KhoaChongTrung=?'
        : 'UPDATE ThongBao SET KhoaChongTrung=NULL WHERE KhoaChongTrung IS NOT NULL AND LEFT(KhoaChongTrung, ?)=?',
      chinhXac ? [tienTo] : [tienTo.length, tienTo]);
  } catch (loi) {
    console.error('[thong-bao] Không giải phóng được khoá nhắc:', loi.message);
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


// G7.11: gửi cùng một thông báo cho những khách đang có đăng ký hiệu lực của sự kiện.
// `khoa` là tiền tố; mỗi người nhận có khóa riêng để không ảnh hưởng nhau.
async function baoNguoiDangKySuKien(ketNoi, {
  maSuKien, loai, tieuDe, noiDung, khoa,
  loaiThamChieu = 'event', maThamChieu = maSuKien,
  cacTrangThai = ['pending', 'accepted'],
}) {
  if (!maSuKien || !Array.isArray(cacTrangThai) || !cacTrangThai.length) return 0;
  try {
    const [cacKhach] = await ketNoi.query(
      `SELECT DISTINCT MaKhachHang AS maKhachHang
       FROM DangKySuKien WHERE MaSuKien=? AND TrangThai IN (?) ORDER BY MaKhachHang`,
      [maSuKien, cacTrangThai]);
    for (const khach of cacKhach) {
      await guiThongBao(ketNoi, {
        maNguoiDung: khach.maKhachHang, loai, tieuDe, noiDung,
        loaiThamChieu, maThamChieu,
        khoa: khoa ? `${khoa}:${khach.maKhachHang}` : null,
      });
    }
    return cacKhach.length;
  } catch (loi) {
    console.error('[thong-bao] Không gửi được thông báo sự kiện:', loi.message);
    return 0;
  }
}

// Được G7.12 gọi khi Admin ẩn sự kiện; chỉ báo người đã đăng ký, không lộ sự kiện với khách mới.
async function baoSuKienBiAn(ketNoi, { maSuKien, lyDo }) {
  try {
    const [[sk]] = await ketNoi.query(
      'SELECT TieuDe AS tieuDe FROM SuKien WHERE MaSuKien=?', [maSuKien]);
    if (!sk) return 0;
    const lyDoAn = String(lyDo || 'Sự kiện không còn được hiển thị công khai.').trim().slice(0, 220);
    return await baoNguoiDangKySuKien(ketNoi, {
      maSuKien,
      loai: 'event_hidden',
      tieuDe: 'Sự kiện đã bị ẩn',
      noiDung: `Sự kiện "${sk.tieuDe}" đã bị quản trị viên ẩn. Lý do: ${lyDoAn}`.slice(0, 500),
      khoa: `event_hidden:${maSuKien}:${Date.now()}`,
    });
  } catch (loi) {
    console.error('[thong-bao] Không báo được sự kiện bị ẩn:', loi.message);
    return 0;
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
  guiThongBao, guiChoQuanTri, giaiPhongKhoaNhac, baoKhachDaHoanTien, baoDanhGiaMoi, baoNguoiDangKySuKien, baoSuKienBiAn, rutGonVanBan, dinhDangTien, lietKe, demChuaDoc, danhDauDaDoc, danhDauTatCaDaDoc,
};
