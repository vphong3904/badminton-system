/// Dữ liệu tài khoản/đăng nhập của khách hàng (không chứa logic màn hình).

/// Thông tin phiên đăng nhập của khách hàng.
class AuthSession {
  final String token;
  final int userId;
  final String fullName;
  final String email;
  final String phone;

  /// Đường dẫn ảnh đại diện trên máy chủ (`/tep-tai-len/avatar/...`); null/ảnh mặc định = hiện chữ cái đầu.
  final String? avatarUrl;

  const AuthSession({
    required this.token,
    required this.userId,
    required this.fullName,
    required this.email,
    required this.phone,
    this.avatarUrl,
  });

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    final user = (json['nguoiDung'] as Map).cast<String, dynamic>();
    return AuthSession(
      token: json['maTruyCap'] as String,
      userId: (user['maNguoiDung'] as num).toInt(),
      fullName: (user['hoTen'] as String?) ?? '',
      email: (user['email'] as String?) ?? '',
      phone: (user['soDienThoai'] as String?) ?? '',
      avatarUrl: user['anhDaiDien'] as String?,
    );
  }
}

/// Kết quả trả về từ màn đăng nhập/đăng ký.
class AuthResult {
  final String email;
  final String fullName;
  final String phone;

  const AuthResult({
    required this.email,
    required this.fullName,
    required this.phone,
  });
}
