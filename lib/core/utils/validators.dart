import '../../features/auth/data/auth_api.dart';

/// Kiểm tra đầu vào dùng chung, theo docs/agent/05-validation.md.
/// Mỗi hàm trả về thông báo lỗi (tiếng Việt) hoặc null nếu hợp lệ.
/// FE không được lỏng hơn backend (zod).
class Validators {
  Validators._();

  static final RegExp _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  // Chặt hơn BE (ghi trong 05-validation.md): chỉ chữ cái (có dấu), khoảng trắng, ' . -
  static final RegExp _namePattern = RegExp(
    r"^\p{L}[\p{L}\s'.-]*$",
    unicode: true,
  );
  static final RegExp _emailStrict = RegExp(
    r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$',
  );

  static String? fullName(String? value) {
    final text = (value ?? '').trim().replaceAll(RegExp(r'\s+'), ' ');
    if (text.isEmpty) return 'Vui lòng nhập họ và tên.';
    if (text.length < 2) return 'Họ tên tối thiểu 2 ký tự.';
    if (text.length > 100) return 'Họ tên tối đa 100 ký tự.';
    if (!_namePattern.hasMatch(text)) {
      return 'Họ tên chỉ gồm chữ cái, không chứa số hoặc ký tự đặc biệt.';
    }
    return null;
  }

  /// Tên người nhận khi đặt sân.
  static String? bookingName(String? value) {
    final text = (value ?? '').trim();
    if (text.length < 2) return 'Vui lòng nhập tên (tối thiểu 2 ký tự).';
    if (text.length > 100) return 'Họ tên tối đa 100 ký tự.';
    return null;
  }

  static String? email(String? value) {
    final text = (value ?? '').trim();
    if (text.isEmpty) return 'Vui lòng nhập email.';
    if (!_emailPattern.hasMatch(text) ||
        !_emailStrict.hasMatch(text) ||
        text.contains('..')) {
      return 'Email không hợp lệ.';
    }
    if (text.length > 120) return 'Email tối đa 120 ký tự.';
    return null;
  }

  /// SĐT di động khi ĐĂNG KÝ (chặt hơn BE): 10 số, đầu số 03/05/07/08/09.
  static String? mobilePhone(String? value) {
    final text = (value ?? '').trim();
    if (text.isEmpty) return 'Vui lòng nhập số điện thoại.';
    if (!AuthApi.isValidMobile(text)) {
      return 'Số điện thoại di động gồm 10 số, đầu số 03, 05, 07, 08 hoặc 09.';
    }
    return null;
  }

  static String? phone(String? value) {
    final text = (value ?? '').trim();
    if (text.isEmpty) return 'Vui lòng nhập số điện thoại.';
    if (!AuthApi.isValidPhone(text)) {
      return 'Số điện thoại không hợp lệ (di động 10 số hoặc số bàn 11 số, bắt đầu bằng 0).';
    }
    return null;
  }

  /// Mật khẩu khi đăng ký / đổi mật khẩu (chặt hơn BE): 8–64 ký tự,
  /// có cả chữ và số, không chứa khoảng trắng.
  static String? newPassword(String? value) {
    final text = value ?? '';
    if (text.isEmpty) return 'Vui lòng nhập mật khẩu.';
    if (text.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
    if (text.length > 64) return 'Mật khẩu tối đa 64 ký tự.';
    if (RegExp(r'\s').hasMatch(text)) return 'Mật khẩu không được chứa khoảng trắng.';
    if (!RegExp(r'[A-Za-z]').hasMatch(text) || !RegExp(r'\d').hasMatch(text)) {
      return 'Mật khẩu cần có cả chữ và số.';
    }
    return null;
  }

  /// Độ mạnh mật khẩu (chỉ để hiển thị thanh gợi ý):
  /// 0 = chưa nhập · 1 = yếu (đỏ) · 2 = trung bình (vàng) · 3 = mạnh (xanh lá).
  static int passwordStrength(String text) {
    if (text.isEmpty) return 0;
    final hasLetter = RegExp(r'[A-Za-z]').hasMatch(text);
    final hasDigit = RegExp(r'\d').hasMatch(text);
    // Chưa đạt luật tối thiểu (8 ký tự, có chữ và số) thì luôn là yếu.
    if (text.length < 8 || !hasLetter || !hasDigit) return 1;
    var score = 0;
    if (text.length >= 10) score++;
    if (RegExp(r'[a-z]').hasMatch(text) && RegExp(r'[A-Z]').hasMatch(text)) score++;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(text)) score++;
    if (score >= 3 || (score == 2 && text.length >= 12)) return 3;
    return score >= 1 ? 2 : 1;
  }

  /// Mật khẩu khi đăng nhập: chỉ bắt buộc, không nêu chính sách độ dài.
  static String? loginPassword(String? value) {
    if (value == null || value.isEmpty) return 'Vui lòng nhập mật khẩu.';
    return null;
  }

  static String? confirmPassword(String? value, String password) {
    if (value == null || value.isEmpty) return 'Vui lòng nhập lại mật khẩu.';
    if (value != password) return 'Mật khẩu xác nhận không khớp.';
    return null;
  }

  static String? note(String? value) {
    if ((value ?? '').trim().length > 500) return 'Ghi chú tối đa 500 ký tự.';
    return null;
  }
}
