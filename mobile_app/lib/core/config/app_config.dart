/// Cấu hình dùng chung của ứng dụng.
class AppConfig {
  AppConfig._();

  static const String appName = 'Badminton Booking';

  /// Địa chỉ API backend (đã gồm tiền tố `/api`).
  ///
  /// Mặc định `10.0.2.2` là máy host khi chạy trên Android Emulator.
  /// Chạy trên điện thoại thật hoặc khi đã triển khai server, truyền địa chỉ
  /// khi build, ví dụ:
  ///   flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );
}
