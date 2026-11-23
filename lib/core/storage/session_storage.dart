import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../models/auth_model.dart';

/// Lưu phiên đăng nhập trên máy (SharedPreferences) để thoát app mở lại
/// vẫn còn đăng nhập. Token JWT hết hạn theo backend (mặc định 7 ngày); hết hạn
/// thì API trả 401 và app tự đăng xuất như bình thường.
class SessionStorage {
  SessionStorage._();

  static const String _key = 'auth_session_v1';

  static Future<void> save(AuthSession session) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _key,
        jsonEncode(<String, dynamic>{
          'token': session.token,
          'userId': session.userId,
          'fullName': session.fullName,
          'email': session.email,
          'phone': session.phone,
          'avatarUrl': session.avatarUrl,
        }),
      );
    } catch (_) {
      // Không lưu được thì chỉ mất tính năng nhớ đăng nhập, không chặn đăng nhập.
    }
  }

  static Future<AuthSession?> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return null;
      final map = (jsonDecode(raw) as Map).cast<String, dynamic>();
      final token = map['token'] as String?;
      if (token == null || token.isEmpty) return null;
      return AuthSession(
        token: token,
        userId: (map['userId'] as num).toInt(),
        fullName: (map['fullName'] as String?) ?? '',
        email: (map['email'] as String?) ?? '',
        phone: (map['phone'] as String?) ?? '',
        avatarUrl: map['avatarUrl'] as String?,
      );
    } catch (_) {
      return null;
    }
  }

  static Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {}
  }
}
