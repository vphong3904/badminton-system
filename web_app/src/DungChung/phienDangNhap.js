import { nowMs } from './thoiGian.js'

/* ============================================================
   App (mặc định hiện trang đăng nhập)
   ============================================================ */

// Phiên đăng nhập: token của backend (JWT) sống 7 ngày. Lưu trong localStorage nên đóng trang / tải lại trang vẫn
// còn đăng nhập, chỉ thoát khi bấm Đăng xuất, token hết hạn hoặc backend trả 401. Không có thoát do chờ lâu.
// (Backend chưa có API làm mới token, nên token không tự đổi sau 15 phút.)
const SESSION_KEY = 'chu-san-phien-dang-nhap'


export function jwtExpiry(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).exp * 1000
  } catch {
    return 0
  }
}

export function saveSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } catch {
    // bộ nhớ trình duyệt đầy / bị chặn: bỏ qua, vẫn dùng được trong phiên hiện tại
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // bỏ qua
  }
}

export function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY))
    if (saved?.maTruyCap && saved.vaiTro === 'owner' && jwtExpiry(saved.maTruyCap) > nowMs()) return saved
  } catch {
    // dữ liệu hỏng: coi như chưa đăng nhập
  }
  clearSession()
  return null
}
