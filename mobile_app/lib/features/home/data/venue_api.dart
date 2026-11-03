import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/models/court_model.dart';

/// Gọi API danh sách cơ sở cho trang chủ (không cần đăng nhập).
class VenueApi {
  VenueApi._();

  /// `GET /khach/co-so/danh-sach`: mọi cơ sở đang hoạt động và còn sân con.
  ///
  /// `Court.id` chính là `maCoSo` nên màn đặt lịch gọi được lịch của đúng
  /// cơ sở đã chọn.
  static Future<List<Court>> fetchVenues() async {
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
    return venues;
  }
}
