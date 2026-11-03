import 'package:flutter/material.dart';

class AppTheme {
  AppTheme._();

  // Màu thương hiệu (xanh lá) – dùng cho header, nút chính ở trang chủ.
  static const Color primaryColor = Color(0xFF16845B);
  static const Color primaryDark = Color(0xFF10583F);
  static const Color backgroundColor = Color(0xFFF5F7F5);

  // Màu nhấn theo thiết kế mới.
  static const Color accentGold = Color(0xFFD9A92B); // nút ĐẶT LỊCH
  static const Color accentBlue = Color(0xFF1B86FF); // nút đăng nhập/đăng ký
  static const Color sheetBlue = Color(0xFF2083D6); // nút trong bottom sheet
  static const Color selectedBlue = Color(
    0xFF3B8EF0,
  ); // ô môn thể thao đang chọn
  static const Color distanceOrange = Color(0xFFE8743B);
  static const Color fieldBorder = Color(0xFFE3E6EA);
  static const Color hintGrey = Color(0xFF6B7280);

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: primaryColor),
    scaffoldBackgroundColor: backgroundColor,
    appBarTheme: const AppBarTheme(
      backgroundColor: backgroundColor,
      foregroundColor: primaryDark,
      centerTitle: false,
    ),
  );
}
