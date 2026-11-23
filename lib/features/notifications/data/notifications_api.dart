import '../../../core/network/api_client.dart';
import '../../../models/notification_model.dart';

/// Gọi API thông báo (`/thong-bao`, dùng chung cho mọi vai trò, cần đăng nhập).
class NotificationsApi {
  NotificationsApi._();

  static Future<({List<AppNotification> items, int unread})> fetch({
    int page = 1,
  }) async {
    final data = await ApiClient.get(
      '/thong-bao',
      query: {'trang': '$page', 'soLuong': '30'},
    );
    final map = (data as Map).cast<String, dynamic>();
    final list = (map['cacThongBao'] as List? ?? const [])
        .whereType<Map>()
        .map((m) => AppNotification.fromJson(m.cast<String, dynamic>()))
        .toList();
    return (items: list, unread: _asInt(map['soChuaDoc']));
  }

  static Future<int> fetchUnreadCount() async {
    final data = await ApiClient.get('/thong-bao/chua-doc');
    return data is Map ? _asInt(data['soChuaDoc']) : 0;
  }

  static Future<void> markRead(int id) async {
    await ApiClient.patch('/thong-bao/$id/da-doc');
  }

  static Future<void> markAllRead() async {
    await ApiClient.post('/thong-bao/da-doc-tat-ca');
  }

  static int _asInt(dynamic v) =>
      v is num ? v.toInt() : int.tryParse('${v ?? 0}') ?? 0;
}
