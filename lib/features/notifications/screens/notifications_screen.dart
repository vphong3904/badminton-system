import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/notification_store.dart';
import '../data/notifications_api.dart';
import '../../../models/notification_model.dart';

/// Màn Thông báo: đặt lịch thành công, đơn được duyệt, yêu cầu hoàn tiền đã gửi,
/// chủ sân đã hoàn tiền, kết quả khiếu nại...
/// [onOpenBooking] được gọi khi chạm vào thông báo liên quan tới đơn đặt sân
/// (AppShell chuyển sang tab Lịch đặt). [onOpenVenue] được gọi khi chạm thông báo
/// tham chiếu cơ sở (`loaiThamChieu='venue'`, vd đánh giá mới / chủ sân phản hồi) với
/// mã cơ sở; AppShell mở chi tiết cơ sở, không tìm thấy thì về trang chủ.
class NotificationsScreen extends StatefulWidget {
  final VoidCallback? onOpenBooking;
  final void Function(int maCoSo)? onOpenVenue;

  const NotificationsScreen({super.key, this.onOpenBooking, this.onOpenVenue});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!ApiClient.hasToken) {
      setState(() {
        _loading = false;
        _error = 'Vui lòng đăng nhập để xem thông báo.';
      });
      return;
    }
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final result = await NotificationsApi.fetch();
      if (!mounted) return;
      NotificationStore.instance.setUnread(result.unread);
      setState(() {
        _items = result.items;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Không tải được thông báo. Vui lòng thử lại.';
      });
    }
  }

  Future<void> _markAllRead() async {
    if (_items.every((n) => n.read)) return;
    try {
      await NotificationsApi.markAllRead();
    } catch (_) {
      return; // im lặng, lần mở sau sẽ thử lại
    }
    if (!mounted) return;
    NotificationStore.instance.setUnread(0);
    setState(() {
      _items = [for (final n in _items) n.copyWith(read: true)];
    });
  }

  Future<void> _open(AppNotification n) async {
    if (!n.read) {
      setState(() {
        _items = [for (final x in _items) x.id == n.id ? x.copyWith(read: true) : x];
      });
      NotificationStore.instance.setUnread(
        _items.where((x) => !x.read).length,
      );
      try {
        await NotificationsApi.markRead(n.id);
      } catch (_) {
        // Không chặn người dùng nếu đánh dấu đã đọc lỗi.
      }
    }
    if (!mounted) return;
    final goesToBooking = n.refType == 'booking' ||
        n.refType == 'payment' ||
        n.refType == 'complaint';
    if (goesToBooking && widget.onOpenBooking != null) {
      Navigator.pop(context);
      widget.onOpenBooking!();
    } else if (n.refType == 'venue' && n.refId != null && widget.onOpenVenue != null) {
      Navigator.pop(context);
      widget.onOpenVenue!(n.refId!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _items.any((n) => !n.read);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thông báo'),
        actions: [
          if (hasUnread)
            TextButton(onPressed: _markAllRead, child: const Text('Đọc tất cả')),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              if (ApiClient.hasToken)
                OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
            ],
          ),
        ),
      );
    }
    if (_items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          children: const [
            SizedBox(height: 140),
            Icon(Icons.notifications_none, size: 56, color: AppTheme.hintGrey),
            SizedBox(height: 10),
            Center(child: Text('Bạn chưa có thông báo nào.')),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        itemCount: _items.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (_, i) => _tile(_items[i]),
      ),
    );
  }

  Widget _tile(AppNotification n) {
    final style = _styleOf(n.type);
    return ListTile(
      tileColor: n.read ? null : AppTheme.mintSoft.withValues(alpha: 0.45),
      leading: CircleAvatar(
        backgroundColor: style.color.withValues(alpha: 0.14),
        child: Icon(style.icon, color: style.color),
      ),
      title: Text(
        n.title,
        style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.bold),
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(n.message),
            const SizedBox(height: 4),
            Text(
              _timeAgo(n.createdAt),
              style: const TextStyle(fontSize: 12, color: AppTheme.hintGrey),
            ),
          ],
        ),
      ),
      isThreeLine: true,
      trailing: n.read
          ? null
          : const CircleAvatar(radius: 4, backgroundColor: AppTheme.primaryColor),
      onTap: () => _open(n),
    );
  }

  ({IconData icon, Color color}) _styleOf(String type) {
    switch (type) {
      case 'booking_created':
        return (icon: Icons.event_available, color: AppTheme.primaryColor);
      case 'payment_success':
        return (icon: Icons.check_circle, color: AppTheme.primaryColor);
      case 'payment_failed':
        return (icon: Icons.error_outline, color: AppTheme.danger);
      case 'booking_cancelled':
        return (icon: Icons.event_busy, color: AppTheme.danger);
      case 'refund_requested':
        return (icon: Icons.currency_exchange, color: Colors.orange);
      case 'refund_completed':
      case 'refund':
        return (icon: Icons.payments_outlined, color: AppTheme.primaryColor);
      case 'complaint_received':
      case 'complaint_resolved':
        return (icon: Icons.report_gmailerrorred, color: Colors.orange);
      case 'owner_warning':
      case 'owner_banned':
        return (icon: Icons.warning_amber_rounded, color: AppTheme.danger);
      case 'review_sent':
        return (icon: Icons.star_rounded, color: AppTheme.primaryColor);
      case 'review_received':
        return (icon: Icons.star_half_rounded, color: Colors.amber.shade700);
      case 'review_replied':
        return (icon: Icons.reply_rounded, color: AppTheme.primaryColor);
      case 'review_hidden':
        return (icon: Icons.visibility_off_outlined, color: AppTheme.danger);
      case 'review_reminder':
        return (icon: Icons.rate_review_outlined, color: Colors.orange);
      default:
        return (icon: Icons.notifications_outlined, color: AppTheme.hintGrey);
    }
  }

  String _timeAgo(DateTime? time) {
    if (time == null) return '';
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return 'Vừa xong';
    if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
    if (diff.inHours < 24) return '${diff.inHours} giờ trước';
    if (diff.inDays < 7) return '${diff.inDays} ngày trước';
    final d = time.day.toString().padLeft(2, '0');
    final m = time.month.toString().padLeft(2, '0');
    return '$d/$m/${time.year}';
  }
}
