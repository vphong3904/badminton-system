import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/api_routes.dart';

/// API sân yêu thích của khách hàng (cần đăng nhập).
class FavoritesApi {
  FavoritesApi._();

  /// Danh sách mã cơ sở (`maCoSo`) khách đã thích.
  static Future<Set<String>> fetch() async {
    final data = await ApiClient.get(ApiRoutes.favorites);
    final list = data is List
        ? data
        : (data is Map ? (data['danhSach'] ?? const []) : const []);

    final ids = <String>{};
    for (final item in list as List) {
      Object? id = item;
      if (item is Map) {
        id = item['maCoSo'] ??
            (item['coSo'] is Map ? (item['coSo'] as Map)['maCoSo'] : null);
      }
      if (id != null) ids.add(id.toString().split('.').first);
    }
    return ids;
  }

  static Future<void> add(int venueId) async {
    await ApiClient.post(ApiRoutes.favorites, body: {'maCoSo': venueId});
  }

  static Future<void> remove(int venueId) async {
    await ApiClient.delete(ApiRoutes.favorite(venueId));
  }
}
