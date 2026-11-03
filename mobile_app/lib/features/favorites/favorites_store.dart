import 'package:flutter/foundation.dart';

import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/features/favorites/favorites_api.dart';

/// Danh sách sân yêu thích. Dùng chung cho trang chủ, danh sách tìm kiếm và
/// màn hình "Sân yêu thích". Được đồng bộ với máy chủ khi đã đăng nhập.
class FavoritesStore extends ChangeNotifier {
  FavoritesStore._();
  static final FavoritesStore instance = FavoritesStore._();

  final Set<String> _ids = <String>{};

  /// AppShell gắn vào để mở màn đăng nhập khi khách chưa đăng nhập mà bấm tim.
  Future<bool> Function()? ensureLogin;

  Set<String> get ids => Set.unmodifiable(_ids);
  bool isFavorite(String id) => _ids.contains(id);

  /// Tải danh sách yêu thích từ máy chủ (sau khi đăng nhập).
  Future<void> load() async {
    if (!ApiClient.hasToken) return;
    try {
      final serverIds = await FavoritesApi.fetch();
      _ids
        ..clear()
        ..addAll(serverIds);
      notifyListeners();
    } catch (_) {
      // Giữ nguyên danh sách hiện có nếu tải lỗi.
    }
  }

  /// Xóa dữ liệu cục bộ (khi đăng xuất).
  void clear() {
    _ids.clear();
    notifyListeners();
  }

  /// Bật/tắt yêu thích và lưu lên máy chủ. [onError] nhận thông báo lỗi.
  Future<void> toggle(String id, [ValueChanged<String>? onError]) async {
    if (!ApiClient.hasToken) {
      final ok = await ensureLogin?.call() ?? false;
      if (!ok) return;
    }

    final nowFavorite = !_ids.contains(id);
    if (nowFavorite) {
      _ids.add(id);
    } else {
      _ids.remove(id);
    }
    notifyListeners();

    final venueId = int.tryParse(id);
    if (venueId == null) return; // sân mẫu, không có trên máy chủ

    try {
      if (nowFavorite) {
        await FavoritesApi.add(venueId);
      } else {
        await FavoritesApi.remove(venueId);
      }
    } catch (error) {
      // Lưu thất bại: hoàn tác trên giao diện.
      if (nowFavorite) {
        _ids.remove(id);
      } else {
        _ids.add(id);
      }
      notifyListeners();
      onError?.call(error is ApiException ? error.message : 'Không thể lưu sân yêu thích.');
    }
  }
}
