import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../utils/formatters.dart';

class BookingHistoryScreen extends StatefulWidget {
  final List<Booking> bookings;
  final ValueChanged<Booking> onCancelBooking;

  final void Function(
    Booking booking, {
    required String paymentStatus,
    required String paymentMethod,
  })
  onPaymentUpdate;

  // Chỉ bật true cho màn hình quản lý.
  final bool canConfirmVenuePayment;

  const BookingHistoryScreen({
    super.key,
    required this.bookings,
    required this.onCancelBooking,
    required this.onPaymentUpdate,
    this.canConfirmVenuePayment = false,
  });

  @override
  State<BookingHistoryScreen> createState() => _BookingHistoryScreenState();
}

class _BookingHistoryScreenState extends State<BookingHistoryScreen> {
  int selectedTab = 0;

  List<Booking> get filteredBookings {
    switch (selectedTab) {
      case 1:
        return widget.bookings.where((b) {
          return b.status != 'Đã hủy' && b.status != 'Hoàn thành';
        }).toList();
      case 2:
        return widget.bookings.where((b) => b.status == 'Hoàn thành').toList();
      case 3:
        return widget.bookings.where((b) => b.status == 'Đã hủy').toList();
      default:
        return widget.bookings;
    }
  }

  Future<void> confirmCancel(Booking booking) async {
    if (booking.status == 'Đã hủy') return;

    final shouldCancel = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Hủy đặt sân?'),
        content: Text(
          'Bạn có chắc chắn muốn hủy đặt sân '
          '${booking.court.name} không?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Giữ đặt sân'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Xác nhận hủy'),
          ),
        ],
      ),
    );

    if (shouldCancel == true && mounted) {
      widget.onCancelBooking(booking);

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Đã hủy lượt đặt sân.')));
    }
  }

  Future<void> choosePaymentMethod(Booking booking) async {
    if (booking.status == 'Đã hủy' ||
        booking.paymentStatus == 'Đã thanh toán') {
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
                leading: const Icon(Icons.storefront_outlined),
                title: const Text('Thanh toán tại sân'),
                subtitle: const Text('Trả tiền trực tiếp khi đến sân'),
                onTap: () => Navigator.pop(sheetContext, 'Tại sân'),
              ),
              ListTile(
                leading: const Icon(Icons.qr_code_2),
                title: const Text('Thanh toán QR'),
                subtitle: const Text(
                  'Thanh toán minh họa, chưa xác minh giao dịch',
                ),
                onTap: () => Navigator.pop(sheetContext, 'QR'),
              ),
            ],
          ),
        ),
      ),
    );

    if (method == null || !mounted) return;

    if (method == 'Tại sân') {
      widget.onPaymentUpdate(
        booking,
        paymentStatus: 'Chờ thanh toán tại sân',
        paymentMethod: 'Tại sân',
      );

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Đã chọn thanh toán tại sân. '
            'Vui lòng trả tiền khi đến nơi.',
          ),
        ),
      );
    } else {
      widget.onPaymentUpdate(
        booking,
        paymentStatus: 'Chờ thanh toán',
        paymentMethod: 'QR',
      );

      // Không tự đánh dấu QR đã thanh toán.
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Đã chọn thanh toán QR. '
            'Giao dịch cần được xác minh.',
          ),
        ),
      );
    }
  }

  Future<void> confirmPaymentAtVenue(Booking booking) async {
    if (!widget.canConfirmVenuePayment ||
        booking.status == 'Đã hủy' ||
        booking.paymentStatus != 'Chờ thanh toán tại sân') {
      return;
    }

    final shouldConfirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Xác nhận đã nhận tiền'),
        content: Text(
          'Xác nhận đã nhận ${formatMoney(booking.totalPrice)} '
          'cho sân ${booking.court.name}?\n\n'
          'Chỉ xác nhận nếu khách đã thanh toán thực tế.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Quay lại'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Đã nhận tiền'),
          ),
        ],
      ),
    );

    if (shouldConfirm == true && mounted) {
      widget.onPaymentUpdate(
        booking,
        paymentStatus: 'Đã thanh toán',
        paymentMethod: 'Tại sân',
      );

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã cập nhật trạng thái thanh toán.')),
      );
    }
  }

  Color statusColor(String status) {
    switch (status) {
      case 'Đã hủy':
        return Colors.red;
      case 'Hoàn thành':
        return Colors.blue;
      case 'Đã xác nhận':
        return Colors.green;
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = filteredBookings;

    return Scaffold(
      appBar: AppBar(title: const Text('Lịch sử đặt sân')),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                _tabButton('Tất cả', 0),
                _tabButton('Sắp tới', 1),
                _tabButton('Hoàn thành', 2),
                _tabButton('Đã hủy', 3),
              ],
            ),
          ),
          Expanded(
            child: items.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.calendar_month_outlined,
                          size: 64,
                          color: Colors.grey,
                        ),
                        SizedBox(height: 12),
                        Text('Chưa có lượt đặt sân nào'),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      return _bookingCard(items[index]);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _tabButton(String label, int index) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selectedTab == index,
        onSelected: (_) {
          setState(() => selectedTab = index);
        },
      ),
    );
  }

  Widget _bookingCard(Booking booking) {
    final isCancelled = booking.status == 'Đã hủy';
    final isPaid = booking.paymentStatus == 'Đã thanh toán';
    final isVenuePending = booking.paymentStatus == 'Chờ thanh toán tại sân';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.sports_tennis,
                  color: Color(0xFF16845B),
                  size: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        booking.court.name,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(booking.court.address),
                    ],
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            _infoRow('Mã đặt sân', booking.id),
            _infoRow('Ngày chơi', formatDate(booking.date)),
            _infoRow('Giờ bắt đầu', booking.timeSlot),
            _infoRow('Thời lượng', '${booking.durationMinutes} phút'),
            _infoRow('Tổng tiền', formatMoney(booking.totalPrice)),
            _infoRow(
              'Trạng thái đặt sân',
              booking.status,
              valueColor: statusColor(booking.status),
            ),
            _infoRow(
              'Thanh toán',
              booking.paymentStatus,
              valueColor: isPaid ? Colors.green : Colors.orange,
            ),
            if (booking.paymentMethod.isNotEmpty)
              _infoRow('Phương thức', booking.paymentMethod),

            // Chọn hoặc đổi phương thức nếu chưa thanh toán.
            if (!isCancelled && !isPaid) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => choosePaymentMethod(booking),
                  icon: const Icon(Icons.payment),
                  label: Text(
                    booking.paymentMethod.isEmpty
                        ? 'Chọn phương thức thanh toán'
                        : 'Đổi phương thức thanh toán',
                  ),
                ),
              ),
            ],

            // Chỉ quản lý mới xác nhận nhận tiền tại sân.
            if (!isCancelled &&
                isVenuePending &&
                widget.canConfirmVenuePayment) ...[
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => confirmPaymentAtVenue(booking),
                  icon: const Icon(Icons.check_circle_outline),
                  label: const Text('Xác nhận đã nhận tiền tại sân'),
                ),
              ),
            ],

            if (!isCancelled) ...[
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: Colors.red),
                  onPressed: () => confirmCancel(booking),
                  icon: const Icon(Icons.cancel_outlined),
                  label: const Text('Hủy đặt sân'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label, style: const TextStyle(color: Colors.grey)),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(fontWeight: FontWeight.w500, color: valueColor),
            ),
          ),
        ],
      ),
    );
  }
}
