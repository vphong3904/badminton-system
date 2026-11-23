import 'package:flutter/material.dart' show TimeOfDay;
import '../../../core/network/api_client.dart';
import '../../../core/utils/location_service.dart';
import '../../../models/availability_filter.dart';
import '../../../models/court_model.dart';

/// Gọi API danh sách cơ sở cho trang chủ (không cần đăng nhập).
class VenueApi {
  VenueApi._();

  // Cache ngắn hạn: mở lại Trang chủ/Tìm kiếm trong 60s không gọi lại backend.
  static List<Court>? _cache;
  static DateTime? _cachedAt;
  static Future<List<Court>>? _inflight;
  static const Duration _ttl = Duration(seconds: 60);

  static void clearCache() {
    _cache = null;
    _cachedAt = null;
  }

  /// `GET /khach/co-so/danh-sach`: mọi cơ sở đang hoạt động và còn sân con.
  ///
  /// `Court.id` chính là `maCoSo` nên màn đặt lịch gọi được lịch của đúng
  /// cơ sở đã chọn.
  /// [force] = true (kéo để làm mới) bỏ qua cache. Nhiều nơi gọi cùng lúc
  /// chỉ tạo 1 request.
  static Future<List<Court>> fetchVenues({bool force = false}) {
    final cached = _cache;
    final at = _cachedAt;
    if (!force &&
        cached != null &&
        at != null &&
        DateTime.now().difference(at) < _ttl) {
      return Future.value(cached);
    }
    return _inflight ??= _download().whenComplete(() => _inflight = null);
  }

  static Future<List<Court>> _download() async {
    final data = await ApiClient.get('/khach/co-so/danh-sach');
    if (data is! List) {
      throw const ApiException('Dữ liệu danh sách cơ sở không hợp lệ.');
    }

    final venues = <Court>[];
    for (final item in data) {
      if (item is! Map) continue;
      try {
        venues.add(Court.fromApi(item.cast<String, dynamic>()));
      } catch (_) {
        // Bỏ qua một cơ sở lỗi dữ liệu, không làm hỏng cả danh sách.
      }
    }
    _cache = venues;
    _cachedAt = DateTime.now();
    return venues;
  }

  /// `GET /khach/co-so`: tìm theo bộ lọc, mọi tiêu chí kết hợp (AND).
  /// Thứ tự trả về do backend quyết định: có lọc giá → giá rẻ → đắt trước;
  /// sau đó có [location] → gần → xa, không có → sao cao → thấp. Backend trả mỗi dòng 1 sân nên ở đây gom
  /// theo `maCoSo` (giữ thứ tự), `numberOfCourts` = số sân phù hợp.
  static Future<List<Court>> searchVenues(
    AvailabilityFilter filter, {
    UserLocation? location,
  }) async {
    final query = <String, String>{
      if (filter.hasTimeSlot) ...{
        'ngay': _isoDate(filter.date!),
        'gioBatDau': _hm(filter.start!),
        'gioKetThuc': _hm(filter.end!),
      },
      if (filter.province != null) 'tinhThanh': filter.province!,
      if (filter.province != null && filter.district != null)
        'quanHuyen': filter.district!,
      if (filter.hasPriceRange) ...{
        'giaToiThieu': '${filter.minPrice}',
        'giaToiDa': '${filter.maxPrice}',
      },
      if (location != null) ...{
        'viDo': '${location.latitude}',
        'kinhDo': '${location.longitude}',
      },
    };

    final data = await ApiClient.get('/khach/co-so', query: query);
    if (data is! List) {
      throw const ApiException('Dữ liệu tìm kiếm không hợp lệ.');
    }

    final byVenue = <int, Map<String, dynamic>>{};
    final soSan = <int, int>{};
    for (final item in data) {
      if (item is! Map) continue;
      final row = item.cast<String, dynamic>();
      final id = (row['maCoSo'] as num?)?.toInt();
      if (id == null) continue;
      byVenue.putIfAbsent(id, () => row); // LinkedHashMap giữ thứ tự BE
      soSan[id] = (soSan[id] ?? 0) + 1;
    }

    final venues = <Court>[];
    for (final entry in byVenue.entries) {
      try {
        final row = {...entry.value, 'soSan': soSan[entry.key]};
        final distance = (row['khoangCachMet'] as num?)?.toDouble();
        final court = Court.fromApi(row);
        venues.add(distance == null ? court : court.copyWith(distanceMeters: distance));
      } catch (_) {
        // Bỏ qua một cơ sở lỗi dữ liệu.
      }
    }
    return venues;
  }

  static String _isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  static String _hm(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}
