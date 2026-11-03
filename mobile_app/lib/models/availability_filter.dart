import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';

/// Điều kiện "Tìm kiếm lịch trống".
class AvailabilityFilter {
  final DateTime? date;
  final TimeOfDay? start;
  final TimeOfDay? end;
  final String? province;
  final String? district;

  const AvailabilityFilter({
    this.date,
    this.start,
    this.end,
    this.province,
    this.district,
  });

  bool get isEmpty =>
      date == null &&
      start == null &&
      end == null &&
      province == null &&
      district == null;

  int? get startMinutes =>
      start == null ? null : start!.hour * 60 + start!.minute;
  int? get endMinutes => end == null ? null : end!.hour * 60 + end!.minute;

  /// Ví dụ: "31/10/2026 • 18:00 - 20:00 • Quận 1, TP. Hồ Chí Minh".
  String get summary {
    final parts = <String>[];

    if (date != null) parts.add(formatDate(date!));

    if (start != null || end != null) {
      final s = start == null ? '--:--' : formatHm(start!.hour, start!.minute);
      final e = end == null ? '--:--' : formatHm(end!.hour, end!.minute);
      parts.add('$s - $e');
    }

    final place = [?district, ?province].join(', ');
    if (place.isNotEmpty) parts.add(place);

    return parts.join(' • ');
  }
}
