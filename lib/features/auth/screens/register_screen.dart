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
import '../widgets/password_strength_bar.dart';

/// Màn ĐĂNG KÝ tài khoản khách hàng.
/// Lỗi hiển thị theo docs/agent/features/auth/rules.md.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  bool _hidePassword = true;
  bool _hideConfirm = true;
  bool _submitting = false;
  bool _agreedTerms = false;
  String? _errorMessage;

  // Lỗi do backend báo (trùng email) hiển thị ngay dưới ô tương ứng.
  String? _emailServerError;

  // Email đã bị báo trùng trong phiên này: nhập lại đúng giá trị đó thì
  // báo luôn, không gửi lên máy chủ nữa.
  final Set<String> _takenEmails = {};

  static const Color green = Color(0xFF2FA672);
  static const String _emailTaken =
      'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.';

  @override
  void initState() {
    super.initState();
    // Sửa lại ô nào thì bỏ lỗi do máy chủ báo ở ô đó.
    _emailController.addListener(() {
      if (_emailServerError != null) setState(() => _emailServerError = null);
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;

    final formState = _formKey.currentState;
    if (formState == null || !formState.validate()) return;

    if (!_agreedTerms) {
      setState(() => _errorMessage = 'Vui lòng đồng ý Điều khoản và Chính sách bảo mật.');
      return;
    }

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      final AuthSession session = await AuthApi.register(
        fullName: _nameController.text,
        phone: _phoneController.text,
        email: _emailController.text.trim().toLowerCase(),
        password: _passwordController.text,
      );
      if (!mounted) return;
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

  void _markEmailTaken() {
    _takenEmails.add(_emailController.text.trim().toLowerCase());
    _emailServerError = _emailTaken;
  }

  void _showServerError(ApiException error) {
    String? formMessage;

    if (error.code == 'EMAIL_EXISTS') {
      _markEmailTaken();
    } else if (error.isConflict) {
      // Máy chủ cũ chưa có mã lỗi riêng: nhận biết theo nội dung.
      if (error.message.contains('Email')) {
        _markEmailTaken();
      } else {
        formMessage = error.message;
      }
    } else if (error.isForbidden && error.message.contains('khóa')) {
      formMessage = 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.';
    } else if (error.isForbidden && error.message.contains('nền tảng')) {
      formMessage =
          'Tài khoản này dùng cho trang quản lý, không đăng nhập được trên ứng dụng.';
    } else {
      formMessage = error.message;
    }

    setState(() => _errorMessage = formMessage);
    if (_emailServerError != null) {
      _formKey.currentState?.validate();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF1F9F4),
      appBar: AppBar(
        title: const Text('Đăng ký tài khoản'),
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
                  title: 'TẠO TÀI KHOẢN',
                  subtitle: 'Đăng ký để bắt đầu đặt sân cầu lông.',
                ),
                AuthTextField(
                  controller: _nameController,
                  label: 'Họ và tên',
                  icon: Icons.person_outline,
                  validator: Validators.fullName,
                  maxLength: 100,
                ),
                const SizedBox(height: 14),
                AuthTextField(
                  controller: _phoneController,
                  label: 'Số điện thoại',
                  icon: Icons.phone_outlined,
                  keyboardType: TextInputType.phone,
                  maxLength: 10,
                  formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]'))],
                  validator: (value) {
                    return Validators.mobilePhone(value);
                  },
                ),
                const SizedBox(height: 14),
                AuthTextField(
                  controller: _emailController,
                  label: 'Email',
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                  maxLength: 120,
                  formatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
                  validator: (value) {
                    final basic = Validators.email(value);
                    if (basic != null) return basic;
                    if (_takenEmails.contains((value ?? '').trim().toLowerCase())) {
                      return _emailTaken;
                    }
                    return _emailServerError;
                  },
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
                  maxLength: 64,
                  onChanged: (_) => setState(() {}),
                  validator: Validators.newPassword,
                ),
                const SizedBox(height: 8),
                PasswordStrengthBar(
                  strength: Validators.passwordStrength(_passwordController.text),
                ),
                const SizedBox(height: 14),
                AuthTextField(
                  controller: _confirmController,
                  label: 'Xác nhận mật khẩu',
                  icon: Icons.lock_reset,
                  obscureText: _hideConfirm,
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _hideConfirm = !_hideConfirm),
                    icon: Icon(
                      _hideConfirm
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                  maxLength: 64,
                  validator: (value) =>
                      Validators.confirmPassword(value, _passwordController.text),
                ),
                const SizedBox(height: 6),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  dense: true,
                  activeColor: AppTheme.primaryColor,
                  value: _agreedTerms,
                  onChanged: (v) => setState(() {
                    _agreedTerms = v ?? false;
                    _errorMessage = null;
                  }),
                  title: const Text(
                    'Tôi đồng ý Điều khoản sử dụng và Chính sách bảo mật.',
                    style: TextStyle(fontSize: 13, color: AppTheme.hintGrey),
                  ),
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
                  label: 'ĐĂNG KÝ',
                  submitting: _submitting,
                  onPressed: _submit,
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(AuthSwitch.toLogin),
                  child: const Text(
                    'Đã có tài khoản? Đăng nhập',
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
