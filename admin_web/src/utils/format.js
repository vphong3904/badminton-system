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

const NHAN_HANH_DONG = {
  duyet_chu_san: 'Duyệt hồ sơ chủ sân',
  tu_choi_chu_san: 'Từ chối hồ sơ chủ sân',
  cho_khach_cap_nhat_tai_khoan_hoan: 'Yêu cầu khách bổ sung tài khoản hoàn',
  xu_ly_hoan_tien: 'Duyệt xử lý hoàn tiền',
  hoan_tat_hoan_tien: 'Hoàn tất hoàn tiền',
  xac_nhan_chi_tien: 'Xác nhận chi tiền cho chủ sân',
  tu_choi_rut_tien: 'Từ chối rút tiền',
};
/** Mã lạ hiện nguyên giá trị */
export const nhanHanhDong = (ma) => NHAN_HANH_DONG[ma] || ma || '—';

const TRANG_THAI_DOI_SOAT = {
  unmatched: { nhan: 'Không khớp đơn', mau: 'do' },
  amount_mismatch: { nhan: 'Sai số tiền', mau: 'vang' },
  late: { nhan: 'Chuyển trễ', mau: 'vang' },
};
export const nhanTrangThaiDoiSoat = (ma) =>
  TRANG_THAI_DOI_SOAT[ma] || { nhan: ma || '—', mau: 'xam' };

const TRANG_THAI_HOAN_TIEN = {
  none: { nhan: 'Chưa yêu cầu hoàn', mau: 'xam' },
  waiting_info: { nhan: 'Chờ thông tin tài khoản', mau: 'vang' },
  processing: { nhan: 'Chờ chuyển khoản hoàn', mau: 'xanhDuong' },
  refunded: { nhan: 'Đã hoàn tiền', mau: 'xanh' },
};
export const nhanTrangThaiHoanTien = (ma) =>
  TRANG_THAI_HOAN_TIEN[ma] || { nhan: ma || '—', mau: 'xam' };

const TRANG_THAI_THANH_TOAN = {
  late_payment: { nhan: 'Thanh toán trễ', mau: 'vang' },
};
export const nhanTrangThaiThanhToan = (ma) =>
  TRANG_THAI_THANH_TOAN[ma] || { nhan: ma || '—', mau: 'xam' };

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD */
const homNayVietNam = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** Số ngày lịch đã chờ kể từ ngày yêu cầu (giờ Việt Nam). Chuỗi không hợp lệ trả null */
export function soNgayCho(chuoiNgay) {
  if (!chuoiNgay) return null;
  const phanNgay = String(chuoiNgay).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(phanNgay)) return null;
  const moc = (ngay) => Date.parse(`${ngay}T00:00:00Z`);
  return Math.max(0, Math.round((moc(homNayVietNam()) - moc(phanNgay)) / 86400000));
}

/** 0 -> "Hôm nay", 3 -> "3 ngày", null -> "—" */
export const nhanThoiGianCho = (soNgay) =>
  soNgay === null || soNgay === undefined ? '—' : soNgay === 0 ? 'Hôm nay' : `${soNgay} ngày`;
