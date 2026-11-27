import { GENERIC_LOGIN_ERROR } from './xacThuc.js'

// Ảnh do backend lưu ở /tep-tai-len/... nên ghép với địa chỉ backend
export function fileUrl(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : `${API_URL}${path}`
}


// Tải ảnh bìa cơ sở lên (API có sẵn POST /api/chu-san/co-so/anh, multipart, trường tepAnh)
// Gửi multipart (ảnh) tới API có sẵn, trả về phần duLieu
export async function postMultipart(token, path, body) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }
  if (!res.ok || !payload?.thanhCong) {
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Có lỗi xảy ra, vui lòng thử lại.', payload?.loi?.chiTiet)
  }
  return payload.duLieu
}


export async function uploadAvatarImage(token, file) {
  const body = new FormData()
  body.append('tepAnh', file)
  let res
  try {
    res = await fetch(`${API_URL}/api/tai-khoan/ca-nhan/anh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }
  if (!res.ok || !payload?.thanhCong) {
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Không tải được ảnh lên.', payload?.loi?.chiTiet)
  }
  return payload.duLieu
}


export async function uploadBranchImage(token, file, maCoSo) {
  const body = new FormData()
  body.append('tepAnh', file)
  let res
  try {
    res = await fetch(`${API_URL}/api/chu-san/co-so/${maCoSo ? `${maCoSo}/` : ''}anh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }
  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }
  if (!res.ok || !payload?.thanhCong) {
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Không tải được ảnh lên.', payload?.loi?.chiTiet)
  }
  return payload.duLieu
}


/* ============================================================
   Kết nối API đăng nhập / đăng ký (web người quản lý)
   - Backend: /api/tai-khoan/dang-nhap-web, /api/tai-khoan/dang-ky-chu-san
   - Đổi địa chỉ backend bằng biến VITE_API_URL (mặc định http://localhost:3000)
   ============================================================ */

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')


export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}


// Gọi API, trả về phần "duLieu" khi thành công, ném ApiError khi thất bại
export async function callApi(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Vui lòng thử lại sau.')
  }

  let payload = null
  try {
    payload = await res.json()
  } catch {
    // phản hồi không phải JSON
  }

  if (!res.ok || !payload?.thanhCong) {
    // Đang đăng nhập mà token hết hạn / không hợp lệ → báo cho App đưa về trang đăng nhập
    if (res.status === 401 && token) window.dispatchEvent(new Event('session-expired'))
    throw new ApiError(res.status, payload?.loi?.thongBao || 'Có lỗi xảy ra, vui lòng thử lại.', payload?.loi?.chiTiet, payload?.loi?.maLoi)
  }
  return payload.duLieu
}


// GET /api/chu-san/co-so hiện trả về DANH SÁCH cơ sở của chủ sân (backend mới); các trang hiện làm việc với
// cơ sở đầu tiên như trước, nên lấy phần tử đầu (vẫn tương thích nếu backend trả về một đối tượng).
async function fetchCoSo(token) {
  const data = await callApi('/api/chu-san/co-so', { token })
  return Array.isArray(data) ? data[0] ?? null : data
}


export async function loginApi(email, password) {
  try {
    return await callApi('/api/tai-khoan/dang-nhap-web', {
      method: 'POST',
      body: { email, matKhau: password }, // backend mới đăng nhập bằng trường `email` (không còn tenDangNhap)
    })
  } catch (err) {
    if (err.status === 400 || err.status === 401) throw new ApiError(401, GENERIC_LOGIN_ERROR)
    throw err
  }
}


// Backend mới đăng ký bằng email (không còn tenDangNhap).
export async function registerApi(form) {
  return callApi('/api/tai-khoan/dang-ky-chu-san', {
    method: 'POST',
    body: {
      hoTen: form.name,
      soDienThoai: form.phone.replace(/\s/g, ''),
      email: form.email,
      matKhau: form.password,
      tenDoanhNghiep: form.company,
      // API đăng ký chủ sân nhận luôn tài khoản nhận tiền: chỉ gửi mã ngân hàng (VD: VCB), BE tự lấy tên
      maNganHang: form.bankCode,
      soTaiKhoan: form.accountNumber,
      xacNhanMatKhau: form.confirm,
    },
  })
}


// Thông báo lỗi từ API (kèm chi tiết từng trường nếu có)
export function describeApiError(err) {
  const first = err.details?.[0]
  return first?.thongBao && first.thongBao !== err.message ? `${err.message}: ${first.thongBao}` : err.message
}
