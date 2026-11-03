import 'package:flutter/material.dart' show DateUtils;
import 'package:image_picker/image_picker.dart' show XFile;

import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/api_routes.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/models/court_model.dart';

// ============================================================
// MODELS
// ============================================================

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

/// Kết quả tạo đơn đặt sân.
class CreatedBooking {
  final int bookingId; // maDatSan
  final String orderCode; // maDon (cũng là nội dung chuyển khoản)
  final int totalAmount;

  const CreatedBooking({
    required this.bookingId,
    required this.orderCode,
    required this.totalAmount,
  });

  factory CreatedBooking.fromJson(Map<String, dynamic> json) {
    final first = ((json['cacDon'] as List).first as Map).cast<String, dynamic>();
    return CreatedBooking(
      bookingId: (first['maDatSan'] as num).toInt(),
      orderCode: first['maDon'] as String,
      totalAmount: (json['tongTien'] as num).toInt(),
    );
  }
}

/// Hóa đơn thanh toán của một đơn đặt sân.
class Invoice {
  final int bookingId;
  final String orderCode;
  final int amount;
  final String bookingStatus; // pending_payment | confirmed | expired | cancelled...
  final String paymentStatus; // pending | confirming | success | expired | late_payment
  final int? remainingSeconds;
  final String? qrUrl;
  final String transferContent;

  const Invoice({
    required this.bookingId,
    required this.orderCode,
    required this.amount,
    required this.bookingStatus,
    required this.paymentStatus,
    required this.remainingSeconds,
    required this.qrUrl,
    required this.transferContent,
  });

  /// DECIMAL của MySQL có thể về dạng chuỗi ("120000"), nên nhận cả số lẫn chuỗi.
  static int _toInt(dynamic v) =>
      v is num ? v.toInt() : int.parse(v.toString().split('.').first);

  factory Invoice.fromJson(Map<String, dynamic> json) {
    return Invoice(
      bookingId: _toInt(json['maDatSan']),
      orderCode: json['maDon'] as String,
      amount: _toInt(json['soTien']),
      bookingStatus: json['trangThaiDatSan'] as String,
      paymentStatus: json['trangThaiThanhToan'] as String,
      remainingSeconds:
          json['conLaiGiay'] == null ? null : _toInt(json['conLaiGiay']),
      qrUrl: json['anhQrUrl'] as String?,
      transferContent:
          (json['noiDungChuyenKhoan'] as String?) ?? (json['maDon'] as String),
    );
  }

  bool get isPaid => paymentStatus == 'success';
  bool get isCancelled => bookingStatus == 'cancelled';
  bool get isExpired =>
      !isPaid &&
      (bookingStatus == 'expired' ||
          paymentStatus == 'expired' ||
          paymentStatus == 'late_payment');
  bool get isWaitingForBank => paymentStatus == 'confirming';

  /// Còn đang chờ khách thanh toán.
  bool get isOpen => !isPaid && !isExpired && !isCancelled;
}

// ============================================================
// HELPERS
// ============================================================

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

// ============================================================
// API
// ============================================================

/// Gọi các API đặt sân và thanh toán của khách hàng.
class BookingApi {
  BookingApi._();

