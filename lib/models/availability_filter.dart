import 'package:flutter/material.dart';
import '../core/utils/formatters.dart';

/// Điều kiện "Tìm kiếm lịch trống".
class AvailabilityFilter {
  final DateTime? date;
  final TimeOfDay? start;
  final TimeOfDay? end;
  final String? province;
  final String? district;

  /// Khoảng giá/giờ (VNĐ). Luôn đi chung: có cả hai hoặc không có.
  final int? minPrice;
  final int? maxPrice;

  const AvailabilityFilter({
    this.date,
    this.start,
    this.end,
    this.province,
    this.district,
    this.minPrice,
    this.maxPrice,
  });

  bool get isEmpty =>
      date == null &&
      start == null &&
      end == null &&
      province == null &&
      district == null &&
      minPrice == null &&
      maxPrice == null;

  /// Có chọn khung giờ: ngày + giờ bắt đầu + giờ kết thúc đi chung bộ 3.
  bool get hasTimeSlot => date != null && start != null && end != null;

  bool get hasPriceRange => minPrice != null && maxPrice != null;

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

    if (hasPriceRange) {
      parts.add('${formatMoney(minPrice!)} - ${formatMoney(maxPrice!)}/giờ');
    }

    return parts.join(' • ');
  }
}
