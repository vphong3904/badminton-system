import 'package:flutter/material.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';

const green = Color(0xFF16845B);

class PaymentScreen extends StatefulWidget {
  final Booking? booking;

  const PaymentScreen({super.key, this.booking});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  @override
  Widget build(BuildContext context) {
    final booking = widget.booking;

    return Scaffold(
      appBar: AppBar(title: const Text('Thanh toán đặt sân')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  const Text(
                    'QUÉT MÃ QR ĐỂ THANH TOÁN',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    width: 190,
                    height: 190,
                    decoration: BoxDecoration(
                      border: Border.all(color: green, width: 2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.qr_code_2, size: 160),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    formatMoney(booking?.totalPrice ?? 90000),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: green,
                    ),
                  ),
                  const Text(
                    'Ngân hàng / mã QR minh họa',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _line('Mã giao dịch', booking?.id ?? 'DEMO-BOOKING-001'),
          _line('Sân', booking?.court.name ?? 'Sân đã chọn'),
          _line('Trạng thái', 'Chờ thanh toán'),
          const SizedBox(height: 16),
          const Text(
            'Lưu ý: Đây là màn hình mô phỏng. Không chuyển tiền thật; '
            'xác minh giao dịch cần backend/cổng thanh toán.',
            style: TextStyle(color: Colors.deepOrange),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () {
              showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Chưa kết nối ngân hàng'),
                  content: const Text(
                    'Ứng dụng chưa thể tự xác nhận thanh toán. '
                    'Khi tích hợp backend, trạng thái sẽ được cập nhật '
                    'từ kết quả xác minh.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      child: const Text('Đã hiểu'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('Tôi đã thanh toán – kiểm tra'),
          ),
        ],
      ),
    );
  }

  Widget _line(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: const TextStyle(color: Colors.grey)),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
