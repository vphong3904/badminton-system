import 'package:flutter/material.dart';
import 'package:flutter_application_1/features/payment/screens/payment_screen.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';

const green = Color(0xFF16845B);

class BookingDetailScreen extends StatelessWidget {
  final Booking booking;

  const BookingDetailScreen({super.key, required this.booking});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết đặt sân')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    booking.court.name,
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(booking.court.address),
                  const Divider(height: 28),
                  _row('Mã đặt sân', booking.id),
                  _row('Ngày chơi', formatDate(booking.date)),
                  _row('Giờ bắt đầu', booking.timeSlot),
                  _row('Thời lượng', '${booking.durationMinutes} phút'),
                  _row('Tổng tiền', formatMoney(booking.totalPrice)),
                  _row('Trạng thái đặt sân', booking.status),
                  _row(
                    'Thanh toán',
                    booking.status == 'Đã xác nhận'
                        ? 'Đã thanh toán'
                        : 'Chờ thanh toán',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          if (booking.status.toLowerCase().contains('chờ'))
            FilledButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PaymentScreen(booking: booking),
                  ),
                );
              },
              child: const Text('Tiếp tục thanh toán'),
            ),
          OutlinedButton(
            onPressed: () {
              showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Hủy đặt sân?'),
                  content: const Text(
                    'Bản demo chưa áp dụng chính sách hủy '
                    'và hoàn tiền thực tế.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      child: const Text('Đóng'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('Yêu cầu hủy đặt sân'),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
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
