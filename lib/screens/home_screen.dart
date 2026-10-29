import 'package:flutter/material.dart';
import '../models/court.dart';
import '../widgets/court_card.dart';
import 'extra_screens.dart';

class HomeScreen extends StatelessWidget {
  final List<Court> courts;
  final VoidCallback onOpenSearch;
  final ValueChanged<Court> onBook;
  const HomeScreen({
    super.key,
    required this.courts,
    required this.onOpenSearch,
    required this.onBook,
  });

  @override
  Widget build(BuildContext context) {
    final active = courts.where((c) => c.isActive).toList();
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFF16845B),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(
                Icons.sports_tennis,
                color: Colors.white,
                size: 28,
              ),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'BADMINTON BOOKING',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF10583F),
                    ),
                  ),
                  Text(
                    'Đặt sân dễ dàng, chơi hết mình!',
                    style: TextStyle(color: Colors.grey, fontSize: 12),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const NotificationsScreen()),
              ),
              icon: const Icon(Icons.notifications_none),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF16845B), Color(0xFF10583F)],
            ),
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'SẴN SÀNG RA SÂN?',
                style: TextStyle(
                  color: Color(0xFFB9F3D5),
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Tìm sân cầu lông\nphù hợp với bạn',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 25,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: onOpenSearch,
                icon: const Icon(Icons.search),
                label: const Text('Tìm sân ngay'),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF10583F),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Sân nổi bật',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            TextButton(
              onPressed: onOpenSearch,
              child: const Text('Xem tất cả'),
            ),
          ],
        ),
        if (active.isEmpty) const Text('Chưa có sân đang hoạt động.'),
        ...active.map(
          (court) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: CourtCard(court: court, onBook: () => onBook(court)),
          ),
        ),
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: Text(
            'Dữ liệu minh họa • Chưa kết nối máy chủ',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey, fontSize: 11),
          ),
        ),
      ],
    );
  }
}
