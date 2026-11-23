import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../data/auth_api.dart';
import '../../../core/utils/validators.dart';
import '../../../shared/confirm_dialog.dart';

const _green = Color(0xFF2FA672);

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
  final Set<TextEditingController> _shown = {};

  @override
  void dispose() {
    _old.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  bool get _dirty =>
      _old.text.isNotEmpty || _new.text.isNotEmpty || _confirm.text.isNotEmpty;

  Future<void> _confirmDiscard() async {
    if (_saving) return;
    final leave = await showConfirmDialog(
      context,
      title: 'Bỏ thay đổi?',
      message: 'Bạn đã nhập mật khẩu nhưng chưa lưu. Thoát bây giờ sẽ mất dữ liệu đã nhập.',
      confirmLabel: 'Thoát',
      cancelLabel: 'Tiếp tục nhập',
    );
    if (leave && mounted) Navigator.pop(context);
  }

  Future<void> _submit() async {
    if (_saving) return;

    if (_old.text.isEmpty) {
      setState(() => _error = 'Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    final newProblem = Validators.newPassword(_new.text);
    if (newProblem != null) {
      setState(() => _error = 'Mật khẩu mới: ${newProblem.toLowerCase()}');
      return;
    }
    if (_new.text == _old.text) {
      setState(() => _error = 'Mật khẩu mới phải khác mật khẩu hiện tại.');
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
        obscureText: !_shown.contains(controller),
        maxLength: 64,
        decoration: InputDecoration(
          labelText: label,
          counterText: '',
          border: const OutlineInputBorder(),
          suffixIcon: IconButton(
            onPressed: () => setState(() {
              if (!_shown.remove(controller)) _shown.add(controller);
            }),
            icon: Icon(
              _shown.contains(controller)
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([_old, _new, _confirm]),
      builder: (context, child) => PopScope(
        canPop: !_dirty && !_saving,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _confirmDiscard();
        },
        child: child!,
      ),
      child: _buildScaffold(),
    );
  }

  Widget _buildScaffold() {
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
