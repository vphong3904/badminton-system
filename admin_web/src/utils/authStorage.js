/** Lưu, đọc, xóa token đăng nhập. Đây là nơi duy nhất được đụng tới localStorage / sessionStorage */
const KHOA_TOKEN = 'maTruyCap';

export function xoaToken() {
  try {
    localStorage.removeItem(KHOA_TOKEN);
    sessionStorage.removeItem(KHOA_TOKEN);
  } catch {
    // Trình duyệt chặn lưu trữ: bỏ qua
  }
}

/** ghiNho = true: giữ sau khi đóng trình duyệt (localStorage); false: chỉ trong phiên (sessionStorage) */
export function luuToken(token, ghiNho) {
  xoaToken();
  try {
    (ghiNho ? localStorage : sessionStorage).setItem(KHOA_TOKEN, token);
  } catch {
    // Trình duyệt chặn lưu trữ: người dùng sẽ phải đăng nhập lại khi tải trang
  }
}

export function layToken() {
  try {
    return localStorage.getItem(KHOA_TOKEN) || sessionStorage.getItem(KHOA_TOKEN) || null;
  } catch {
    return null;
  }
}
