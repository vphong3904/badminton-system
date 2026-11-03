import 'package:flutter/material.dart';

const green = Color(0xFF16845B);

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final Set<int> read = {};

  final List<Map<String, Object>> notices = const [
    {
      'title': 'Đặt sân thành công',
      'message': 'Lịch đặt sân của bạn đã được ghi nhận.',
      'icon': Icons.check_circle,
    },
    {
      'title': 'Nhắc lịch chơi',
      'message': 'Bạn có lịch chơi lúc 19:00 hôm nay.',
      'icon': Icons.alarm,
    },
    {
      'title': 'Ưu đãi cuối tuần',
      'message': 'Khám phá các sân có giá tốt gần bạn.',
      'icon': Icons.local_offer,
    },
    {
      'title': 'Thanh toán đang chờ',
      'message': 'Vui lòng hoàn tất thanh toán trong thời gian giữ sân.',
      'icon': Icons.payment,
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thông báo'),
        actions: [
          TextButton(
            onPressed: () {
              setState(() {
                read.addAll(
                  List<int>.generate(notices.length, (index) => index),
                );
              });
            },
            child: const Text('Đọc tất cả'),
          ),
        ],
      ),
      body: ListView(
        children: List.generate(notices.length, (index) {
          final notice = notices[index];
          final isRead = read.contains(index);

          return ListTile(
            leading: CircleAvatar(
              backgroundColor: isRead
                  ? Colors.grey.shade200
                  : const Color(0xFFDDF3E5),
              child: Icon(notice['icon'] as IconData, color: green),
            ),
            title: Text(
              notice['title'] as String,
              style: TextStyle(
                fontWeight: isRead ? FontWeight.normal : FontWeight.bold,
              ),
            ),
            subtitle: Text(notice['message'] as String),
            trailing: isRead
                ? null
                : const CircleAvatar(radius: 4, backgroundColor: green),
            onTap: () {
              setState(() => read.add(index));
            },
          );
        }),
      ),
    );
  }
}
