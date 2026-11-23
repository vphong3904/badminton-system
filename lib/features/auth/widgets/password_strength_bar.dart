import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

/// Thanh gợi ý độ mạnh mật khẩu (chỉ hiển thị, không gửi lên máy chủ).
/// strength: 0 = chưa nhập, 1 = yếu (đỏ), 2 = trung bình (vàng), 3 = mạnh (xanh lá).
class PasswordStrengthBar extends StatelessWidget {
  final int strength; // 0..3

  const PasswordStrengthBar({super.key, required this.strength});

  static const Color _weak = Color(0xFFE5484D); // đỏ
  static const Color _medium = Color(0xFFF5B301); // vàng
  static const Color _strong = Color(0xFF2FA672); // xanh lá

  Color get _activeColor => switch (strength) {
        1 => _weak,
        2 => _medium,
        _ => _strong,
      };

  @override
  Widget build(BuildContext context) {
    const labels = [
      'Nhập mật khẩu (8–64 ký tự, có chữ và số)',
      'Yếu',
      'Trung bình',
      'Mạnh',
    ];
    return Row(
      children: [
        for (var i = 1; i <= 3; i++)
          Expanded(
            child: Container(
              height: 5,
              margin: const EdgeInsets.only(right: 4),
              decoration: BoxDecoration(
                color: i <= strength ? _activeColor : AppTheme.mintLine,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
        const SizedBox(width: 6),
        Flexible(
          flex: 3,
          child: Text(
            labels[strength],
            style: TextStyle(
              fontSize: 11,
              fontWeight: strength == 0 ? FontWeight.w400 : FontWeight.w600,
              color: strength == 0 ? AppTheme.hintGrey : _activeColor,
            ),
          ),
        ),
      ],
    );
  }
}
