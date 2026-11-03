import 'package:flutter/foundation.dart';

/// Trạng thái đăng nhập DEMO lưu trong bộ nhớ (mất khi tắt app).
/// TODO: thay bằng gọi API backend (Node.js) + lưu token an toàn.
class AuthStore extends ChangeNotifier {
  AuthStore._();
  static final AuthStore instance = AuthStore._();

  // Tài khoản demo có sẵn: demo / 123456
  final Map<String, _Account> _accounts = {
    'demo': const _Account(
      password: '123456',
      fullName: 'Người dùng demo',
      email: 'demo@example.com',
    ),
  };

  String? _username;

  bool get isLoggedIn => _username != null;
  String get username => _username ?? '';
  String get displayName =>
      _username == null ? 'Khách' : _accounts[_username]!.fullName;
  String get email => _username == null ? '' : _accounts[_username]!.email;

  /// Trả về thông báo lỗi, hoặc null nếu đăng nhập thành công.
  String? signIn(String username, String password) {
    final account = _accounts[username.trim().toLowerCase()];
    if (account == null || account.password != password) {
      return 'Tên đăng nhập hoặc mật khẩu không đúng.';
    }
    _username = username.trim().toLowerCase();
    notifyListeners();
    return null;
  }

  /// Trả về thông báo lỗi, hoặc null nếu đăng ký thành công (tự đăng nhập).
  String? register({
    required String username,
    required String password,
    required String fullName,
    required String email,
  }) {
    final key = username.trim().toLowerCase();
    if (_accounts.containsKey(key)) {
      return 'Tên đăng nhập đã tồn tại.';
    }
    _accounts[key] = _Account(
      password: password,
      fullName: fullName.trim(),
      email: email.trim(),
    );
    _username = key;
    notifyListeners();
    return null;
  }

  void signOut() {
    _username = null;
    notifyListeners();
  }
}

class _Account {
  final String password;
  final String fullName;
  final String email;

  const _Account({
    required this.password,
    required this.fullName,
    required this.email,
  });
}
