// Hàm đổi giờ/ngày dùng chung cho model và API đặt sân.

/// "20:30" hoặc "20:30:00" -> số phút kể từ 00:00.
int parseHm(String value) {
  final parts = value.split(':');
  final hour = int.tryParse(parts.first) ?? 0;
  final minute = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
  return hour * 60 + minute;
}

String _two(int value) => value.toString().padLeft(2, '0');

/// 1230 -> "20:30" (định dạng gửi cho API).
String toApiTime(int minutes) => '${_two(minutes ~/ 60)}:${_two(minutes % 60)}';

/// DateTime -> "2026-11-03" (định dạng gửi cho API).
String toApiDate(DateTime date) => '${date.year}-${_two(date.month)}-${_two(date.day)}';
