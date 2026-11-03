import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/api_routes.dart';

/// Thông tin phiên đăng nhập của khách hàng.
class AuthSession {
  final String token;
  final int userId;
  final String fullName;
  final String email;
  final String phone;

  const AuthSession({
    required this.token,
    required this.userId,
    required this.fullName,
    required this.email,
    required this.phone,
  });

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    final user = (json['nguoiDung'] as Map).cast<String, dynamic>();
    return AuthSession(
      token: json['maTruyCap'] as String,
      userId: (user['maNguoiDung'] as num).toInt(),
      fullName: (user['hoTen'] as String?) ?? '',
      email: (user['email'] as String?) ?? '',
      phone: (user['soDienThoai'] as String?) ?? '',
    );
  }
}

/// Gọi API tài khoản: `/tai-khoan/*`.
class AuthApi {
  AuthApi._();

  /// Phiên đăng nhập hiện tại (null nếu chưa đăng nhập).
  static AuthSession? current;

  /// Đăng nhập bằng email hoặc tên đăng nhập.
  static Future<AuthSession> login(String account, String password) async {
    final data = await ApiClient.post(
      '/tai-khoan/dang-nhap',
      body: {'tenDangNhap': account.trim(), 'matKhau': password},
    );
    return _startSession(data);
  }

  /// Đăng ký tài khoản khách hàng. Số điện thoại được dùng làm tên đăng nhập
  /// (người dùng vẫn đăng nhập bằng email).
  static Future<AuthSession> register({
    required String fullName,
    required String phone,
    required String email,
    required String password,
  }) async {
    final normalizedPhone = normalizePhone(phone);
    try {
      final data = await ApiClient.post(
        '/tai-khoan/dang-ky',
        body: {
          'tenDangNhap': normalizedPhone,
          'matKhau': password,
          'hoTen': fullName.trim(),
          'soDienThoai': normalizedPhone,
          'email': email.trim().toLowerCase(),
        },
      );
      return _startSession(data);
    } on ApiException catch (error) {
      if (error.isConflict && error.message.contains('Tên đăng nhập')) {
        throw ApiException(
          'Số điện thoại này đã được đăng ký.',
          code: error.code,
          statusCode: error.statusCode,
        );
      }
      rethrow;
    }
  }

  /// Cập nhật số điện thoại của tài khoản đang đăng nhập.
  static Future<void> updatePhone(String phone) async {
    final data = await ApiClient.patch(
      ApiRoutes.profile,
      body: {'soDienThoai': normalizePhone(phone)},
    );
    _mergeUser(data);
  }

  /// Lấy hồ sơ mới nhất từ máy chủ và cập nhật [current].
  static Future<AuthSession?> fetchProfile() async {
    final data = await ApiClient.get(ApiRoutes.profile);
    _mergeUser(data);
    return current;
  }

  /// Lưu hồ sơ (họ tên, số điện thoại, email) lên máy chủ.
  static Future<AuthSession?> updateProfile({
    required String fullName,
    required String phone,
    required String email,
  }) async {
    final data = await ApiClient.patch(
      ApiRoutes.profile,
      body: {
        'hoTen': fullName.trim(),
        'soDienThoai': normalizePhone(phone),
        'email': email.trim().toLowerCase(),
      },
    );
    _mergeUser(data);
    return current;
  }

  /// Đổi mật khẩu (cần mật khẩu cũ).
  static Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    await ApiClient.post(
      ApiRoutes.changePassword,
      body: {'matKhauCu': oldPassword, 'matKhauMoi': newPassword},
    );
  }

  /// Gộp dữ liệu người dùng trả về từ API vào phiên hiện tại.
  static void _mergeUser(dynamic data) {
    final session = current;
    if (session == null || data is! Map) return;
    final map = data.cast<String, dynamic>();
    final user = map['nguoiDung'] is Map
        ? (map['nguoiDung'] as Map).cast<String, dynamic>()
        : map;
    current = AuthSession(
      token: session.token,
      userId: session.userId,
      fullName: (user['hoTen'] as String?) ?? session.fullName,
      email: (user['email'] as String?) ?? session.email,
      phone: (user['soDienThoai'] as String?) ?? session.phone,
    );
  }

  static void signOut() {
    current = null;
    ApiClient.clearToken();
  }

  static AuthSession _startSession(dynamic data) {
    final session = AuthSession.fromJson((data as Map).cast<String, dynamic>());
    ApiClient.setToken(session.token);
    current = session;
    return session;
  }

  /// Chuẩn hóa số điện thoại về dạng `0xxxxxxxxx` như backend yêu cầu.
  /// Chấp nhận `0912345678`, `912345678`, `+84912345678`, `84 912 345 678`.
  static String normalizePhone(String raw) {
    var digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.startsWith('84') && digits.length >= 11) {
      digits = digits.substring(2);
    }
    if (digits.isNotEmpty && !digits.startsWith('0')) digits = '0$digits';
    return digits;
  }

  /// Số điện thoại hợp lệ theo backend: bắt đầu bằng 0, tổng 10–11 chữ số.
  static bool isValidPhone(String raw) {
    return RegExp(r'^0\d{9,10}$').hasMatch(normalizePhone(raw));
  }
}
