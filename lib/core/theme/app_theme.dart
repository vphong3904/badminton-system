import 'package:flutter/material.dart';

/// Bảng màu duy nhất của app: XANH NHẠT (mint) + TRẮNG.
/// Mọi màn hình chỉ dùng các hằng số ở đây, không tự đặt mã màu riêng.
/// Quy ước: nền = [backgroundColor]/trắng · khối nhấn = [mintSoft] · nút/điểm nhấn = [primaryColor]
/// · chữ = [ink] (xám đen trung tính, KHÔNG dùng xanh lá đậm) · lỗi = [danger] · sao đánh giá = [star].
class AppTheme {
  AppTheme._();

  // --- Xanh nhạt + trắng (chủ đạo) ---
  static const Color backgroundColor = Color(0xFFF1F9F4); // nền màn hình
  static const Color mintSoft = Color(0xFFDDF1E5); // khối nhấn, chip, ô đang chọn
  static const Color mintLine = Color(0xFFCFE7D8); // viền/đường kẻ nhạt
  static const Color primaryColor = Color(0xFF2FA672); // nút chính, icon nhấn, tab đang chọn
  static const Color primaryDark = Color(0xFF1F2937); // alias cũ → chữ đậm (ink), không còn xanh đậm
  static const Color ink = Color(0xFF1F2937); // chữ chính
  static const Color hintGrey = Color(0xFF6B7280); // chữ phụ
  static const Color fieldBorder = Color(0xFFD9E8DF); // viền ô nhập

  // --- Màu ngữ nghĩa (chỉ dùng cho trạng thái) ---
  static const Color danger = Color(0xFFE5484D);
  static const Color dangerSoft = Color(0xFFFDECEC); // nền nhạt cho hộp thông báo lỗi / nguy hiểm
  static const Color warning = Color(0xFFE67E00); // cảnh báo, đang chờ xử lý
  static const Color warningSoft = Color(0xFFFFF3E0); // nền nhạt cho hộp thông báo cảnh báo
  static const Color star = Color(0xFFF5B301);

  // --- Alias cũ: giữ để code cũ không vỡ, tất cả trỏ về màu chủ đạo ---
  static const Color accentGold = primaryColor;
  static const Color accentBlue = primaryColor;
  static const Color sheetBlue = primaryColor;
  static const Color selectedBlue = primaryColor;
  static const Color distanceOrange = primaryColor;

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primaryColor,
      primary: primaryColor,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: backgroundColor,
    appBarTheme: const AppBarTheme(
      backgroundColor: backgroundColor,
      foregroundColor: ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: primaryColor,
        foregroundColor: Colors.white,
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: primaryColor),
    // Thanh thông báo nhanh (SnackBar): nổi, bo tròn, chữ trắng trên nền xám đen cho dễ đọc.
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: ink,
      contentTextStyle: const TextStyle(
        color: Colors.white,
        fontSize: 14,
        height: 1.35,
        fontWeight: FontWeight.w500,
      ),
      actionTextColor: mintSoft,
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    // Hộp thoại mặc định (các màn chưa chuyển sang AppMessageBox cũng đồng bộ giao diện).
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      titleTextStyle: const TextStyle(
        color: ink,
        fontSize: 18,
        fontWeight: FontWeight.w800,
      ),
      contentTextStyle: const TextStyle(color: hintGrey, fontSize: 14, height: 1.45),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
  );
}
