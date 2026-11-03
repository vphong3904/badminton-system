import 'package:flutter/material.dart';

import 'package:flutter_application_1/core/state/auth_store.dart';
import 'package:flutter_application_1/features/favorites/screens/favorites_screen.dart';
import 'package:flutter_application_1/features/notifications/screens/notifications_screen.dart';
import 'package:flutter_application_1/features/auth/screens/login_screen.dart';
import 'package:flutter_application_1/features/profile/screens/edit_profile_screen.dart';
import 'package:flutter_application_1/features/payment/screens/transaction_history_screen.dart';
import 'package:flutter_application_1/features/home/screens/feature_page.dart';

/// ============================================================
/// MÀN HÌNH TÀI KHOẢN KHÁCH HÀNG
/// ============================================================
///
/// Chức năng:
/// - Hiển thị thông tin khách hàng.
/// - Chỉnh sửa hồ sơ.
/// - Xem lịch đặt sân.
/// - Xem lịch sử thanh toán.
/// - Quản lý sân yêu thích.
/// - Xem thông báo.
/// - Đổi mật khẩu.
/// - Cài đặt ứng dụng.
/// - Trung tâm hỗ trợ.
/// - Đăng nhập và đăng xuất.
///
/// Lưu ý:
/// Đã loại bỏ hoàn toàn các chức năng dành cho chủ sân.
class ProfileScreen extends StatelessWidget {
  final String role;

  // Callback mở màn hình lịch đặt sân.
  final VoidCallback? onOpenHistory;

  // Thông tin khách hàng nhận từ AppShell.
  final bool? isLoggedIn;
  final String? displayName;
  final String? email;
  final String? phone;

  // Callback đăng nhập và đăng xuất.
  final Future<bool> Function(bool initialRegister)? onAuthenticate;
  final VoidCallback? onLogout;

