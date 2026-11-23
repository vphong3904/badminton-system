import 'package:flutter/material.dart';
import 'login_screen.dart';
import 'register_screen.dart';
import '../../../models/auth_model.dart';

/// Màn đăng nhập/đăng ký yêu cầu chuyển sang màn kia.
enum AuthSwitch { toLogin, toRegister }

/// Mở màn đăng nhập (hoặc đăng ký nếu [initialRegister]).
/// Trả về [AuthResult] khi thành công, null nếu người dùng đóng màn.
Future<AuthResult?> showAuthPage({
  required BuildContext context,
  bool initialRegister = false,
}) async {
  var register = initialRegister;
  while (true) {
    final result = await Navigator.of(context).push<Object?>(
      MaterialPageRoute<Object?>(
        fullscreenDialog: true,
        builder: (_) =>
            register ? const RegisterScreen() : const LoginScreen(),
      ),
    );
    if (result is AuthResult) return result;
    if (result == AuthSwitch.toRegister) {
      register = true;
    } else if (result == AuthSwitch.toLogin) {
      register = false;
    } else {
      return null;
    }
    if (!context.mounted) return null;
  }
}
