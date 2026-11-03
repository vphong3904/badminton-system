/// Các đường dẫn API khách hàng dùng chung. Backend khác route thì chỉ cần
/// sửa tại đây.
class ApiRoutes {
  ApiRoutes._();

  // Tài khoản
  static const String profile = '/tai-khoan/ca-nhan'; // GET + PATCH
  static const String changePassword = '/tai-khoan/doi-mat-khau'; // POST

  // Lịch đặt của khách
  static const String myBookings = '/khach/dat-san'; // GET

  // Sân yêu thích
  static const String favorites = '/khach/yeu-thich'; // GET danh sách, POST {maCoSo}
  static String favorite(int venueId) => '/khach/yeu-thich/$venueId'; // DELETE
}
