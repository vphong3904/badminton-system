import 'package:flutter/material.dart';

/// Ảnh mặc định khi cơ sở chưa có ảnh hoặc ảnh tải lỗi.
class VenuePlaceholder extends StatelessWidget {
  final String initials;
  final double iconSize;

  const VenuePlaceholder({super.key, this.initials = '', this.iconSize = 44});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFDDF1E5),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.sports_tennis, size: iconSize, color: const Color(0xFF2FA672)),
          if (initials.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              initials,
              style: const TextStyle(
                color: Color(0xFF2FA672),
                fontWeight: FontWeight.w800,
                fontSize: 16,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
