import 'package:flutter/material.dart';

/// Biểu tượng quả cầu lông vẽ bằng CustomPaint (Material Icons không có sẵn).
class ShuttlecockIcon extends StatelessWidget {
  final double size;
  final Color color;

  const ShuttlecockIcon({super.key, this.size = 24, required this.color});

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _ShuttlecockPainter(color));
}

class _ShuttlecockPainter extends CustomPainter {
  final Color color;
  _ShuttlecockPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.07
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()..color = color;

    // Đế cầu (quả cork).
    canvas.drawCircle(Offset(w * 0.5, h * 0.84), w * 0.12, fill);

    // Váy lông cầu.
    final skirt = Path()
      ..moveTo(w * 0.42, h * 0.72)
      ..lineTo(w * 0.16, h * 0.16)
      ..quadraticBezierTo(w * 0.5, h * 0.02, w * 0.84, h * 0.16)
      ..lineTo(w * 0.58, h * 0.72)
      ..close();
    canvas.drawPath(skirt, stroke);

    // Các đường lông.
    canvas.drawLine(
      Offset(w * 0.5, h * 0.72),
      Offset(w * 0.5, h * 0.08),
      stroke,
    );
    canvas.drawLine(
      Offset(w * 0.46, h * 0.72),
      Offset(w * 0.33, h * 0.1),
      stroke,
    );
    canvas.drawLine(
      Offset(w * 0.54, h * 0.72),
      Offset(w * 0.67, h * 0.1),
      stroke,
    );
  }

  @override
  bool shouldRepaint(covariant _ShuttlecockPainter old) => old.color != color;
}

/// Một môn thể thao hiển thị ở hàng danh mục.
class SportCategory {
  final String name;
  final Color color;
  final IconData? icon; // null => dùng quả cầu lông

  const SportCategory(this.name, this.color, this.icon);
}

const List<SportCategory> kSportCategories = [
  SportCategory('Pickleball', Color(0xFF3F7DE8), Icons.blur_circular),
  SportCategory('Cầu lông', Color(0xFF1FA463), null),
  SportCategory('Bóng đá', Color(0xFF1B9E4B), Icons.sports_soccer),
  SportCategory('Bóng rổ', Color(0xFFF08A1C), Icons.sports_basketball),
  SportCategory('Quần vợt', Color(0xFFC96A12), Icons.sports_tennis),
  SportCategory('Đa năng', Color(0xFFD7263D), Icons.sports),
];

SportCategory sportCategoryOf(String name) => kSportCategories.firstWhere(
  (s) => s.name == name,
  orElse: () => kSportCategories[1],
);

/// Ghim bản đồ có biểu tượng môn thể thao bên trong.
class SportPin extends StatelessWidget {
  final SportCategory sport;
  final double size;
  final bool onSelectedBackground; // true: ghim trắng, biểu tượng màu

  const SportPin({
    super.key,
    required this.sport,
    this.size = 44,
    this.onSelectedBackground = false,
  });

  @override
  Widget build(BuildContext context) {
    final pinColor = onSelectedBackground ? Colors.white : sport.color;
    final glyphColor = onSelectedBackground ? sport.color : Colors.white;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(Icons.location_on, size: size, color: pinColor),
          Positioned(
            top: size * 0.17,
            child: sport.icon == null
                ? ShuttlecockIcon(size: size * 0.38, color: glyphColor)
                : Icon(sport.icon, size: size * 0.36, color: glyphColor),
          ),
        ],
      ),
    );
  }
}
