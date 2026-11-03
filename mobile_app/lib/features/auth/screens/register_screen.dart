import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/state/auth_store.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';
import 'package:flutter_application_1/features/auth/widgets/auth_widgets.dart';

/// Màn hình đăng ký. Trả về `true` qua Navigator.pop nếu đăng ký thành công.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _fullName = TextEditingController();
  final _email = TextEditingController();

  bool _obscure = true;
  bool _agreed = false;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _fullName.dispose();
    _email.dispose();
    super.dispose();
  }

  void _submit() {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    final error = AuthStore.instance.register(
      username: _username.text,
      password: _password.text,
      fullName: _fullName.text,
      email: _email.text,
    );

    if (error != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error)));
      return;
    }

    Navigator.pop(context, true);
  }

  void _showPolicy() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Chính sách bảo mật'),
        content: const SingleChildScrollView(
          child: Text(
            'Chúng tôi chỉ thu thập thông tin cần thiết để tạo tài khoản và '
            'xử lý đặt sân (họ tên, email, lịch đặt). Thông tin không được '
            'bán cho bên thứ ba. Bạn có thể yêu cầu xóa tài khoản bất cứ lúc '
            'nào.\n\n(Nội dung mẫu – thay bằng chính sách thực tế của ứng dụng.)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Đóng'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          child: Form(
            key: _formKey,
            child: Column(
              children: [
                Row(
                  children: [
                    const AuthBackButton(),
                    const Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(right: 52),
                        child: Text(
                          'Đăng kí tài khoản',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 44),
                AuthTextField(
                  controller: _username,
                  hint: 'Tên đăng nhập',
                  textInputAction: TextInputAction.next,
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    if (value.length < 4) {
                      return 'Tên đăng nhập tối thiểu 4 ký tự';
                    }
                    if (!RegExp(r'^[a-zA-Z0-9_.]+$').hasMatch(value)) {
                      return 'Chỉ dùng chữ không dấu, số, dấu . và _';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                AuthTextField(
                  controller: _password,
                  hint: 'Mật khẩu',
                  obscure: _obscure,
                  textInputAction: TextInputAction.next,
                  validator: (v) => (v == null || v.length < 6)
                      ? 'Mật khẩu tối thiểu 6 ký tự'
                      : null,
                  suffix: IconButton(
                    tooltip: _obscure ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                      color: Colors.black87,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                const SizedBox(height: 16),
                AuthTextField(
                  controller: _fullName,
                  hint: 'Họ và tên',
                  textInputAction: TextInputAction.next,
                  validator: (v) => (v == null || v.trim().length < 2)
                      ? 'Vui lòng nhập họ và tên'
                      : null,
                ),
                const SizedBox(height: 16),
                AuthTextField(
                  controller: _email,
                  hint: 'Email',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  validator: (v) {
                    final value = v?.trim() ?? '';
                    final ok = RegExp(
                      r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                    ).hasMatch(value);
                    return ok ? null : 'Email không hợp lệ';
                  },
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    Checkbox(
                      value: _agreed,
                      shape: const CircleBorder(),
                      activeColor: const Color(0xFF5B7490),
                      onChanged: (value) =>
                          setState(() => _agreed = value ?? false),
                    ),
                    Expanded(
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          const Text(
                            'Tôi đã đọc và đồng ý với ',
                            style: TextStyle(
                              fontSize: 16,
                              color: AppTheme.hintGrey,
                            ),
                          ),
                          GestureDetector(
                            onTap: _showPolicy,
                            child: const Text(
                              'Chính sách bảo mật',
                              style: TextStyle(
                                fontSize: 16,
                                color: AppTheme.accentBlue,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                AuthPrimaryButton(
                  label: 'Đăng ký',
                  onPressed: _agreed ? _submit : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
