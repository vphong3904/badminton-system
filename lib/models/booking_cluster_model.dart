import '../core/utils/time_utils.dart';

/// Một cụm giờ liền nhau trên MỘT sân (sau khi gộp các ô khách chọn). Mỗi cụm = một đơn con ở backend.
class BookingCluster {
  final int courtId;
  final String courtName;
  final int startMinute;
  final int endMinute;

  const BookingCluster({
    required this.courtId,
    required this.courtName,
    required this.startMinute,
    required this.endMinute,
  });

  int get minutes => endMinute - startMinute;

  /// Dạng một phần tử `cacMuc` của `POST /khach/dat-san/nhieu`.
  Map<String, dynamic> toApiItem() => {
    'maSan': courtId,
    'gioBatDau': toApiTime(startMinute),
    'gioKetThuc': toApiTime(endMinute),
  };

  /// Khớp với một cụm trùng backend trả về (so theo sân + giờ, không theo `chiSo`).
  bool overlaps(ConflictCluster other) =>
      courtId == other.courtId &&
      startMinute < other.endMinute &&
      endMinute > other.startMinute;
}

/// Cụm bị trùng/khóa do backend trả về trong 409 `chiTiet.cacCumTrung`.
class ConflictCluster {
  final int courtId;
  final String courtName;
  final int startMinute;
  final int endMinute;

  /// 'booked' (vừa có người đặt) hoặc 'locked' (chủ sân khóa).
  final String reason;

  const ConflictCluster({
    required this.courtId,
    required this.courtName,
    required this.startMinute,
    required this.endMinute,
    required this.reason,
  });

  factory ConflictCluster.fromJson(Map<String, dynamic> json) => ConflictCluster(
    courtId: (json['maSan'] as num).toInt(),
    courtName: (json['tenSan'] as String?) ?? 'Sân',
    startMinute: parseHm(json['gioBatDau'] as String),
    endMinute: parseHm(json['gioKetThuc'] as String),
    reason: (json['lyDo'] as String?) ?? 'booked',
  );

  /// Đọc danh sách từ `ApiException.data`; trả rỗng nếu không có/ sai dạng.
  static List<ConflictCluster> listFrom(Map<String, dynamic>? data) {
    final raw = data?['cacCumTrung'];
    if (raw is! List) return const [];
    final result = <ConflictCluster>[];
    for (final item in raw) {
      if (item is! Map) continue;
      try {
        result.add(ConflictCluster.fromJson(item.cast<String, dynamic>()));
      } catch (_) {
        // Bỏ qua phần tử sai dạng.
      }
    }
    return result;
  }
}
