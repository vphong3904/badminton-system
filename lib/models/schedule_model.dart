import 'package:flutter/material.dart' show DateUtils;
import '../core/utils/time_utils.dart';

/// Một khoảng giờ trong ngày đã bị chiếm trên một sân con.
class BusyRange {
  final int startMinute;
  final int endMinute;

  /// true: chủ sân khóa sân; false: đã có người đặt / đang giữ chỗ.
  final bool locked;

  const BusyRange(this.startMinute, this.endMinute, {required this.locked});

  bool overlaps(int start, int end) => startMinute < end && endMinute > start;
}

/// Một sân con (Sân 1, Sân 2...) và các khung giờ đã bị chiếm.
class CourtSchedule {
  final int id;
  final String name;
  final List<BusyRange> busy;

  const CourtSchedule({
    required this.id,
    required this.name,
    required this.busy,
  });

  BusyRange? busyAt(int start, int end) {
    for (final range in busy) {
      if (range.overlaps(start, end)) return range;
    }
    return null;
  }
}

/// Bảng giá theo khung giờ (giá mỗi giờ).
class PriceRule {
  final int startMinute;
  final int endMinute;
  final int pricePerHour;

  const PriceRule(this.startMinute, this.endMinute, this.pricePerHour);
}

/// Lịch của tất cả sân trong một cơ sở vào một ngày.
class VenueSchedule {
  final int venueId;
  final String name;
  final String address;
  final String phone;
  final String date; // yyyy-MM-dd
  final int openMinute;
  final int closeMinute;
  final int minMinutes;

  /// Số phút khách được đến trễ tối đa (chủ sân cấu hình: 15/20/30).
  /// null nếu backend chưa trả trường này (bản cũ) — khi đó không hiển thị.
  final int? maxLateMinutes;
  final List<CourtSchedule> courts;
  final List<PriceRule> prices;

  const VenueSchedule({
    required this.venueId,
    required this.name,
    required this.address,
    required this.phone,
    required this.date,
    required this.openMinute,
    required this.closeMinute,
    required this.minMinutes,
    this.maxLateMinutes,
    required this.courts,
    required this.prices,
  });

  factory VenueSchedule.fromJson(Map<String, dynamic> json) {
    final courts = (json['cacSan'] as List).map((item) {
      final map = (item as Map).cast<String, dynamic>();
      final busy = (map['cacKhungBan'] as List).map((raw) {
        final range = (raw as Map).cast<String, dynamic>();
        return BusyRange(
          parseHm(range['gioBatDau'] as String),
          parseHm(range['gioKetThuc'] as String),
          locked: range['loai'] == 'locked',
        );
      }).toList();
      return CourtSchedule(
        id: (map['maSan'] as num).toInt(),
        name: map['tenSan'] as String,
        busy: busy,
      );
    }).toList();

    final prices = (json['bangGia'] as List).map((item) {
      final map = (item as Map).cast<String, dynamic>();
      return PriceRule(
        parseHm(map['gioBatDau'] as String),
        parseHm(map['gioKetThuc'] as String),
        (map['giaMoiGio'] as num).toInt(),
      );
    }).toList();

    return VenueSchedule(
      venueId: (json['maCoSo'] as num).toInt(),
      name: json['tenCoSo'] as String,
      address: (json['diaChi'] as String?) ?? '',
      phone: (json['soDienThoai'] as String?) ?? '',
      date: json['ngay'] as String,
      openMinute: parseHm(json['gioMoCua'] as String),
      closeMinute: parseHm(json['gioDongCua'] as String),
      minMinutes: (json['soPhutDatToiThieu'] as num).toInt(),
      maxLateMinutes: (json['soPhutTreToiDa'] as num?)?.toInt(),
      courts: courts,
      prices: prices,
    );
  }

  /// Giá của một ô 30 phút bắt đầu tại [startMinute] (null nếu chưa có giá).
  /// Cùng cách tính với backend: giá mỗi giờ / 2.
  double? _halfHourPrice(int startMinute) {
    for (final rule in prices) {
      if (rule.startMinute <= startMinute && rule.endMinute >= startMinute + 30) {
        return rule.pricePerHour / 2;
      }
    }
    return null;
  }

  /// Giá của một khoảng [start, end), null nếu có ô chưa có giá.
  /// Tổng được làm tròn một lần ở cuối, giống backend.
  int? priceFor(int start, int end) {
    double total = 0;
    for (var minute = start; minute < end; minute += 30) {
      final price = _halfHourPrice(minute);
      if (price == null) return null;
      total += price;
    }
    return total.round();
  }
}
