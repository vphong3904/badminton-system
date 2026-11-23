import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/api_client.dart';
import 'notifications_api.dart';

/// Số thông báo chưa đọc, dùng cho chấm đỏ ở chuông trang chủ và mục "Thông báo"
/// của màn Tài khoản. Khi đã đăng nhập, hỏi máy chủ mỗi [_interval]; có thông báo mới
/// trong lúc đang mở app thì gọi [onNewArrived] để AppShell hiện banner.
class NotificationStore extends ChangeNotifier {
  NotificationStore._();
  static final NotificationStore instance = NotificationStore._();

  static const Duration _interval = Duration(seconds: 30);

  int _unread = 0;
  int? _lastSeen; // null = chưa tải lần nào (không báo "mới" ở lần tải đầu)
  Timer? _timer;

  int get unread => _unread;

  /// Gọi khi số chưa đọc tăng so với lần hỏi trước. Tham số = số thông báo mới.
  void Function(int count)? onNewArrived;

  /// Bắt đầu hỏi định kỳ (gọi sau khi đăng nhập).
  void start() {
    _timer?.cancel();
    _lastSeen = null;
    refresh();
    _timer = Timer.periodic(_interval, (_) => refresh());
  }

  /// Chỉ dừng hỏi định kỳ (không thông báo cho widget; dùng khi huỷ AppShell).
  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// Dừng và xoá số đếm (gọi khi đăng xuất / hết phiên).
  void clear() {
    _timer?.cancel();
    _timer = null;
    _lastSeen = null;
    if (_unread != 0) {
      _unread = 0;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    if (!ApiClient.hasToken) return;
    try {
      final count = await NotificationsApi.fetchUnreadCount();
      final previous = _lastSeen;
      _lastSeen = count;
      if (count != _unread) {
        _unread = count;
        notifyListeners();
      }
      if (previous != null && count > previous) {
        onNewArrived?.call(count - previous);
      }
    } catch (_) {
      // Im lặng: lần hỏi sau sẽ thử lại, không làm phiền người dùng.
    }
  }

  /// Màn Thông báo đã tải/đánh dấu đọc xong và biết số chưa đọc chính xác.
  void setUnread(int count) {
    _lastSeen = count;
    if (count != _unread) {
      _unread = count;
      notifyListeners();
    }
  }
}
