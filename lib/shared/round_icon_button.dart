import 'package:flutter/material.dart';

/// Nút tròn trắng có icon, dùng cho ♡ yêu thích và "Chỉ đường"
/// (thẻ danh sách và màn chi tiết cơ sở).
class RoundIconButton extends StatelessWidget {
  final String tooltip;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const RoundIconButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.onTap,
    this.color = Colors.black87,
  });

  @override
  Widget build(BuildContext context) {
    // Vùng chạm tối thiểu 44px; hình tròn hiển thị vẫn giữ kích thước nhỏ gọn.
    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onTap,
        radius: 22,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Material(
              color: Colors.white,
              shape: const CircleBorder(),
              elevation: 1,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Icon(icon, size: 21, color: color),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
