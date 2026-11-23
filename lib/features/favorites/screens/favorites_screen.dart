import 'package:flutter/material.dart';
import '../favorites_store.dart';
import '../../../models/court_model.dart';
import '../../../shared/venue_card.dart';

/// Danh sách sân yêu thích. [courts] là danh sách sân tải từ API,
/// [onBook] mở chi tiết sân khi bấm vào thẻ.
class FavoritesScreen extends StatelessWidget {
  final List<Court> courts;
  final ValueChanged<Court>? onBook;

  const FavoritesScreen({super.key, this.courts = const [], this.onBook});

  @override
  Widget build(BuildContext context) {
    final store = FavoritesStore.instance;

    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final items = courts.where((c) => store.isFavorite(c.id)).toList();

        return Scaffold(
          backgroundColor: const Color(0xFFF1F9F4),
          appBar: AppBar(title: Text('Sân yêu thích (${items.length})')),
          body: items.isEmpty
              ? const Center(
                  child: Text(
                    '♡\nBạn chưa có sân yêu thích\nBấm vào biểu tượng tim trên thẻ sân để lưu.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 14),
                  itemBuilder: (context, index) {
                    final court = items[index];
                    return VenueCard(
                      court: court,
                      onOpen: () => onBook?.call(court),
                    );
                  },
                ),
        );
      },
    );
  }
}
