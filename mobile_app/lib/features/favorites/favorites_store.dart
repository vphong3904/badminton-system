import 'package:flutter/foundation.dart';

/// Danh sách sân yêu thích (trong bộ nhớ). Dùng chung cho trang chủ,
/// danh sách tìm kiếm và màn hình "Sân yêu thích".
class FavoritesStore extends ChangeNotifier {
  FavoritesStore._();
  static final FavoritesStore instance = FavoritesStore._();

  final Set<String> _ids = {'C102'};

  Set<String> get ids => Set.unmodifiable(_ids);
  bool isFavorite(String id) => _ids.contains(id);

  void toggle(String id) {
    if (!_ids.remove(id)) _ids.add(id);
    notifyListeners();
  }
}
