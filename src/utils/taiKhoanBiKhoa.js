// Thông báo hiển thị cho khách / chủ sân khi tài khoản bị admin khóa (đăng nhập hoặc dùng token cũ).
// Lý do do admin nhập lúc khóa (NguoiDung.LyDoKhoa); tài khoản khóa từ dữ liệu cũ không có lý do thì dùng câu mặc định.
const LY_DO_MAC_DINH = 'không tuân thủ quy định của hệ thống';
const MA_LOI_BI_KHOA = 'ACCOUNT_LOCKED';

function thongBaoTaiKhoanBiKhoa(lyDo) {
  const noiDung = typeof lyDo === 'string' && lyDo.trim() ? lyDo.trim() : LY_DO_MAC_DINH;
  return `Tài khoản của bạn bị khóa vì lý do ${noiDung}`;
}

module.exports = { LY_DO_MAC_DINH, MA_LOI_BI_KHOA, thongBaoTaiKhoanBiKhoa };
