import 'package:flutter/material.dart';

const green = Color(0xFF16845B);

class OwnerRegistrationScreen extends StatefulWidget {
  const OwnerRegistrationScreen({super.key});

  @override
  State<OwnerRegistrationScreen> createState() =>
      _OwnerRegistrationScreenState();
}

class _OwnerRegistrationScreenState extends State<OwnerRegistrationScreen> {
  final facility = TextEditingController();
  final address = TextEditingController();
  final phone = TextEditingController();

  @override
  void dispose() {
    facility.dispose();
    address.dispose();
    phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đăng ký chủ sân')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Thông tin cơ sở',
            style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: facility,
            decoration: const InputDecoration(
              labelText: 'Tên cơ sở sân',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: address,
            decoration: const InputDecoration(
              labelText: 'Địa chỉ cơ sở',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Số điện thoại liên hệ',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Hồ sơ sẽ ở trạng thái chờ duyệt. '
            'Bản demo chưa gửi dữ liệu lên máy chủ.',
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () {
              if (facility.text.trim().isEmpty ||
                  address.text.trim().isEmpty ||
                  phone.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Vui lòng nhập đầy đủ thông tin.'),
                  ),
                );
                return;
              }

              showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Đã tạo yêu cầu demo'),
                  content: const Text(
                    'Trong bản có backend, yêu cầu sẽ được gửi '
                    'Admin phê duyệt.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () {
                        Navigator.pop(dialogContext);
                        Navigator.pop(context);
                      },
                      child: const Text('Đóng'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('Gửi hồ sơ xét duyệt'),
          ),
        ],
      ),
    );
  }
}
