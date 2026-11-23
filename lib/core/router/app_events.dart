import 'package:flutter/foundation.dart';

/// Sự kiện điều hướng dùng chung giữa các màn hình (không cần truyền callback qua nhiều lớp).
class AppEvents {
  AppEvents._();

  /// Tăng giá trị để yêu cầu AppShell chuyển sang tab "Lịch đặt" và tải lại danh sách đơn.
  /// Dùng sau khi khách gửi ảnh chuyển khoản xong (đặt lịch thành công, chờ chủ sân duyệt).
  static final ValueNotifier<int> openBookingHistory = ValueNotifier<int>(0);

  static void requestOpenBookingHistory() => openBookingHistory.value++;
}
