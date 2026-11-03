import 'package:flutter/material.dart';
import 'extra_screens.dart';

class ProfileScreen extends StatelessWidget {
  final String role;
  const ProfileScreen({super.key, required this.role});

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const Text(
        'Tài khoản',
        style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 20),
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
            const Text(
              'Người dùng demo',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            Text(
              'Vai trò: $role',
              style: const TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const EditProfileScreen()),
              ),
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Chỉnh sửa hồ sơ'),
            ),
          ],
        ),
      ),
      const SizedBox(height: 18),
      const Text(
        'Cá nhân',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
      ),
      _item(
        context,
        Icons.receipt_long,
        'Lịch sử thanh toán',
        const TransactionHistoryScreen(),
      ),
      _item(
        context,
        Icons.favorite_border,
        'Sân yêu thích',
        const FavoritesScreen(),
      ),
      _item(
        context,
        Icons.notifications_outlined,
        'Thông báo',
        const NotificationsScreen(),
      ),
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
      const SizedBox(height: 12),
      const Text(
        'Dành cho chủ sân',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
      ),
      _item(
        context,
        Icons.storefront_outlined,
        'Đăng ký trở thành chủ sân',
        const OwnerRegistrationScreen(),
      ),
      _item(
        context,
        Icons.dashboard_outlined,
        'Quản lý sân của tôi',
        const OwnerManagementScreen(),
      ),
      const SizedBox(height: 12),
      const Text(
        'Hỗ trợ & cài đặt',
        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17),
      ),
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
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        ),
        icon: const Icon(Icons.logout),
        label: const Text('Đăng nhập / Đăng xuất demo'),
      ),
      const SizedBox(height: 12),
      const Text(
        'Dữ liệu hiện là dữ liệu mẫu. Đăng nhập, lưu hồ sơ, thông báo realtime và quản lý chủ sân cần kết nối backend.',
        textAlign: TextAlign.center,
        style: TextStyle(color: Colors.grey, fontSize: 12),
      ),
    ],
  );

  Widget _item(
    BuildContext context,
    IconData icon,
    String label,
    Widget page,
  ) => Card(
    color: Colors.white,
    elevation: 0,
    child: ListTile(
      leading: Icon(icon, color: const Color(0xFF16845B)),
      title: Text(label),
      trailing: const Icon(Icons.chevron_right),
      onTap: () =>
          Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
    ),
  );
}
