import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/auth_api.dart';

const green = Color(0xFF16845B);

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

  Future<void> _save() async {
    if (_saving) return;

    if (name.text.trim().isEmpty) {
      setState(() => _error = 'Vui lòng nhập họ và tên.');
      return;
    }
    if (!AuthApi.isValidPhone(phone.text)) {
      setState(() => _error = 'Số điện thoại không hợp lệ.');
      return;
    }
    if (!email.text.contains('@')) {
      setState(() => _error = 'Email không hợp lệ.');
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
        _error = error.message;
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
