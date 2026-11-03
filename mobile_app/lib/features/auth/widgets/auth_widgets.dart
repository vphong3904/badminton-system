import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';

/// Ô nhập bo tròn dùng cho đăng nhập / đăng ký.
class AuthTextField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onSubmitted;

  const AuthTextField({
    super.key,
    required this.controller,
    required this.hint,
    this.obscure = false,
    this.suffix,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    OutlineInputBorder border(Color color, [double width = 1.2]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: color, width: width),
        );

    return TextFormField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      validator: validator,
      onFieldSubmitted: onSubmitted,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppTheme.hintGrey, fontSize: 16),
        suffixIcon: suffix,
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 20,
          vertical: 18,
        ),
        enabledBorder: border(AppTheme.fieldBorder),
        focusedBorder: border(AppTheme.accentBlue, 1.6),
        errorBorder: border(Colors.red.shade400),
        focusedErrorBorder: border(Colors.red.shade400, 1.6),
      ),
    );
  }
}

/// Nút xanh dương toàn chiều rộng.
class AuthPrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;

  const AuthPrimaryButton({super.key, required this.label, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppTheme.accentBlue,
          disabledBackgroundColor: const Color(0xFFB9D8FF),
          foregroundColor: Colors.white,
          disabledForegroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

/// Nút tròn xám nhạt có mũi tên quay lại.
class AuthBackButton extends StatelessWidget {
  const AuthBackButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xF2F1F1F6),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => Navigator.maybePop(context),
        child: const SizedBox(
          width: 52,
          height: 52,
          child: Icon(Icons.chevron_left, size: 32, color: Color(0xFF1B2A41)),
        ),
      ),
    );
  }
}

/// Ảnh minh họa đầu trang đăng nhập: bầu trời, mây, lưới và vợt.
class AuthHero extends StatelessWidget {
  final double height;

  const AuthHero({super.key, this.height = 270});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _HeroPainter(),
        child: Stack(
          children: [
            Positioned(
              left: 70,
              bottom: 56,
              child: Transform.rotate(
                angle: -0.5,
                child: const Icon(
                  Icons.sports_tennis,
                  size: 120,
                  color: Color(0xFFE5885A),
                ),
              ),
            ),
            Positioned(
              right: 80,
              bottom: 120,
              child: Transform.rotate(
                angle: 0.6,
                child: const Icon(
                  Icons.sports_tennis,
                  size: 64,
                  color: Color(0xFF3FA5C9),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Bầu trời.
    canvas.drawRect(
      Rect.fromLTWH(0, 0, w, h),
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xFFA5E0F4), Color(0xFFD6F0FA)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ).createShader(Rect.fromLTWH(0, 0, w, h)),
    );

    // Mây.
    final cloud = Paint()..color = Colors.white.withValues(alpha: 0.85);
    canvas.drawCircle(Offset(w * 0.05, h * 0.30), 50, cloud);
    canvas.drawCircle(Offset(w * 0.17, h * 0.36), 38, cloud);
    canvas.drawCircle(Offset(w * 0.95, h * 0.22), 46, cloud);
    canvas.drawCircle(Offset(w * 0.84, h * 0.30), 34, cloud);

    // Mặt sân.
    canvas.drawRect(
      Rect.fromLTWH(0, h * 0.84, w, h * 0.16),
      Paint()..color = const Color(0xFF2E5CA8),
    );

    // Lưới: nền mờ + các đường kẻ ô.
    final netTop = h * 0.40;
    final netBottom = h * 0.84;
    final netLeft = w * 0.10;
    final netRight = w * 0.90;

    canvas.drawRect(
      Rect.fromLTRB(netLeft, netTop, netRight, netBottom),
      Paint()..color = const Color(0xFF6FA8D6).withValues(alpha: 0.35),
    );

    final line = Paint()
      ..color = const Color(0xFF3E78B5)
      ..strokeWidth = 1;
    for (var x = netLeft; x <= netRight; x += 9) {
      canvas.drawLine(Offset(x, netTop), Offset(x, netBottom), line);
    }
    for (var y = netTop; y <= netBottom; y += 9) {
      canvas.drawLine(Offset(netLeft, y), Offset(netRight, y), line);
    }

    // Băng trắng trên mép lưới.
    canvas.drawRect(
      Rect.fromLTRB(netLeft, netTop - 8, netRight, netTop),
      Paint()..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
