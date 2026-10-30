class AppError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(m = 'Dữ liệu không hợp lệ', d) { return new AppError(400, m, 'BAD_REQUEST', d); }
  static unauthorized(m = 'Chưa đăng nhập') { return new AppError(401, m, 'UNAUTHORIZED'); }
  static forbidden(m = 'Không có quyền truy cập') { return new AppError(403, m, 'FORBIDDEN'); }
  static notFound(m = 'Không tìm thấy') { return new AppError(404, m, 'NOT_FOUND'); }
  static conflict(m = 'Dữ liệu bị trùng') { return new AppError(409, m, 'CONFLICT'); }
}
module.exports = AppError;
