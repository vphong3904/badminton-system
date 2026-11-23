import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/validators.dart';
import '../data/auth_api.dart';
import 'auth_flow.dart';
import '../widgets/auth_header.dart';
import '../widgets/auth_submit_button.dart';
import '../widgets/auth_text_field.dart';
import '../../../models/auth_model.dart';

/// Màn ĐĂNG NHẬP (email hoặc số điện thoại + mật khẩu).
/// Lỗi hiển thị theo docs/agent/features/auth/rules.md.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _accountController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _hidePassword = true;
  bool _submitting = false;
  String? _errorMessage;

  // Đăng nhập sai liên tiếp: sai 5 lần thì khoá nút 30 giây.
  int _failedLogins = 0;
  DateTime? _lockedUntil;

  static const Color green = Color(0xFF2FA672);

  @override
  void dispose() {
    _accountController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;

    final lockedUntil = _lockedUntil;
    if (lockedUntil != null && DateTime.now().isBefore(lockedUntil)) {
      final left = lockedUntil.difference(DateTime.now()).inSeconds + 1;
      setState(() => _errorMessage = 'Bạn thử quá nhiều lần. Vui lòng đợi $left giây.');
      return;
    }

    final formState = _formKey.currentState;
    if (formState == null || !formState.validate()) return;

    final account = _accountController.text.trim().toLowerCase();

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      final AuthSession session =
          await AuthApi.login(account, _passwordController.text);
      if (!mounted) return;
      _failedLogins = 0;
      Navigator.of(context).pop(
        AuthResult(
          email: session.email,
          fullName: session.fullName,
          phone: session.phone,
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      _showServerError(error);
    } catch (_) {
      if (!mounted) return;
      setState(() => _errorMessage = 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showServerError(ApiException error) {
    String? message;

    if (error.isUnauthorized) {
      _failedLogins++;
      if (_failedLogins >= 5) {
        _failedLogins = 0;
        _lockedUntil = DateTime.now().add(const Duration(seconds: 30));
      }
      message = error.message;
      _passwordController.clear();
    } else if (error.isForbidden && error.message.contains('khóa')) {
      message = 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.';
    } else if (error.isForbidden && error.message.contains('nền tảng')) {
      message =
          'Tài khoản này dùng cho trang quản lý, không đăng nhập được trên ứng dụng.';
    } else {
      message = error.message;
    }

    setState(() => _errorMessage = message);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F9F4),
      appBar: AppBar(
        title: const Text('Đăng nhập'),
        backgroundColor: Colors.white,
        foregroundColor: AppTheme.ink,
        elevation: 0,
        centerTitle: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AuthHeader(
                  title: 'CHÀO MỪNG TRỞ LẠI',
                  subtitle: 'Đăng nhập để tiếp tục sử dụng dịch vụ.',
                ),
                AuthTextField(
                  controller: _accountController,
                  label: 'Email',
                  icon: Icons.account_circle_outlined,
                  keyboardType: TextInputType.emailAddress,
                  maxLength: 120,
                  formatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
                  validator: Validators.email,
                ),
                const SizedBox(height: 14),
                AuthTextField(
                  controller: _passwordController,
                  label: 'Mật khẩu',
                  icon: Icons.lock_outline,
                  obscureText: _hidePassword,
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _hidePassword = !_hidePassword),
                    icon: Icon(
                      _hidePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                  maxLength: 72,
                  validator: Validators.loginPassword,
                ),
                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _errorMessage!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppTheme.danger, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 24),
                AuthSubmitButton(
                  label: 'ĐĂNG NHẬP',
                  submitting: _submitting,
                  onPressed: _submit,
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(AuthSwitch.toRegister),
                  child: const Text(
                    'Chưa có tài khoản? Đăng ký',
                    style: TextStyle(color: green, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
