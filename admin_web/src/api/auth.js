/** API tài khoản: đăng nhập web và lấy thông tin cá nhân */
import { goiApi } from './client';

/**
 * A1 – Đăng nhập web bằng EMAIL (backend mới không còn tên đăng nhập).
 * coToken = false để lỗi 401 (sai mật khẩu) không bị coi là hết phiên
 */
export const dangNhapWeb = (email, matKhau) =>
  goiApi('/api/tai-khoan/dang-nhap-web', {
    phuongThuc: 'POST',
    body: { email, matKhau },
    coToken: false,
  });

/** A2 – Lấy thông tin người dùng hiện tại (dùng để khôi phục phiên) */
export const layCaNhan = () => goiApi('/api/tai-khoan/ca-nhan');
