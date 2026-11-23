import 'package:flutter/material.dart';

/// Biểu tượng + tiêu đề + mô tả ở đầu màn đăng nhập/đăng ký.
class AuthHeader extends StatelessWidget {
  final String title;
  final String subtitle;

  const AuthHeader({super.key, required this.title, required this.subtitle});

  static const Color green = Color(0xFF2FA672);
  static const Color darkGreen = Color(0xFF1F2937);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 12),
        const Icon(Icons.sports_tennis, color: green, size: 64),
        const SizedBox(height: 12),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: darkGreen,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 28),
      ],
    );
  }
}