  const ProfileScreen({
    super.key,
    required this.role,
    this.onOpenHistory,
    this.isLoggedIn,
    this.displayName,
    this.email,
    this.phone,
    this.onAuthenticate,
    this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    // Theo dõi thay đổi trạng thái đăng nhập từ AuthStore.
    return ListenableBuilder(
      listenable: AuthStore.instance,
      builder: (context, _) {
        return _buildBody(context);
      },
    );
  }

  // ==========================================================
  // XÁC NHẬN ĐĂNG XUẤT
  // ==========================================================

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Xác nhận đăng xuất'),
          content: const Text('Bạn có chắc chắn muốn đăng xuất?'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('Đăng xuất'),
            ),
          ],
        );
      },
    );

    if (confirmed != true) return;

    // Sử dụng callback từ AppShell nếu có.
    if (onLogout != null) {
      onLogout!();
    } else {
      AuthStore.instance.signOut();
    }
  }

  // ==========================================================
  // XỬ LÝ ĐĂNG NHẬP
  // ==========================================================

  Future<void> _handleLogin(BuildContext context) async {
    if (onAuthenticate != null) {
      await onAuthenticate!(false);
      return;
    }

    await Navigator.push<bool>(
      context,
      MaterialPageRoute<bool>(builder: (_) => const LoginScreen()),
    );
  }

  // ==========================================================
  // GIAO DIỆN CHÍNH
  // ==========================================================

  Widget _buildBody(BuildContext context) {
    final auth = AuthStore.instance;

    // Ưu tiên trạng thái đăng nhập từ AppShell.
    // Nếu không được truyền thì sử dụng AuthStore.
    final loggedIn = isLoggedIn ?? auth.isLoggedIn;

    // Lấy tên khách hàng.
    final name = isLoggedIn == null
        ? auth.displayName
        : (loggedIn
              ? (displayName?.trim().isNotEmpty == true
                    ? displayName!
                    : 'Khách hàng')
              : 'Khách hàng');

    // Lấy email.
    final accountEmail = isLoggedIn == null
        ? ''
        : (loggedIn ? email ?? '' : '');

    // Lấy số điện thoại.
    final accountPhone = isLoggedIn == null
        ? ''
        : (loggedIn ? phone ?? '' : '');

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // ====================================================
        // TIÊU ĐỀ
        // ====================================================
        const Text(
          'Tài khoản',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 20),

        // ====================================================
        // THÔNG TIN KHÁCH HÀNG
        // ====================================================
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFFE1F4E9),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            children: [
              const CircleAvatar(
                radius: 42,
                backgroundColor: Colors.white,
                child: Icon(Icons.person, size: 46, color: Color(0xFF16845B)),
              ),

              const SizedBox(height: 10),

              Text(
                name,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),

              Text(
                'Vai trò: $role',
                style: const TextStyle(color: Colors.black54),
              ),

              // Hiển thị email khi đã đăng nhập.
              if (loggedIn && accountEmail.isNotEmpty) ...[
                const SizedBox(height: 10),
                _profileInfo(Icons.email_outlined, accountEmail),
              ],

              // Hiển thị số điện thoại khi đã đăng nhập.
              if (loggedIn && accountPhone.isNotEmpty) ...[
                const SizedBox(height: 7),
                _profileInfo(Icons.phone_outlined, accountPhone),
              ],

              // Nút chỉnh sửa hồ sơ.
              if (loggedIn) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const EditProfileScreen(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Chỉnh sửa hồ sơ'),
                ),
              ] else ...[
                const SizedBox(height: 10),
                const Text(
                  'Đăng nhập để sử dụng đầy đủ các chức năng.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.black54, fontSize: 13),
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: 22),

        // ====================================================
        // CÁ NHÂN
        // ====================================================
        const Text(
          'Cá nhân',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),

        const SizedBox(height: 8),

        // Lịch đặt sân của khách hàng.
        if (onOpenHistory != null)
          _itemCallback(
            Icons.calendar_month_outlined,
            'Lịch đặt sân của tôi',
            onOpenHistory!,
          ),

        // Lịch sử thanh toán.
        _item(
          context,
          Icons.receipt_long,
          'Lịch sử thanh toán',
          const TransactionHistoryScreen(),
        ),

        // Danh sách sân yêu thích.
        _item(
          context,
          Icons.favorite_border,
          'Sân yêu thích',
          const FavoritesScreen(),
        ),

        // Thông báo.
        _item(
          context,
          Icons.notifications_outlined,
          'Thông báo',
          const NotificationsScreen(),
        ),

        // Đổi mật khẩu.
        _item(
          context,
          Icons.lock_outline,
          'Đổi mật khẩu',
          const FeaturePage(
            title: 'Đổi mật khẩu',
            icon: Icons.lock_outline,
            description: 'Nhập mật khẩu hiện tại và mật khẩu mới.',
            items: ['Mật khẩu mới cần đủ mạnh', 'Xác nhận mật khẩu mới'],
          ),
        ),

        const SizedBox(height: 22),

        // ====================================================
        // HỖ TRỢ VÀ CÀI ĐẶT
        // ====================================================
        const Text(
          'Hỗ trợ & cài đặt',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
        ),

        const SizedBox(height: 8),

        // Cài đặt ứng dụng.
        _item(
          context,
          Icons.settings_outlined,
          'Cài đặt',
          const FeaturePage(
            title: 'Cài đặt',
            icon: Icons.settings,
            description: 'Tùy chỉnh trải nghiệm ứng dụng.',
            items: [
              'Bật/tắt thông báo',
              'Điều khoản sử dụng',
              'Chính sách bảo mật',
              'Trung tâm hỗ trợ',
            ],
          ),
        ),

        // Trung tâm hỗ trợ.
        _item(
          context,
          Icons.help_outline,
          'Trung tâm hỗ trợ',
          const FeaturePage(
            title: 'Trung tâm hỗ trợ',
            icon: Icons.support_agent,
            description: 'Bạn cần trợ giúp? Hãy liên hệ đội ngũ hỗ trợ.',
            items: ['Email: support@example.com', 'Giờ hỗ trợ: 08:00–17:00'],
          ),
        ),

        const SizedBox(height: 20),

        // ====================================================
        // ĐĂNG NHẬP / ĐĂNG XUẤT
        // ====================================================
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () {
              if (loggedIn) {
                _confirmLogout(context);
              } else {
                _handleLogin(context);
              }
            },
            icon: Icon(loggedIn ? Icons.logout : Icons.login),
            label: Text(loggedIn ? 'Đăng xuất' : 'Đăng nhập'),
            style: OutlinedButton.styleFrom(
              foregroundColor: loggedIn ? Colors.red : const Color(0xFF16845B),
              padding: const EdgeInsets.symmetric(vertical: 13),
              side: BorderSide(
                color: loggedIn ? Colors.red.shade300 : const Color(0xFF16845B),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),

        const SizedBox(height: 16),

        // Thông tin lưu trữ dữ liệu.
        const Text(
          'Dữ liệu tài khoản hiện được lưu trong bộ nhớ ứng dụng. '
          'Đăng nhập thật, lưu hồ sơ và đồng bộ dữ liệu cần kết nối backend.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey, fontSize: 12),
        ),

        const SizedBox(height: 20),
      ],
    );
  }

  // ==========================================================
  // HIỂN THỊ EMAIL / SỐ ĐIỆN THOẠI
  // ==========================================================

  Widget _profileInfo(IconData icon, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 16, color: const Color(0xFF16845B)),
        const SizedBox(width: 7),
        Flexible(
          child: Text(
            value,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, color: Colors.black87),
          ),
        ),
      ],
    );
  }

  // ==========================================================
  // ITEM ĐIỀU HƯỚNG CÓ CALLBACK
  // ==========================================================

  Widget _itemCallback(IconData icon, String label, VoidCallback onTap) {
    return Card(
      color: Colors.white,
      elevation: 0,
      child: ListTile(
        leading: Icon(icon, color: const Color(0xFF16845B)),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }

  // ==========================================================
  // ITEM ĐIỀU HƯỚNG ĐẾN MÀN HÌNH KHÁC
  // ==========================================================

  Widget _item(BuildContext context, IconData icon, String label, Widget page) {
    return Card(
      color: Colors.white,
      elevation: 0,
      child: ListTile(
        leading: Icon(icon, color: const Color(0xFF16845B)),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => page));
        },
      ),
    );
  }
}
