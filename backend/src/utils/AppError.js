class AppError extends Error {
  constructor(maTrangThai, thongBao, maLoi, chiTiet) {
    super(thongBao);
    this.maTrangThai = maTrangThai;
    this.maLoi = maLoi;
    this.chiTiet = chiTiet;
  }
  static duLieuKhongHopLe(thongBao = 'Dữ liệu không hợp lệ', chiTiet) {
    return new AppError(400, thongBao, 'BAD_REQUEST', chiTiet);
  }
  static chuaDangNhap(thongBao = 'Chưa đăng nhập') {
    return new AppError(401, thongBao, 'UNAUTHORIZED');
  }
  static khongDuQuyen(thongBao = 'Không có quyền truy cập') {
    return new AppError(403, thongBao, 'FORBIDDEN');
  }
  static khongTimThay(thongBao = 'Không tìm thấy') {
    return new AppError(404, thongBao, 'NOT_FOUND');
  }
  static biTrung(thongBao = 'Dữ liệu bị trùng') {
    return new AppError(409, thongBao, 'CONFLICT');
  }
}
module.exports = AppError;
