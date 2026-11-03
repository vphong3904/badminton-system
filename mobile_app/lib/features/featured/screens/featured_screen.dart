import 'package:flutter/material.dart';

import 'package:flutter_application_1/core/utils/text_utils.dart';
import 'package:flutter_application_1/models/court_model.dart';
import 'package:flutter_application_1/shared/venue_card.dart';

class FeaturedScreen extends StatelessWidget {
  final List<Court> courts;
  final ValueChanged<Court> onBook;

  const FeaturedScreen({super.key, required this.courts, required this.onBook});

  bool _isBadminton(Court court) {
    return removeDiacritics(court.sport.trim().toLowerCase()) == 'cau long';
  }

  @override
  Widget build(BuildContext context) {
    final results = courts
        .where((court) => court.isActive && _isBadminton(court))
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        const Text(
          'Nổi bật',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 5),
        const Text(
          'Danh sách sân cầu lông đang hoạt động.',
          style: TextStyle(color: Colors.black54, fontSize: 14),
        ),
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Sân cầu lông',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            Text(
              '${results.length} sân',
              style: const TextStyle(
                color: Colors.black54,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (results.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Column(
              children: [
                Icon(Icons.sports_tennis, size: 50, color: Colors.grey),
                SizedBox(height: 12),
                Text(
                  'Chưa có sân cầu lông đang hoạt động.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ),
          )
        else
          ...results.map(
            (court) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: VenueCard(
                court: court,
                onOpen: () => onBook(court),
                showRating: false,
              ),
            ),
          ),
      ],
    );
  }
}
