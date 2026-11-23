import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../data/auth_api.dart';
import '../../../core/utils/validators.dart';
import '../../../shared/confirm_dialog.dart';

const green = Color(0xFF2FA672);

/// Chỉnh sửa hồ sơ, lưu lên máy chủ. Trả về `true` khi lưu thành công.
class EditProfileScreen extends StatefulWidget {
  final String initialName;
  final String initialPhone;
  final String initialEmail;

  const EditProfileScreen({
    super.key,
    this.initialName = '',
    this.initialPhone = '',
    this.initialEmail = '',
  });

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final TextEditingController name;
  late final TextEditingController phone;
  late final TextEditingController email;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: widget.initialName);
    phone = TextEditingController(text: widget.initialPhone);
    email = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
    super.dispose();
  }

  bool get _dirty =>
      name.text.trim() != widget.initialName.trim() ||
      AuthApi.normalizePhone(phone.text) !=
          AuthApi.normalizePhone(widget.initialPhone) ||
      email.text.trim().toLowerCase() != widget.initialEmail.trim().toLowerCase();

  Future<void> _confirmDiscard() async {
    if (_saving) return;
    final leave = await showConfirmDialog(
      context,
      title: 'Bỏ thay đổi?',
      message: 'Bạn đã sửa hồ sơ nhưng chưa lưu. Thoát bây giờ sẽ mất các thay đổi này.',
      confirmLabel: 'Bỏ thay đổi',
      cancelLabel: 'Tiếp tục sửa',
    );
    if (leave && mounted) Navigator.pop(context, false);
  }

  Future<void> _save() async {
    if (_saving) return;

    final problem = Validators.fullName(name.text) ??
        (AuthApi.normalizePhone(phone.text) ==
                    AuthApi.normalizePhone(widget.initialPhone)
                ? Validators.phone(phone.text)
                : Validators.mobilePhone(phone.text)) ??
        Validators.email(email.text);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }

    // Không đổi gì thì khỏi gọi máy chủ.
    if (name.text.trim() == widget.initialName.trim() &&
        AuthApi.normalizePhone(phone.text) ==
            AuthApi.normalizePhone(widget.initialPhone) &&
        email.text.trim().toLowerCase() ==
            widget.initialEmail.trim().toLowerCase()) {
      Navigator.pop(context, false);
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await AuthApi.updateProfile(
        fullName: name.text,
        phone: phone.text,
        email: email.text,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã lưu hồ sơ.')),
      );
      Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error.code == 'EMAIL_EXISTS'
            ? 'Email này đã được đăng ký. Hãy dùng email khác.'
            : error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Không thể lưu hồ sơ. Vui lòng thử lại.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([name, phone, email]),
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
      appBar: AppBar(title: const Text('Chỉnh sửa hồ sơ')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Center(
            child: CircleAvatar(
              radius: 42,
              child: Icon(Icons.person, size: 44),
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: name,
            decoration: const InputDecoration(
              labelText: 'Họ và tên',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Số điện thoại',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(backgroundColor: green),
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Lưu thay đổi'),
          ),
        ],
      ),
    );
  }
}
