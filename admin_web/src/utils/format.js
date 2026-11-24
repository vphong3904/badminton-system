/**tiền, ngày giờ, nhãn */
/** Hàm định dạng: tiền, ngày giờ và nhãn tiếng Việt cho các mã trạng thái */

const DINH_DANG_SO = new Intl.NumberFormat('vi-VN');

/** "90000.00" -> "90.000 đ"; null -> "—" */
export function dinhDangTien(giaTri) {
  if (giaTri === null || giaTri === undefined || giaTri === '') return '—';
  const so = Number(giaTri);
  if (Number.isNaN(so)) return '—';
  return `${DINH_DANG_SO.format(so)} đ`;
}

/** "2026-11-07 09:41:00" -> "07/11/2026 09:41" (cắt chuỗi, không dùng Date để khỏi lệch múi giờ) */
export function dinhDangNgayGio(chuoi) {
  if (!chuoi) return '—';
  const khop = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(chuoi));
  if (!khop) return String(chuoi);
  const [, nam, thang, ngay, gio, phut] = khop;
  return gio ? `${ngay}/${thang}/${nam} ${gio}:${phut}` : `${ngay}/${thang}/${nam}`;
}

/** Ẩn số tài khoản: chỉ hiện 4 số cuối, còn lại thay bằng * ("0123456789" -> "******6789") */
export function anSoTaiKhoan(soTaiKhoan) {
  const chuoi = String(soTaiKhoan ?? '').replace(/\s+/g, '');
  if (!chuoi) return 'Chưa cập nhật';
  if (chuoi.length <= 4) return chuoi;
  return '*'.repeat(chuoi.length - 4) + chuoi.slice(-4);
}

const NHAN_HANH_DONG = {
  duyet_chu_san: 'Duyệt hồ sơ chủ sân',
  tu_choi_chu_san: 'Từ chối hồ sơ chủ sân',
  cho_khach_cap_nhat_tai_khoan_hoan: 'Yêu cầu khách bổ sung tài khoản hoàn',
  xu_ly_hoan_tien: 'Duyệt xử lý hoàn tiền',
  hoan_tat_hoan_tien: 'Hoàn tất hoàn tiền',
  xac_nhan_chi_tien: 'Xác nhận chi tiền cho chủ sân',
  tu_choi_rut_tien: 'Từ chối rút tiền',
  khoa_tai_khoan: 'Khóa tài khoản',
  mo_khoa_tai_khoan: 'Mở khóa tài khoản',
  chap_nhan_khieu_nai: 'Chấp nhận khiếu nại',
  bac_bo_khieu_nai: 'Bác bỏ khiếu nại',
  an_danh_gia: 'Xóa đánh giá',
  hien_danh_gia: 'Khôi phục đánh giá',
};
/** Mã lạ hiện nguyên giá trị */
export const nhanHanhDong = (ma) => NHAN_HANH_DONG[ma] || ma || '—';

const TRANG_THAI_HOAN_TIEN = {
  none: { nhan: 'Chưa yêu cầu hoàn', mau: 'xam' },
  waiting_info: { nhan: 'Chờ thông tin tài khoản', mau: 'vang' },
  processing: { nhan: 'Chờ chuyển khoản hoàn', mau: 'xanhDuong' },
  not_received: { nhan: 'Khách báo chưa nhận', mau: 'do' },
  escalated: { nhan: 'Quá hạn, chủ sân chưa hoàn', mau: 'do' },
  refunded: { nhan: 'Đã hoàn, chờ khách xác nhận', mau: 'xanhDuong' },
  received: { nhan: 'Khách đã nhận lại', mau: 'xanh' },
  failed: { nhan: 'Hoàn tiền lỗi', mau: 'do' },
};
export const nhanTrangThaiHoanTien = (ma) =>
  TRANG_THAI_HOAN_TIEN[ma] || { nhan: ma || '—', mau: 'xam' };

const TRANG_THAI_THANH_TOAN = {
  late_payment: { nhan: 'Thanh toán trễ', mau: 'vang' },
};
export const nhanTrangThaiThanhToan = (ma) =>
  TRANG_THAI_THANH_TOAN[ma] || { nhan: ma || '—', mau: 'xam' };

const TRANG_THAI_DON = {
  pending_payment: { nhan: 'Chờ thanh toán', mau: 'vang' },
  confirmed: { nhan: 'Đã xác nhận', mau: 'xanh' },
  completed: { nhan: 'Hoàn thành', mau: 'xanh' },
  cancelled: { nhan: 'Đã hủy', mau: 'do' },
  expired: { nhan: 'Hết hạn giữ chỗ', mau: 'xam' },
};
export const nhanTrangThaiDon = (ma) => TRANG_THAI_DON[ma] || { nhan: ma || '—', mau: 'xam' };

/** Khách bấm "Khiếu nại chủ sân" ở màn nào: after_payment = thanh toán thành công, còn lại = đơn đã hủy / hoàn tiền */
const GIAI_DOAN_KHIEU_NAI = {
  after_payment: 'Sau khi thanh toán thành công',
  at_cancel: 'Ngay khi hủy đơn',
  after_cancel: 'Sau khi đơn đã hủy',
};
export const nhanGiaiDoanKhieuNai = (ma) => GIAI_DOAN_KHIEU_NAI[ma] || ma || '—';

const TRANG_THAI_KHIEU_NAI = {
  pending: { nhan: 'Chờ xử lý', mau: 'vang' },
  upheld: { nhan: 'Đã chấp nhận', mau: 'xanh' },
  rejected: { nhan: 'Đã bác bỏ', mau: 'xam' },
};
export const nhanTrangThaiKhieuNai = (ma) => TRANG_THAI_KHIEU_NAI[ma] || { nhan: ma || '—', mau: 'xam' };

const MUC_XU_LY_KHIEU_NAI = {
  none: 'Không xử lý chủ sân',
  warning: 'Đã cảnh cáo chủ sân (lần 1/3)',
  severe_warning: 'Đã cảnh cáo nghiêm trọng chủ sân (lần 2/3)',
  banned: 'Đã khóa tài khoản chủ sân (lần 3/3)',
};
export const nhanMucXuLyKhieuNai = (ma) => MUC_XU_LY_KHIEU_NAI[ma] || '—';
