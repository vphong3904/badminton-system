/** API quản trị (cần token admin): hồ sơ chủ sân, hoàn tiền, nhật ký */
import { goiApi, goiApiTaiTep } from './client';

/** B1 */
export const layHoSoChoDuyet = () => goiApi('/api/quan-tri/chu-san/cho-duyet');

/** B2 – trangThai: 'approved' | 'rejected'; lyDoTuChoi bắt buộc khi từ chối */
export const duyetHoSoChuSan = (maNguoiDung, { trangThai, lyDoTuChoi }) =>
  goiApi(`/api/quan-tri/chu-san/${maNguoiDung}/duyet`, {
    phuongThuc: 'PATCH',
    body: lyDoTuChoi ? { trangThai, lyDoTuChoi } : { trangThai },
  });

/** C1 */
export const layHangDoiHoanTien = () => goiApi('/api/quan-tri/hoan-tien');

/** C2 */
export const xuLyHoanTien = (maThanhToan) =>
  goiApi(`/api/quan-tri/hoan-tien/${maThanhToan}/xu-ly`, { phuongThuc: 'PATCH' });

/** C3 – G4: chứng từ hoàn là ẢNH (multipart `anhChungTu`, bắt buộc), không còn mã giao dịch */
export const hoanTatHoanTien = (maThanhToan, anhChungTu) => {
  const formData = new FormData();
  formData.append('anhChungTu', anhChungTu);
  return goiApiTaiTep(`/api/quan-tri/hoan-tien/${maThanhToan}/hoan-tat`, { phuongThuc: 'PATCH', formData });
};

/** F1 – tuNgay, denNgay dạng YYYY-MM-DD; gioiHan 1–100 */
export const layNhatKy = ({ tuNgay, denNgay, gioiHan } = {}) =>
  goiApi('/api/quan-tri/nhat-ky', { truyVan: { tuNgay, denNgay, gioiHan } });

/** G1 – Tài khoản khách / chủ sân. vaiTro: 'customer' | 'owner'; trangThai: 'active' | 'locked' | 'all' */
export const layNguoiDung = ({ vaiTro, trangThai, tuKhoa, trang, soLuong }) =>
  goiApi('/api/quan-tri/nguoi-dung', { truyVan: { vaiTro, trangThai, tuKhoa, trang, soLuong } });

/** G2 – Khóa tài khoản, lyDo bắt buộc (hiện cho người dùng khi đăng nhập) */
export const khoaTaiKhoan = (maNguoiDung, lyDo) =>
  goiApi(`/api/quan-tri/nguoi-dung/${maNguoiDung}/khoa`, { phuongThuc: 'PATCH', body: { lyDo } });

/** G3 */
export const moKhoaTaiKhoan = (maNguoiDung) =>
  goiApi(`/api/quan-tri/nguoi-dung/${maNguoiDung}/mo-khoa`, { phuongThuc: 'PATCH' });

/** H1 – Khiếu nại của khách. trangThai: 'pending' | 'upheld' | 'rejected' | 'all'; gioiHan 1–100 */
export const layKhieuNai = ({ trangThai = 'pending', gioiHan = 100 } = {}) =>
  goiApi('/api/quan-tri/khieu-nai', { truyVan: { trangThai, gioiHan } });

/** H2 – quyetDinh: 'upheld' | 'rejected'; ghiChu bắt buộc khi bác bỏ (3–500 ký tự) */
export const xuLyKhieuNai = (maKhieuNai, { quyetDinh, ghiChu }) =>
  goiApi(`/api/quan-tri/khieu-nai/${maKhieuNai}/xu-ly`, {
    phuongThuc: 'PATCH',
    body: ghiChu ? { quyetDinh, ghiChu } : { quyetDinh },
  });

/** I1 – Danh sách cơ sở kèm điểm và số đánh giá */
export const layDanhSachCoSo = (tuKhoa) => goiApi('/api/quan-tri/co-so', { truyVan: { tuKhoa } });

/** I2 – Đánh giá. trangThai: 'hien' | 'an' | 'all'; soSao 1–5; soLuong 1–50 */
export const layDanhGia = ({ maCoSo, trangThai, soSao, trang, soLuong }) =>
  goiApi('/api/quan-tri/danh-gia', { truyVan: { maCoSo, trangThai, soSao, trang, soLuong } });

/** I3 – an = true: xóa (ẩn khỏi app, bắt buộc lyDo 3–255 ký tự) · an = false: khôi phục */
export const anHienDanhGia = (maDanhGia, { an, lyDo }) =>
  goiApi(`/api/quan-tri/danh-gia/${maDanhGia}/an`, {
    phuongThuc: 'PATCH',
    body: lyDo ? { an, lyDo } : { an },
  });

/** J1 – Đơn khách đã gửi ảnh chuyển khoản, đợi xác nhận. quaHan: true | false | bỏ trống = tất cả (quá hạn đã xếp lên đầu) */
export const layDonChoXacNhan = ({ quaHan } = {}) =>
  goiApi('/api/quan-tri/dat-san/cho-xac-nhan', { truyVan: { quaHan } });

/** J2 – Admin xác nhận đã nhận tiền */
export const xacNhanThanhToan = (maDatSan) =>
  goiApi(`/api/quan-tri/dat-san/${maDatSan}/xac-nhan-thanh-toan`, { phuongThuc: 'POST' });

/** J3 – Từ chối thanh toán, lyDo bắt buộc 2–255 ký tự (đơn quay về chờ thanh toán, giữ chỗ lại) */
export const tuChoiThanhToan = (maDatSan, lyDo) =>
  goiApi(`/api/quan-tri/dat-san/${maDatSan}/tu-choi-thanh-toan`, { phuongThuc: 'POST', body: { lyDo } });
