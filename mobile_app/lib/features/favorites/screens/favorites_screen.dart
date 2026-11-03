import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/features/favorites/favorites_store.dart';
import 'package:flutter_application_1/features/home/data/sample_data.dart';
import 'package:flutter_application_1/models/court_model.dart';

const green = Color(0xFF16845B);

class FavoritesScreen extends StatelessWidget {
  final List<Court> courts;

  const FavoritesScreen({super.key, this.courts = sampleCourts});

  @override
  Widget build(BuildContext context) {
    final store = FavoritesStore.instance;

    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final items = courts.where((c) => store.isFavorite(c.id)).toList();

        return Scaffold(
          appBar: AppBar(title: const Text('Sân yêu thích')),
          body: items.isEmpty
              ? const Center(
                  child: Text(
                    '♡\nBạn chưa có sân yêu thích',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 18),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: items
                      .map(
                        (court) => Card(
                          color: Colors.white,
                          child: ListTile(
                            leading: const CircleAvatar(
                              child: Icon(Icons.sports_tennis),
                            ),
                            title: Text(court.name),
                            subtitle: Text(
                              '${court.address}\n'
                              '${formatMoney(court.pricePerHour)}/giờ',
                            ),
                            isThreeLine: true,
                            trailing: IconButton(
                              tooltip: 'Bỏ yêu thích',
                              icon: const Icon(
                                Icons.favorite,
                                color: Colors.red,
                              ),
                              onPressed: () => store.toggle(court.id),
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
        );
      },
    );
  }
}
