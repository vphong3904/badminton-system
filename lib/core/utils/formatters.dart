String formatMoney(int value) {
  final text = value.toString();
  final out = StringBuffer();

  for (var i = 0; i < text.length; i++) {
    out.write(text[i]);

    final remaining = text.length - i - 1;
    if (remaining > 0 && remaining % 3 == 0) {
      out.write('.');
    }
  }

  return '$out đ';
}

String formatDate(DateTime date) =>
    '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';

const List<String> _weekdayNames = [
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
  'Chủ nhật',
];

/// Ví dụ: "Thứ bảy, 31/10/2026".
String formatWeekdayDate(DateTime date) =>
    '${_weekdayNames[date.weekday - 1]}, ${formatDate(date)}';

/// Ví dụ: 372.9 -> "372.9m", 1250 -> "1.3km".
String formatDistance(double meters) => meters < 1000
    ? '${meters.toStringAsFixed(1)}m'
    : '${(meters / 1000).toStringAsFixed(1)}km';

/// Ví dụ: (5, 0) -> "05:00".
String formatHm(int hour, int minute) =>
    '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

/// Ví dụ: 1230 phút kể từ 00:00 -> "20h30", 540 -> "9h00".
String formatHourLabel(int minutes) =>
    '${minutes ~/ 60}h${(minutes % 60).toString().padLeft(2, '0')}';

/// Ví dụ: 60 -> "1h00", 90 -> "1h30".
String formatTotalHours(int minutes) => formatHourLabel(minutes);

/// Ví dụ: 1230 -> "20:30".
String formatMinutesAsHm(int minutes) => formatHm(minutes ~/ 60, minutes % 60);
