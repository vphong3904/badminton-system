// Tín hiệu \"dữ liệu đã đổi\" dùng chung cho cả dự án: `du-lieu:doi` { loai, ...ma, luc }.
// Client chỉ coi là tín hiệu → tải lại bằng REST (REST + DB vẫn là nguồn sự thật, không gửi tiền/chứng từ).
// loai: su-kien · dang-ky-su-kien · lich · co-so · danh-gia · khieu-nai · hoan-tien · dat-san · yeu-thich
const { pool } = require('../config/db');
const { phatNhieuPhong, tenPhongNguoiDung, PHONG_CHUNG, PHONG_ADMIN } = require('./phat');

// nguoiNhan: mã người dùng nhận riêng · chung: mọi socket đang đăng nhập · admin: phòng Admin.
function phatDuLieuDoi(loai, duLieu = {}, { nguoiNhan = [], chung = false, admin = false } = {}) {
  const cacPhong = new Set();
  for (const ma of nguoiNhan) if (ma != null) cacPhong.add(tenPhongNguoiDung(ma));
  if (chung) cacPhong.add(PHONG_CHUNG);
  if (admin) cacPhong.add(PHONG_ADMIN);
  if (cacPhong.size === 0) return;
  phatNhieuPhong([...cacPhong], 'du-lieu:doi', { loai, ...duLieu, luc: new Date().toISOString() });
}

// Đăng ký sự kiện đổi (đăng ký / rút / duyệt / từ chối / loại / thanh toán / hoàn phí):
// báo cho khách đã đăng ký + chủ sân của sự kiện; số chỗ còn lại thì phát chung ở loai `su-kien`.
async function phatDangKySuKienDoi(maDangKy) {
  try {
    const [[dong]] = await pool.query(
      `SELECT dk.MaKhachHang AS maKhachHang, sk.MaChuSan AS maChuSan, sk.MaSuKien AS maSuKien, sk.MaCoSo AS maCoSo
       FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien=dk.MaSuKien WHERE dk.MaDangKy=?`, [maDangKy]);
    if (!dong) return;
    phatDuLieuDoi('dang-ky-su-kien', { maSuKien: dong.maSuKien, maDangKy: Number(maDangKy), maCoSo: dong.maCoSo },
      { nguoiNhan: [dong.maKhachHang, dong.maChuSan] });
    phatDuLieuDoi('su-kien', { maSuKien: dong.maSuKien, maCoSo: dong.maCoSo }, { chung: true });
  } catch (loi) { console.error('[realtime] Không phát được đăng ký sự kiện:', loi.message); }
}

// Khách vừa đăng ký một sự kiện mới (chưa có maDangKy trong URL): báo chủ sân + phát chung số chỗ.
async function phatSuKienDoi(maSuKien) {
  try {
    const [[sk]] = await pool.query('SELECT MaChuSan AS maChuSan, MaCoSo AS maCoSo FROM SuKien WHERE MaSuKien=?', [maSuKien]);
    if (!sk) return;
    phatDuLieuDoi('dang-ky-su-kien', { maSuKien: Number(maSuKien), maCoSo: sk.maCoSo }, { nguoiNhan: [sk.maChuSan] });
    phatDuLieuDoi('su-kien', { maSuKien: Number(maSuKien), maCoSo: sk.maCoSo }, { chung: true });
  } catch (loi) { console.error('[realtime] Không phát được sự kiện:', loi.message); }
}

// Khiếu nại / kháng nghị đổi: báo khách + chủ sân + Admin, kèm cập nhật đơn.
async function phatKhieuNaiDoi({ maKhieuNai = null, maKhangNghi = null, maDatSan = null }) {
  try {
    let dong = null;
    if (maKhangNghi) {
      [[dong]] = await pool.query(
        `SELECT kn.MaDatSan AS maDatSan, kn.MaKhachHang AS maKhachHang, kn.MaChuSan AS maChuSan, kn.MaKhieuNai AS maKhieuNai
         FROM KhangNghi kg JOIN KhieuNai kn ON kn.MaKhieuNai=kg.MaKhieuNai WHERE kg.MaKhangNghi=?`, [maKhangNghi]);
    } else if (maKhieuNai) {
      [[dong]] = await pool.query(
        'SELECT MaDatSan AS maDatSan, MaKhachHang AS maKhachHang, MaChuSan AS maChuSan, MaKhieuNai AS maKhieuNai FROM KhieuNai WHERE MaKhieuNai=?', [maKhieuNai]);
    } else if (maDatSan) {
      [[dong]] = await pool.query(
        `SELECT d.MaDatSan AS maDatSan, d.MaKhachHang AS maKhachHang, cs.MaChuSan AS maChuSan, NULL AS maKhieuNai
         FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo WHERE d.MaDatSan=?`, [maDatSan]);
    }
    if (!dong) return;
    phatDuLieuDoi('khieu-nai', { maKhieuNai: dong.maKhieuNai, maDatSan: dong.maDatSan },
      { nguoiNhan: [dong.maKhachHang, dong.maChuSan], admin: true });
  } catch (loi) { console.error('[realtime] Không phát được khiếu nại:', loi.message); }
}

// Đánh giá đổi (chủ sân phản hồi / Admin ẩn-hiện): báo khách đã viết đánh giá + phát chung theo cơ sở.
async function phatDanhGiaDoi(maDanhGia) {
  try {
    const [[dg]] = await pool.query('SELECT MaKhachHang AS maKhachHang, MaCoSo AS maCoSo FROM DanhGia WHERE MaDanhGia=?', [maDanhGia]);
    if (!dg) return;
    phatDuLieuDoi('danh-gia', { maDanhGia: Number(maDanhGia), maCoSo: dg.maCoSo }, { nguoiNhan: [dg.maKhachHang], chung: true });
  } catch (loi) { console.error('[realtime] Không phát được đánh giá:', loi.message); }
}

module.exports = { phatDuLieuDoi, phatDangKySuKienDoi, phatSuKienDoi, phatKhieuNaiDoi, phatDanhGiaDoi };
