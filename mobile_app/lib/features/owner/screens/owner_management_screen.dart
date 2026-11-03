import 'package:flutter/material.dart';
import 'package:flutter_application_1/features/home/screens/feature_page.dart';
import 'package:flutter_application_1/features/home/data/sample_data.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';

const green = Color(0xFF16845B);

class OwnerManagementScreen extends StatelessWidget {
  const OwnerManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quản lý sân của tôi')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(child: _stat('Lượt đặt hôm nay', '12')),
              const SizedBox(width: 10),
              Expanded(child: _stat('Doanh thu demo', '1,2tr')),
            ],
          ),
          const SizedBox(height: 18),
          const Text(
            'Quản lý cơ sở',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          ...sampleCourts.map(
            (court) => Card(
              color: Colors.white,
              child: ListTile(
                leading: const Icon(Icons.sports_tennis, color: green),
                title: Text(court.name),
                subtitle: Text(
                  '${court.numberOfCourts} sân • '
                  '${formatMoney(court.pricePerHour)}/giờ',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => FeaturePage(
                        title: court.name,
                        icon: Icons.edit,
                        description:
                            'Quản lý thông tin, giá và trạng thái sân.',
                        items: const [
                          'Cập nhật thông tin cơ sở',
                          'Thiết lập giờ hoạt động',
                          'Xem lịch sân',
                          'Quản lý giá thuê',
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const FeaturePage(
                    title: 'Lịch sân',
                    icon: Icons.calendar_month,
                    description: 'Theo dõi các khung giờ đã đặt và còn trống.',
                    items: [
                      '06:00 – 08:00 • Còn trống',
                      '18:00 – 19:00 • Đã đặt',
                      '19:00 – 20:00 • Chờ xác nhận',
                    ],
                  ),
                ),
              );
            },
            icon: const Icon(Icons.calendar_month),
            label: const Text('Xem lịch sân'),
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Card(
      color: const Color(0xFFE1F4E9),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: green,
              ),
            ),
            Text(label, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
