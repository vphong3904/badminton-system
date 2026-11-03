import 'package:flutter/material.dart';
import '../models/court.dart';
import '../utils/formatters.dart';

class CourtDetailScreen extends StatelessWidget {
  final Court court;
  final VoidCallback onBook;
  const CourtDetailScreen({
    super.key,
    required this.court,
    required this.onBook,
  });

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Chi tiết sân')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Container(
          height: 180,
          decoration: BoxDecoration(
            color: const Color(0xFFDDF1E5),
            borderRadius: BorderRadius.circular(20),
          ),
          child: const Center(
            child: Icon(
              Icons.sports_tennis,
              size: 90,
              color: Color(0xFF16845B),
            ),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          court.name,
          style: const TextStyle(fontSize: 23, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Text(court.address, style: const TextStyle(color: Colors.grey)),
        const SizedBox(height: 12),
        Text(
          '${formatMoney(court.pricePerHour)} / giờ',
          style: const TextStyle(
            fontSize: 21,
            color: Color(0xFF16845B),
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'Đánh giá: ${court.rating} ★  •  ${court.numberOfCourts} sân',
          style: const TextStyle(fontSize: 16),
        ),
        const SizedBox(height: 20),
        const Text(
          'Tiện ích',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: court.amenities
              .map(
                (a) => Chip(
                  avatar: const Icon(Icons.check_circle_outline, size: 17),
                  label: Text(a),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 25),
        FilledButton(
          onPressed: court.isActive ? onBook : null,
          child: const Padding(
            padding: EdgeInsets.all(12),
            child: Text('Chọn ngày và đặt sân'),
          ),
        ),
      ],
    ),
  );
}
