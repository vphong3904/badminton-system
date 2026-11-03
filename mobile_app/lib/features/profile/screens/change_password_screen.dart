import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/auth_api.dart';

const _green = Color(0xFF16845B);

/// Đổi mật khẩu qua API `/tai-khoan/doi-mat-khau`.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _old = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();

  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _old.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_saving) return;

    if (_old.text.isEmpty) {
      setState(() => _error = 'Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (_new.text.length < 6) {
      setState(() => _error = 'Mật khẩu mới tối thiểu 6 ký tự.');
      return;
    }
    if (_new.text != _confirm.text) {
      setState(() => _error = 'Xác nhận mật khẩu không khớp.');
      return;
    }
    if (!ApiClient.hasToken) {
      setState(() => _error = 'Vui lòng đăng nhập để đổi mật khẩu.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await AuthApi.changePassword(
        oldPassword: _old.text,
        newPassword: _new.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đổi mật khẩu thành công.')),
      );
      Navigator.pop(context);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Không thể đổi mật khẩu. Vui lòng thử lại.';
      });
    }
  }

  Widget _field(TextEditingController controller, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        obscureText: true,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đổi mật khẩu')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _field(_old, 'Mật khẩu hiện tại'),
          _field(_new, 'Mật khẩu mới'),
          _field(_confirm, 'Xác nhận mật khẩu mới'),
          if (_error != null) ...[
            Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 12),
          ],
          FilledButton(
            onPressed: _saving ? null : _submit,
            style: FilledButton.styleFrom(backgroundColor: _green),
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Đổi mật khẩu'),
          ),
        ],
      ),
    );
  }
}
