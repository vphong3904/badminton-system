// Thông báo/mã lỗi theo trạng thái duyệt hồ sơ chủ sân (HoSoChuSan.TrangThaiDuyet).
// Dùng chung cho phiên đăng nhập (nguoiDung.thongBaoDuyet) và middleware chặn API quản lý.
const THONG_BAO_CHO_DUYET = 'Hồ sơ chủ sân đang đợi duyệt. Chúng tôi sẽ thông báo khi có kết quả.';

function thongBaoTheoTrangThai(trangThaiDuyet, lyDoTuChoi) {
  if (trangThaiDuyet === 'pending') return THONG_BAO_CHO_DUYET;
  if (trangThaiDuyet === 'rejected') {
    return lyDoTuChoi
      ? `Hồ sơ chủ sân bị từ chối: ${lyDoTuChoi}`
      : 'Hồ sơ chủ sân bị từ chối. Vui lòng cập nhật và gửi lại.';
  }
  return null; // approved: không cần thông báo
}

const MA_LOI_THEO_TRANG_THAI = {
  pending: 'OWNER_PENDING',
  rejected: 'OWNER_REJECTED',
};

// Thông tin BẮT BUỘC phải có (không rỗng) trước khi gửi duyệt / khi admin bấm duyệt.
// DB cũng chặn bằng NOT NULL + CHECK (scripts/migration-chu-san-bat-buoc.sql).
const MUC_BAT_BUOC_HO_SO = [
  ['soDienThoai', 'số điện thoại liên hệ'],
  ['tenDoanhNghiep', 'tên doanh nghiệp'],
  ['tenNganHang', 'tên ngân hàng'],
  ['maNganHang', 'mã ngân hàng'],
  ['soTaiKhoan', 'số tài khoản'],
  ['chuTaiKhoan', 'chủ tài khoản'],
];

// Trả về danh sách mục còn thiếu (mảng tên tiếng Việt); rỗng = hồ sơ đủ.
async function layMucConThieuHoSo(ketNoi, maChuSan) {
  const [[hoSo]] = await ketNoi.query(
    `SELECT nd.SoDienThoai AS soDienThoai, hs.TenDoanhNghiep AS tenDoanhNghiep,
       hs.TenNganHang AS tenNganHang, hs.MaNganHang AS maNganHang,
       hs.SoTaiKhoan AS soTaiKhoan, hs.ChuTaiKhoan AS chuTaiKhoan
     FROM NguoiDung nd JOIN HoSoChuSan hs ON hs.MaNguoiDung = nd.MaNguoiDung
     WHERE nd.MaNguoiDung = ?`,
    [maChuSan]);
  if (!hoSo) return MUC_BAT_BUOC_HO_SO.map(([, ten]) => ten);
  return MUC_BAT_BUOC_HO_SO
    .filter(([truong]) => !String(hoSo[truong] ?? '').trim())
    .map(([, ten]) => ten);
}

module.exports = {
  THONG_BAO_CHO_DUYET, thongBaoTheoTrangThai, MA_LOI_THEO_TRANG_THAI, layMucConThieuHoSo,
};
