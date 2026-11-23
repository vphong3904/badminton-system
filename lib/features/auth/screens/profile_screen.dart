import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_client.dart';
import '../data/auth_api.dart';

import '../../../shared/app_message_box.dart';

import '../../favorites/favorites_store.dart';
import '../../notifications/data/notification_store.dart';
import '../../favorites/screens/favorites_screen.dart';
import 'change_password_screen.dart';
import 'edit_profile_screen.dart';
import '../../../models/court_model.dart';

const _green = Color(0xFF2FA672);

/// Màn Tài khoản khách hàng (FE-16).
/// Spec: docs/agent/features/account/screens.md
class ProfileScreen extends StatelessWidget {
  final String role;

  /// Danh sách sân (từ API) và callback mở sân, dùng cho màn Sân yêu thích.
  final List<Court> courts;
  final ValueChanged<Court>? onBook;

  final VoidCallback? onOpenHistory;

  /// Mở màn Thông báo.
  final VoidCallback? onOpenNotifications;

  /// Số đơn đang chờ thanh toán, hiển thị cạnh "Lịch đặt sân của tôi".
  final int pendingPaymentCount;

  final bool? isLoggedIn;
  final String? displayName;
  final String? email;
  final String? phone;

  final Future<bool> Function(bool initialRegister)? onAuthenticate;
  final VoidCallback? onLogout;
  final VoidCallback? onProfileChanged;

  const ProfileScreen({
    super.key,
    required this.role,
    this.courts = const [],
    this.onBook,
    this.onOpenHistory,
    this.onOpenNotifications,
    this.pendingPaymentCount = 0,
    this.isLoggedIn,
    this.displayName,
    this.email,
    this.phone,
    this.onAuthenticate,
    this.onLogout,
    this.onProfileChanged,
  });

  bool get _loggedIn => isLoggedIn ?? false;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'Tài khoản',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        if (_loggedIn) _profileCard(context) else _guestCard(context),
        if (_loggedIn) ...[
          _groupTitle('ĐẶT SÂN'),
          if (onOpenHistory != null)
            _tile(
              icon: Icons.calendar_month_outlined,
              label: 'Lịch đặt sân của tôi',
              badge: pendingPaymentCount > 0
                  ? '$pendingPaymentCount chờ thanh toán'
                  : null,
              onTap: onOpenHistory!,
            ),
          ListenableBuilder(
            listenable: FavoritesStore.instance,
            builder: (context, _) {
              final count = FavoritesStore.instance.ids.length;
              return _tile(
                icon: Icons.favorite_border,
                label: 'Sân yêu thích',
                badge: count > 0 ? '$count' : null,
                onTap: () => _push(
                  context,
                  FavoritesScreen(courts: courts, onBook: onBook),
                ),
              );
            },
          ),
          if (onOpenNotifications != null)
            ListenableBuilder(
              listenable: NotificationStore.instance,
              builder: (context, _) {
                final unread = NotificationStore.instance.unread;
                return _tile(
                  icon: Icons.notifications_outlined,
                  label: 'Thông báo',
                  badge: unread > 0 ? '$unread mới' : null,
                  onTap: onOpenNotifications!,
                );
              },
            ),
          _groupTitle('TÀI KHOẢN & BẢO MẬT'),
          _tile(
            icon: Icons.lock_outline,
            label: 'Đổi mật khẩu',
            onTap: () => _push(context, const ChangePasswordScreen()),
          ),
        ],
        _groupTitle('SẮP CÓ'),
        _comingSoon(context, Icons.receipt_long, 'Lịch sử giao dịch'),
        _comingSoon(context, Icons.settings_outlined, 'Cài đặt'),
        _comingSoon(context, Icons.help_outline, 'Trung tâm hỗ trợ'),
        if (_loggedIn) ...[
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _confirmLogout(context),
              icon: const Icon(Icons.logout),
              label: const Text('Đăng xuất'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                padding: const EdgeInsets.symmetric(vertical: 13),
                side: BorderSide(color: Colors.red.shade300),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        const Center(
          child: Text('v0.1.0+1',
              style: TextStyle(color: Colors.grey, fontSize: 12)),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  // ---------------- thẻ hồ sơ / khách ----------------

  String get _initial {
    final name = (displayName ?? '').trim();
    return name.isEmpty ? '?' : name.substring(0, 1).toUpperCase();
  }

  Widget _profileCard(BuildContext context) {
    final name = (displayName ?? '').trim().isEmpty
        ? 'Khách hàng'
        : displayName!.trim();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFDDF1E5),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Row(
            children: [
              _AvatarPicker(initial: _initial),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 19, fontWeight: FontWeight.bold),
                    ),
                    if ((email ?? '').isNotEmpty)
                      _info(Icons.email_outlined, email!),
                    if ((phone ?? '').isNotEmpty)
                      _info(Icons.phone_outlined, phone!),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () async {
                final saved = await Navigator.push<bool>(
                  context,
                  MaterialPageRoute<bool>(
                    builder: (_) => EditProfileScreen(
                      initialName: displayName ?? '',
                      initialPhone: phone ?? '',
                      initialEmail: email ?? '',
                    ),
                  ),
                );
                if (saved == true) onProfileChanged?.call();
              },
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Chỉnh sửa hồ sơ'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _info(IconData icon, String value) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            Icon(icon, size: 15, color: _green),
            const SizedBox(width: 6),
            Flexible(
              child: Text(value,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: Colors.black87)),
            ),
          ],
        ),
      );

  Widget _guestCard(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFDDF1E5),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          const Icon(Icons.account_circle_outlined, size: 56, color: _green),
          const SizedBox(height: 8),
          const Text(
            'Đăng nhập để đặt sân và lưu sân yêu thích',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          if (onAuthenticate != null) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: () => onAuthenticate!(false),
                    child: const Text('Đăng nhập'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => onAuthenticate!(true),
                    child: const Text('Đăng ký'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  // ---------------- danh sách mục ----------------

  Widget _groupTitle(String text) => Padding(
        padding: const EdgeInsets.only(top: 22, bottom: 8),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
            color: Colors.black54,
          ),
        ),
      );

  Widget _tile({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    String? badge,
  }) {
    return Card(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 6),
      child: ListTile(
        leading: Icon(icon, color: _green),
        title: Text(label),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (badge != null)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFDDF1E5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(badge, style: const TextStyle(fontSize: 12)),
              ),
            const Icon(Icons.chevron_right),
          ],
        ),
        onTap: onTap,
      ),
    );
  }

  Widget _comingSoon(BuildContext context, IconData icon, String label) {
    return Opacity(
      opacity: 0.6,
      child: Card(
        color: Colors.white,
        elevation: 0,
        margin: const EdgeInsets.only(bottom: 6),
        child: ListTile(
          leading: Icon(icon, color: Colors.black54),
          title: Text(label),
          trailing: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: Colors.black12,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text('Sắp có', style: TextStyle(fontSize: 12)),
          ),
          onTap: () => ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Tính năng này sắp ra mắt, bạn quay lại sau nhé.')),
          ),
        ),
      ),
    );
  }

  void _push(BuildContext context, Widget page) {
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => page));
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final confirmed = await showConfirmBox(
      context,
      title: 'Bạn muốn đăng xuất?',
      message: 'Bạn sẽ cần đăng nhập lại để đặt sân và xem lịch đặt của mình.',
      confirmLabel: 'Đăng xuất',
      cancelLabel: 'Ở lại',
      danger: true,
    );
    if (confirmed) onLogout?.call();
  }
}

