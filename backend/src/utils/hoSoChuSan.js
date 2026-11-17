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

module.exports = { THONG_BAO_CHO_DUYET, thongBaoTheoTrangThai, MA_LOI_THEO_TRANG_THAI };
