import '../../../core/network/api_client.dart';
import '../../../core/network/api_routes.dart';
import '../../../core/storage/session_storage.dart';
import '../../../models/auth_model.dart';

/// Gọi API tài khoản: `/tai-khoan/*`.
class AuthApi {
  AuthApi._();

  /// Phiên đăng nhập hiện tại (null nếu chưa đăng nhập).
  static AuthSession? current;

  /// Đăng nhập bằng email.
  static Future<AuthSession> login(String email, String password) async {
    final data = await ApiClient.post(
      '/tai-khoan/dang-nhap',
      body: {'email': email.trim().toLowerCase(), 'matKhau': password},
    );
    return _startSession(data);
  }

  /// Đăng ký tài khoản khách hàng (đăng nhập bằng email).
  static Future<AuthSession> register({
    required String fullName,
    required String phone,
    required String email,
    required String password,
  }) async {
    final normalizedPhone = normalizePhone(phone);
    final data = await ApiClient.post(
      '/tai-khoan/dang-ky',
      body: {
        'matKhau': password,
        'hoTen': normalizeName(fullName),
        'soDienThoai': normalizedPhone,
        'email': email.trim().toLowerCase(),
      },
    );
    return _startSession(data);
  }

  /// Cập nhật số điện thoại của tài khoản đang đăng nhập.
  static Future<void> updatePhone(String phone) async {
    final data = await ApiClient.patch(
      ApiRoutes.profile,
      body: {'soDienThoai': normalizePhone(phone)},
    );
    _mergeUser(data);
  }

  /// Lấy hồ sơ mới nhất từ máy chủ và cập nhật [current].
  static Future<AuthSession?> fetchProfile() async {
    final data = await ApiClient.get(ApiRoutes.profile);
    _mergeUser(data);
    return current;
  }

  /// Lưu hồ sơ (họ tên, số điện thoại, email) lên máy chủ.
  static Future<AuthSession?> updateProfile({
    required String fullName,
    required String phone,
    required String email,
  }) async {
    final data = await ApiClient.patch(
      ApiRoutes.profile,
      body: {
        'hoTen': normalizeName(fullName),
        'soDienThoai': normalizePhone(phone),
        'email': email.trim().toLowerCase(),
      },
    );
    _mergeUser(data);
    return current;
  }

  /// Đổi mật khẩu (cần mật khẩu cũ).
  static Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    await ApiClient.post(
      ApiRoutes.changePassword,
      body: {'matKhauCu': oldPassword, 'matKhauMoi': newPassword},
    );
  }

  /// Gộp dữ liệu người dùng trả về từ API vào phiên hiện tại.
  static void _mergeUser(dynamic data) {
    final session = current;
    if (session == null || data is! Map) return;
    final map = data.cast<String, dynamic>();
    final user = map['nguoiDung'] is Map
        ? (map['nguoiDung'] as Map).cast<String, dynamic>()
        : map;
    current = AuthSession(
      token: session.token,
      userId: session.userId,
      fullName: (user['hoTen'] as String?) ?? session.fullName,
      email: (user['email'] as String?) ?? session.email,
      phone: (user['soDienThoai'] as String?) ?? session.phone,
      avatarUrl: (user['anhDaiDien'] as String?) ?? session.avatarUrl,
    );
    SessionStorage.save(current!);
  }

  /// Đổi ảnh đại diện (`POST /tai-khoan/ca-nhan/anh`, JPG/PNG/WEBP ≤ 5MB). Trả về đường dẫn ảnh mới.
  static Future<String?> uploadAvatar(List<int> bytes, String filename) async {
    final data = await ApiClient.postFileBytes(
      '/tai-khoan/ca-nhan/anh',
      field: 'tepAnh',
      bytes: bytes,
      filename: filename,
    );
    final url = data is Map ? data['anhDaiDien'] as String? : null;
    final session = current;
    if (session != null && url != null) {
      current = AuthSession(
        token: session.token,
        userId: session.userId,
        fullName: session.fullName,
        email: session.email,
        phone: session.phone,
        avatarUrl: url,
      );
      SessionStorage.save(current!);
    }
    return url;
  }

  /// Khôi phục phiên đã lưu khi mở app (gọi 1 lần trước `runApp`).
  /// Trả về null nếu chưa từng đăng nhập hoặc đã đăng xuất.
  static Future<AuthSession?> restoreSession() async {
    final saved = await SessionStorage.load();
    if (saved == null) return null;
    current = saved;
    ApiClient.setToken(saved.token);
    return saved;
  }

  static void signOut() {
    current = null;
    ApiClient.clearToken();
    SessionStorage.clear();
  }

  static AuthSession _startSession(dynamic data) {
    final session = AuthSession.fromJson((data as Map).cast<String, dynamic>());
    ApiClient.setToken(session.token);
    current = session;
    SessionStorage.save(session);
    return session;
  }

  /// Chuẩn hóa số điện thoại về dạng `0xxxxxxxxx` như backend yêu cầu.
  /// Chấp nhận `0912345678`, `912345678`, `+84912345678`, `84 912 345 678`.
  static String normalizePhone(String raw) {
    var digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.startsWith('84') && digits.length >= 11) {
      digits = digits.substring(2);
    }
    if (digits.isNotEmpty && !digits.startsWith('0')) digits = '0$digits';
    return digits;
  }

  /// Họ tên gửi lên backend: bỏ khoảng trắng thừa (backend cũng chuẩn hoá như vậy).
  static String normalizeName(String raw) =>
      raw.trim().replaceAll(RegExp(r'\s+'), ' ');

  /// Ký tự được phép gõ trong ô số điện thoại (khớp backend `MAU_KY_TU_SDT`):
  /// chữ cái/ký hiệu lạ bị từ chối thay vì bị bỏ đi lặng lẽ khi chuẩn hoá.
  static final RegExp _phoneChars = RegExp(r'^\+?[\d\s.()\-]+$');

  /// Số liên hệ hợp lệ theo backend: di động 10 số (03/05/07/08/09) hoặc số bàn 11 số (đầu 02).
  static bool isValidPhone(String raw) {
    final text = raw.trim();
    return _phoneChars.hasMatch(text) &&
        RegExp(r'^0([35789]\d{8}|2\d{9})$').hasMatch(normalizePhone(text));
  }

  /// Số di động VN theo backend: 10 số, đầu số 03/05/07/08/09.
  static bool isValidMobile(String raw) {
    final text = raw.trim();
    return _phoneChars.hasMatch(text) &&
        RegExp(r'^0[35789]\d{8}$').hasMatch(normalizePhone(text));
  }
}
