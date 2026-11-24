/** Lớp gọi API chung: gắn token, bóc duLieu, chuẩn hóa lỗi. Đây là nơi duy nhất gọi fetch */
import { layToken } from '../utils/authStorage';

// Chưa đặt VITE_API_URL thì mặc định trỏ backend chạy local (cổng 3000); bỏ dấu / cuối nếu có.
const GOC_API = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

let khiHetPhien = () => {};
export const datHamKhiHetPhien = (ham) => {
  khiHetPhien = ham;
};

/** Ghép đường dẫn tệp tương đối từ API (vd /uploads/...) thành URL đầy đủ để hiện ảnh */
export const duongDanTep = (duongDan) => {
  if (!duongDan) return '';
  return /^https?:/i.test(duongDan) ? duongDan : `${GOC_API}${duongDan}`;
};

export class LoiApi extends Error {
  constructor({ maTrangThai, maLoi, thongBao, chiTiet }) {
    super(thongBao);
    this.maTrangThai = maTrangThai;
    this.maLoi = maLoi;
    this.chiTiet = chiTiet;
  }
}

/** Gửi tệp (multipart). Không đặt Content-Type để trình duyệt tự thêm boundary. */
export async function goiApiTaiTep(duongDan, { phuongThuc = 'POST', formData } = {}) {
  const tieuDe = {};
  const token = layToken();
  if (token) tieuDe.Authorization = `Bearer ${token}`;

  let phanHoi;
  try {
    phanHoi = await fetch(`${GOC_API}${duongDan}`, { method: phuongThuc, headers: tieuDe, body: formData });
  } catch {
    throw new LoiApi({ maTrangThai: 0, maLoi: 'NETWORK', thongBao: 'Không kết nối được máy chủ' });
  }
  const duLieuJson = await phanHoi.json().catch(() => null);
  if (!phanHoi.ok || !duLieuJson?.thanhCong) {
    const loi = duLieuJson?.loi || {};
    if (phanHoi.status === 401) khiHetPhien();
    throw new LoiApi({
      maTrangThai: phanHoi.status,
      maLoi: loi.maLoi || 'UNKNOWN',
      thongBao: loi.thongBao || 'Có lỗi xảy ra',
      chiTiet: loi.chiTiet,
    });
  }
  return duLieuJson.duLieu;
}

export async function goiApi(duongDan, { phuongThuc = 'GET', body, coToken = true, truyVan } = {}) {
  const chuoiTruyVan = truyVan
    ? (() => {
        const thamSo = new URLSearchParams(
          Object.entries(truyVan).filter(([, giaTri]) => giaTri !== '' && giaTri != null),
        ).toString();
        return thamSo ? `?${thamSo}` : '';
      })()
    : '';

  const tieuDe = { 'Content-Type': 'application/json' };
  const token = coToken ? layToken() : null;
  if (token) tieuDe.Authorization = `Bearer ${token}`;

  let phanHoi;
  try {
    phanHoi = await fetch(`${GOC_API}${duongDan}${chuoiTruyVan}`, {
      method: phuongThuc,
      headers: tieuDe,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new LoiApi({ maTrangThai: 0, maLoi: 'NETWORK', thongBao: 'Không kết nối được máy chủ' });
  }

  const duLieuJson = await phanHoi.json().catch(() => null);
  if (!phanHoi.ok || !duLieuJson?.thanhCong) {
    const loi = duLieuJson?.loi || {};
    if (phanHoi.status === 401 && coToken) khiHetPhien();
    throw new LoiApi({
      maTrangThai: phanHoi.status,
      maLoi: loi.maLoi || 'UNKNOWN',
      thongBao: loi.thongBao || 'Có lỗi xảy ra',
      chiTiet: loi.chiTiet,
    });
  }
  return duLieuJson.duLieu;
}
