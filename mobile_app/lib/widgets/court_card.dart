import 'package:flutter/material.dart';
import '../models/court.dart';
import '../utils/formatters.dart';

class CourtCard extends StatelessWidget {
  final Court court;
  final VoidCallback onBook;
  const CourtCard({super.key, required this.court, required this.onBook});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Color(0xFFE3EAE5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 105,
            width: double.infinity,
            color: const Color(0xFFDDF1E5),
            child: Stack(
              children: [
                const Center(
                  child: Icon(
                    Icons.sports_tennis,
                    size: 58,
                    color: Color(0xFF16845B),
                  ),
                ),
                Positioned(
                  top: 10,
                  right: 12,
                  child: Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.star, color: Colors.orange, size: 15),
                        Text(' ${court.rating}'),
                      ],
                    ),
                  ),
                ),
                if (!court.isActive)
                  const Center(
                    child: Text(
                      'TẠM NGƯNG',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.red,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  court.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(
                      Icons.location_on_outlined,
                      size: 16,
                      color: Colors.grey,
                    ),
                    Expanded(
                      child: Text(
                        court.address,
                        style: const TextStyle(
                          color: Colors.grey,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${formatMoney(court.pricePerHour)} / giờ',
                        style: const TextStyle(
                          color: Color(0xFF16845B),
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    FilledButton(
                      onPressed: court.isActive ? onBook : null,
                      child: const Text('Xem / đặt'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