  /// Lịch tất cả sân của cơ sở trong một ngày (không cần đăng nhập).
  static Future<VenueSchedule> fetchSchedule(int venueId, DateTime date) async {
    final data = await ApiClient.get(
      '/khach/co-so/$venueId/lich-ngay',
      query: {'ngay': toApiDate(date)},
    );
    return VenueSchedule.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Tạo đơn đặt sân. Sân được giữ chỗ trong vài phút chờ thanh toán.
  static Future<CreatedBooking> createBooking({
    required int courtId,
    required DateTime date,
    required int startMinute,
    required int endMinute,
    required String name,
    required String phone,
    String? note,
  }) async {
    final trimmedNote = note?.trim() ?? '';
    final data = await ApiClient.post(
      '/khach/dat-san',
      body: {
        'maSan': courtId,
        'ngay': toApiDate(date),
        'gioBatDau': toApiTime(startMinute),
        'gioKetThuc': toApiTime(endMinute),
        'tenKhach': name.trim(),
        'soDienThoai': phone,
        if (trimmedNote.isNotEmpty) 'ghiChu': trimmedNote,
      },
    );
    return CreatedBooking.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Hóa đơn: số tiền, mã QR, trạng thái và thời gian giữ chỗ còn lại.
  static Future<Invoice> fetchInvoice(int bookingId) async {
    final data = await ApiClient.get('/khach/dat-san/$bookingId/hoa-don-nhap');
    return Invoice.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Gửi ảnh chuyển khoản. Ảnh chỉ để tham khảo; đơn được xác nhận khi ngân
  /// hàng báo có tiền (webhook SePay).
  static Future<void> uploadTransferProof(int bookingId, XFile file) async {
    await ApiClient.uploadImage(
      '/thanh-toan/$bookingId/anh-chuyen-khoan',
      field: 'tepAnh',
      file: file,
    );
  }

  /// Đường dẫn lấy danh sách đơn đặt sân của khách đang đăng nhập.
  /// Đổi tại đây nếu backend dùng route khác.
  static const String myBookingsPath = ApiRoutes.myBookings;

  /// Danh sách lịch đặt của khách (cần đăng nhập). [venues] dùng để gắn
  /// thông tin cơ sở (tên, địa chỉ...) vào từng lịch.
  static Future<List<Booking>> fetchMyBookings(List<Court> venues) async {
    final data = await ApiClient.get(myBookingsPath);
    final list = data is List
        ? data
        : (data is Map ? (data['danhSach'] ?? data['cacDon'] ?? const []) : const []);

    final result = <Booking>[];
    for (final item in list as List) {
      if (item is! Map) continue;
      final booking = _bookingFromJson(item.cast<String, dynamic>(), venues);
      if (booking != null) result.add(booking);
    }
    return result;
  }

  static Booking? _bookingFromJson(Map<String, dynamic> j, List<Court> venues) {
    final bookingId = _asInt(j['maDatSan']);
    if (bookingId == null) return null;

    final venueId = _asInt(j['maCoSo']);
    Court? court;
    for (final v in venues) {
      if (venueId != null && v.venueId == venueId) {
        court = v;
        break;
      }
    }
    court ??= Court(
      id: (venueId ?? bookingId).toString(),
      apiId: venueId,
      name: (j['tenCoSo'] as String?) ?? 'Cơ sở',
      address: (j['diaChi'] as String?) ?? '',
      pricePerHour: 0,
    );

    final start = parseHm((j['gioBatDau'] ?? '00:00').toString());
    final end = parseHm((j['gioKetThuc'] ?? '00:00').toString());
    final date =
        DateTime.tryParse((j['ngay'] ?? '').toString().split('T').first) ??
        DateTime.now();

    final apiStatus = (j['trangThai'] ?? j['trangThaiDatSan'] ?? '').toString();
    final apiPay = (j['trangThaiThanhToan'] ?? '').toString();
    final paid = apiPay == 'success';

    final String status;
    switch (apiStatus) {
      case 'cancelled':
      case 'expired':
        status = 'Đã hủy';
        break;
      case 'completed':
        status = 'Đã hoàn thành';
        break;
      case 'confirmed':
        status = 'Đã xác nhận';
        break;
      default:
        status = paid ? 'Đã xác nhận' : 'Chờ xác nhận';
    }

    return Booking(
      id: (j['maDon'] ?? 'DS$bookingId').toString(),
      court: court,
      date: DateUtils.dateOnly(date),
      timeSlot: toApiTime(start),
      durationMinutes: end > start ? end - start : 0,
      totalPrice: _asInt(j['tongTien'] ?? j['soTien']) ?? 0,
      status: status,
      paymentStatus: paid ? 'Đã thanh toán' : 'Chờ thanh toán',
      paymentMethod: 'Chuyển khoản QR',
      apiId: bookingId,
      courtName: j['tenSan'] as String?,
      contactName: j['tenKhach'] as String?,
      contactPhone: j['soDienThoai'] as String?,
    );
  }

  static int? _asInt(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString().split('.').first);
  }

  static Future<void> cancelBooking(int bookingId) async {
    await ApiClient.post('/khach/dat-san/$bookingId/huy');
  }
}
