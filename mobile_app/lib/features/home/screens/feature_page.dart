import 'package:flutter/material.dart';

/// Màn hình hiển thị các chức năng phụ của ứng dụng.
class FeaturePage extends StatelessWidget {
  final String title;
  final IconData icon;
  final String description;
  final List<String> items;

  const FeaturePage({
    super.key,
    required this.title,
    required this.icon,
    required this.description,
    this.items = const [],
  });

  static const Color green = Color(0xFF16845B);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),

      appBar: AppBar(
        title: Text(title),
        backgroundColor: Colors.white,
        foregroundColor: green,
        elevation: 0,
      ),

      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          // Khu vực giới thiệu chức năng.
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFFE1F4E9),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              children: [
                Icon(icon, size: 48, color: green),

                const SizedBox(height: 12),

                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: green,
                  ),
                ),

                const SizedBox(height: 10),

                Text(
                  description,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 14, color: Colors.black87),
                ),
              ],
            ),
          ),

          const SizedBox(height: 18),

          // Danh sách nội dung chức năng.
          if (items.isNotEmpty) ...[
            const Text(
              'Thông tin chi tiết',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 10),

            ...items.map(
              (item) => Card(
                color: Colors.white,
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 9),
                child: ListTile(
                  leading: const Icon(Icons.check_circle_outline, color: green),
                  title: Text(item),
                ),
              ),
            ),
          ] else
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Chức năng đang được phát triển.',
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
