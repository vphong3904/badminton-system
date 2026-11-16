/** API quản trị (cần token admin): hồ sơ chủ sân, hoàn tiền, rút tiền, SePay, nhật ký */
import { goiApi } from './client';

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

/** C3 */
export const hoanTatHoanTien = (maThanhToan, maGiaoDichHoan) =>
  goiApi(`/api/quan-tri/hoan-tien/${maThanhToan}/hoan-tat`, {
    phuongThuc: 'PATCH',
    body: { maGiaoDichHoan },
  });

/** D1 */
export const layHangDoiRutTien = () => goiApi('/api/quan-tri/rut-tien');

/** D2 */
export const xacNhanDaChi = (maYeuCau, maGiaoDich) =>
  goiApi(`/api/quan-tri/rut-tien/${maYeuCau}/da-chi`, {
    phuongThuc: 'PATCH',
    body: { maGiaoDich },
  });

/** D3 */
export const tuChoiRutTien = (maYeuCau, lyDoTuChoi) =>
  goiApi(`/api/quan-tri/rut-tien/${maYeuCau}/tu-choi`, {
    phuongThuc: 'PATCH',
    body: { lyDoTuChoi },
  });

/** E1 */
export const layGiaoDichSepayChuaKhop = () => goiApi('/api/quan-tri/giao-dich/sepay');

/** F1 – tuNgay, denNgay dạng YYYY-MM-DD; gioiHan 1–100 */
export const layNhatKy = ({ tuNgay, denNgay, gioiHan } = {}) =>
  goiApi('/api/quan-tri/nhat-ky', { truyVan: { tuNgay, denNgay, gioiHan } });
