import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../models/court.dart';
import '../utils/formatters.dart';
import 'extra_screens.dart';

class BookingScreen extends StatefulWidget {
  final Court court;
  final ValueChanged<Booking> onBooked;

  const BookingScreen({super.key, required this.court, required this.onBooked});

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  DateTime date = DateTime.now();
  String? startSlot;
  int duration = 60;

  final List<String> slots = const [
    '06:00',
    '07:00',
    '08:00',
    '09:00',
    '14:00',
    '15:00',
    '17:00',
    '18:00',
    '19:00',
    '20:00',
  ];

  Future<void> confirmBooking() async {
    if (startSlot == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng chọn giờ bắt đầu.')),
      );
      return;
    }

    final method = await showModalBottomSheet<String>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Chọn phương thức thanh toán',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(
                  Icons.storefront_outlined,
                  color: Color(0xFF16845B),
                ),
                title: const Text('Thanh toán tại sân'),
                subtitle: const Text(
                  'Đặt sân trước, trả tiền trực tiếp khi đến sân',
                ),
                onTap: () => Navigator.pop(sheetContext, 'Tại sân'),
              ),
              ListTile(
                leading: const Icon(Icons.qr_code_2, color: Color(0xFF16845B)),
                title: const Text('Thanh toán QR'),
                subtitle: const Text('Mã QR minh họa, chưa kết nối ngân hàng'),
                onTap: () => Navigator.pop(sheetContext, 'QR'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => Navigator.pop(sheetContext),
                child: const Text('Quay lại'),
              ),
            ],
          ),
        ),
      ),
    );

    if (method == null || !mounted) return;

    final total = (widget.court.pricePerHour * duration / 60).round();

    final booking = Booking(
      id: 'BK${DateTime.now().millisecondsSinceEpoch}',
      court: widget.court,
      date: date,
      timeSlot: startSlot!,
      durationMinutes: duration,
      totalPrice: total,
      status: 'Chờ xác nhận',
      paymentStatus: method == 'Tại sân'
          ? 'Chờ thanh toán tại sân'
          : 'Chờ thanh toán',
      paymentMethod: method,
    );

    // Lưu lượt đặt vào danh sách của ứng dụng.
    widget.onBooked(booking);

    if (method == 'Tại sân') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đặt sân thành công. Vui lòng thanh toán khi đến sân.'),
        ),
      );

      Navigator.pop(context);
      return;
    }

    // Chỉ mở màn hình QR minh họa, không tự xác nhận đã thanh toán.
    Navigator.pushReplacement(
      context,
      MaterialPageRoute<void>(builder: (_) => PaymentScreen(booking: booking)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = (widget.court.pricePerHour * duration / 60).round();

    return Scaffold(
      appBar: AppBar(title: const Text('Chọn lịch đặt sân')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            widget.court.name,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            widget.court.address,
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(height: 22),

          const Text(
            '1. Chọn ngày chơi',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () async {
              final now = DateTime.now();
              final picked = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime(now.year, now.month, now.day),
                lastDate: now.add(const Duration(days: 90)),
              );

              if (picked != null && mounted) {
                setState(() => date = picked);
              }
            },
            icon: const Icon(Icons.calendar_month),
            label: Text(formatDate(date)),
          ),

          const SizedBox(height: 22),
          const Text(
            '2. Chọn thời lượng',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 30, label: Text('30 phút')),
              ButtonSegment(value: 60, label: Text('60 phút')),
              ButtonSegment(value: 90, label: Text('90 phút')),
              ButtonSegment(value: 120, label: Text('120 phút')),
            ],
            selected: {duration},
            onSelectionChanged: (values) {
              setState(() => duration = values.first);
            },
          ),

          const SizedBox(height: 22),
          const Text(
            '3. Chọn giờ bắt đầu',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: slots.map((slot) {
              return ChoiceChip(
                label: Text(slot),
                selected: startSlot == slot,
                onSelected: (_) {
                  setState(() => startSlot = slot);
                },
              );
            }).toList(),
          ),

          const SizedBox(height: 24),
          Card(
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _row('Ngày chơi', formatDate(date)),
                  _row('Bắt đầu', startSlot ?? 'Chưa chọn'),
                  _row('Thời lượng', '$duration phút'),
                  const Divider(),
                  _row('Tạm tính', formatMoney(total), bold: true),
                ],
              ),
            ),
          ),

          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: startSlot == null ? null : confirmBooking,
            icon: const Icon(Icons.event_available),
            label: const Padding(
              padding: EdgeInsets.all(14),
              child: Text('Xác nhận đặt sân'),
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Bản demo chưa kiểm tra giờ trống từ máy chủ. '
            'Thanh toán tại sân cần được chủ sân xác nhận sau khi nhận tiền.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey, fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                color: bold ? const Color(0xFF16845B) : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