/// Ảnh đại diện của khách: bấm để chọn ảnh từ thư viện và tải lên máy chủ.
class _AvatarPicker extends StatefulWidget {
  final String initial;

  const _AvatarPicker({required this.initial});

  @override
  State<_AvatarPicker> createState() => _AvatarPickerState();
}

class _AvatarPickerState extends State<_AvatarPicker> {
  static const int _maxBytes = 5 * 1024 * 1024;

  String? _url = AuthApi.current?.avatarUrl;
  bool _uploading = false;

  bool get _hasPhoto =>
      _url != null && _url!.isNotEmpty && !_url!.endsWith('default-user.jpg');

  void _toast(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _pick() async {
    if (_uploading) return;
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        imageQuality: 85,
      );
      if (picked == null) return;
      final name = picked.name.toLowerCase();
      if (!(name.endsWith('.jpg') ||
          name.endsWith('.jpeg') ||
          name.endsWith('.png') ||
          name.endsWith('.webp'))) {
        _toast('Chỉ nhận ảnh JPG, PNG, WEBP.');
        return;
      }
      if (await picked.length() > _maxBytes) {
        _toast('Ảnh tối đa 5MB.');
        return;
      }
      setState(() => _uploading = true);
      final bytes = await picked.readAsBytes();
      final url = await AuthApi.uploadAvatar(bytes, picked.name);
      if (!mounted) return;
      setState(() {
        _url = url ?? _url;
        _uploading = false;
      });
      _toast('Đã cập nhật ảnh đại diện.');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _toast(error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _uploading = false);
      _toast('Chưa đổi được ảnh đại diện. Bạn kiểm tra quyền truy cập ảnh và mạng rồi thử lại nhé.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _pick,
      child: Stack(
        children: [
          CircleAvatar(
            radius: 32,
            backgroundColor: Colors.white,
            backgroundImage:
                _hasPhoto ? NetworkImage(ApiClient.resolveFileUrl(_url!)) : null,
            child: _uploading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  )
                : (_hasPhoto
                    ? null
                    : Text(
                        widget.initial,
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: _green,
                        ),
                      )),
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: _green,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 1.5),
              ),
              child: const Icon(Icons.camera_alt, size: 12, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
