import 'package:flutter/material.dart';
import 'package:flutter_application_1/features/home/screens/feature_page.dart';

const green = Color(0xFF16845B);

class TransactionHistoryScreen extends StatelessWidget {
  const TransactionHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePage(
      title: 'Lịch sử thanh toán',
      icon: Icons.receipt_long,
      description: 'Theo dõi các giao dịch và trạng thái hoàn tiền.',
      items: [
        'Giao dịch DEMO-001 • Chờ thanh toán',
        'Giao dịch DEMO-002 • Đã thanh toán',
        'Không có dữ liệu ngân hàng thật trong bản demo',
      ],
    );
  }
}
