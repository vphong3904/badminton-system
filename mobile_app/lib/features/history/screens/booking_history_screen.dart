import 'package:flutter/material.dart';

import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/features/booking/data/booking_api.dart';
import 'package:flutter_application_1/features/booking/data/booking_callbacks.dart';
import 'package:flutter_application_1/features/payment/screens/payment_screen.dart';
import 'package:flutter_application_1/models/booking_model.dart';

class BookingHistoryScreen extends StatefulWidget {
  final List<Booking> bookings;

  final ValueChanged<Booking> onCancelBooking;

  final BookingPaymentUpdate? onPaymentUpdate;

  /// Tải lại danh sách lịch đặt từ máy chủ.
  final Future<void> Function()? onRefresh;

  const BookingHistoryScreen({
    super.key,
    required this.bookings,
    required this.onCancelBooking,
    this.onPaymentUpdate,
    this.onRefresh,
  });

  @override
  State<BookingHistoryScreen> createState() => _BookingHistoryScreenState();
}

class _BookingHistoryScreenState extends State<BookingHistoryScreen> {
  // ======================================================
  // LỌC LỊCH ĐẶT
  // ======================================================

  List<Booking> _filterBookings(int tabIndex) {
    final result = [...widget.bookings];

    result.sort((a, b) => b.date.compareTo(a.date));

    switch (tabIndex) {
      case 1:
        // Sắp tới: chưa hủy và chưa hoàn thành.
        return result.where((booking) {
          return !booking.isCancelled && booking.status != 'Đã hoàn thành';
        }).toList();

      case 2:
        return result
            .where((booking) => booking.status == 'Đã hoàn thành')
            .toList();

      case 3:
        return result.where((booking) => booking.isCancelled).toList();

      default:
        return result;
    }
  }

  // ======================================================
  // XÁC NHẬN HỦY ĐẶT SÂN
  // ======================================================

  Future<void> _confirmCancel(Booking booking) async {
    if (booking.isCancelled) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Hủy đặt sân?'),
          content: const Text(
            'Lịch đặt sẽ được chuyển sang trạng thái "Đã hủy" và giải phóng sân.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Không'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('Xác nhận hủy'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) return;

    // Đơn đã tạo trên backend thì hủy trên backend trước để nhả sân.
    final apiId = booking.apiId;
    if (apiId != null) {
      try {
        await BookingApi.cancelBooking(apiId);
      } on ApiException catch (error) {
        _message(error.message);
        return;
      } catch (_) {
        _message('Không thể hủy đơn. Vui lòng thử lại.');
        return;
      }
      if (!mounted) return;
    }

    widget.onCancelBooking(booking);
    setState(() {});
  }

  // ======================================================
  // TIẾP TỤC THANH TOÁN TRỰC TUYẾN
  // ======================================================

  Future<void> _continuePayment(Booking booking) async {
    if (booking.isCancelled) {
      _message('Lịch đặt này đã bị hủy.');
      return;
    }

    if (booking.isPaid) {
      _message('Lịch đặt này đã thanh toán.');
      return;
    }

    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => PaymentScreen(
          booking: booking,
          onPaymentUpdate: widget.onPaymentUpdate,
        ),
      ),
    );

    if (!mounted) return;

    setState(() {});
  }

  void _message(String value) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(value)));
  }

  // ======================================================
  // TRẠNG THÁI LỊCH ĐẶT
  // ======================================================

  Color _bookingStatusColor(String status) {
    switch (status) {
      case 'Đã xác nhận':
        return Colors.green;

      case 'Đã hoàn thành':
        return Colors.blue;

      case 'Đã hủy':
        return Colors.red;

      default:
        return Colors.orange;
    }
  }

  // ======================================================
  // TRẠNG THÁI THANH TOÁN
  // ======================================================

  Color _paymentStatusColor(String status) {
    switch (status) {
      case 'Đã thanh toán':
        return Colors.green;

      case 'Thanh toán thất bại':
        return Colors.red;

      default:
        return Colors.orange;
    }
  }

  // ======================================================
  // THẺ TRẠNG THÁI
  // ======================================================

  Widget _statusChip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  // ======================================================
  // CHI TIẾT BIÊN NHẬN
  // ======================================================

  Widget _buildPaymentProof(Booking booking) {
    if (!booking.isPaid) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFE6F5EB),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.verified, color: Colors.green, size: 19),
              SizedBox(width: 6),
              Text(
                'Bằng chứng thanh toán',
                style: TextStyle(
                  color: Colors.green,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),

          const SizedBox(height: 8),

          _infoRow('Phương thức', booking.paymentMethod),

          _infoRow('Mã giao dịch', booking.transactionId ?? 'Chưa có mã'),

          _infoRow(
            'Thời gian',
            booking.paidAt == null
                ? 'Chưa có thông tin'
                : _formatDateTime(booking.paidAt!),
          ),

          _infoRow(
            'Mã bằng chứng',
            booking.paymentProof ?? 'Chưa có thông tin',
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: Colors.black54, fontSize: 12),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(DateTime date) {
    final value = date.toLocal();

    return '${value.day.toString().padLeft(2, '0')}/'
        '${value.month.toString().padLeft(2, '0')}/'
        '${value.year} '
        '${value.hour.toString().padLeft(2, '0')}:'
        '${value.minute.toString().padLeft(2, '0')}';
  }

  // ======================================================
  // CHI TIẾT LỊCH ĐẶT
  // ======================================================

  void _showBookingDetail(Booking booking) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Chi tiết lịch đặt',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 16),

                  _infoRow('Mã đặt sân', booking.id),
                  _infoRow('Tên sân', booking.court.name),
                  _infoRow('Địa chỉ', booking.court.address),
                  _infoRow('Ngày chơi', _formatDate(booking.date)),
                  _infoRow('Giờ bắt đầu', booking.timeSlot),
                  _infoRow('Thời lượng', '${booking.durationMinutes} phút'),
                  _infoRow('Tổng tiền', formatMoney(booking.totalPrice)),
                  _infoRow('Trạng thái đặt sân', booking.status),
                  _infoRow('Trạng thái thanh toán', booking.paymentStatus),

                  _buildPaymentProof(booking),

                  const SizedBox(height: 16),

                  if (!booking.isCancelled &&
                      booking.status != 'Đã hoàn thành')
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () {
                          Navigator.pop(context);
                          _confirmCancel(booking);
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                        ),
                        child: const Text('Hủy đặt sân'),
                      ),
                    ),

                  if (!booking.isPaid && !booking.isCancelled)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pop(context);
                          _continuePayment(booking);
                        },
                        child: const Text('Tiếp tục thanh toán trực tuyến'),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/'
        '${date.month.toString().padLeft(2, '0')}/'
        '${date.year}';
  }

  // ======================================================
  // ITEM LỊCH ĐẶT
  // ======================================================

  Widget _bookingCard(Booking booking) {
    return Card(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 13),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFE9EDEA)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xFFE1F4E9),
                  child: Icon(Icons.sports_tennis, color: Color(0xFF16845B)),
                ),

                const SizedBox(width: 10),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        booking.court.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),

                      const SizedBox(height: 4),

                      Text(
                        booking.court.address,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.black54,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const Divider(height: 22),

            _infoRow('Mã đặt sân', booking.id),
            _infoRow('Ngày chơi', _formatDate(booking.date)),
            _infoRow('Giờ bắt đầu', booking.timeSlot),
            _infoRow('Thời lượng', '${booking.durationMinutes} phút'),
            _infoRow('Tổng tiền', formatMoney(booking.totalPrice)),

            const SizedBox(height: 10),

            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                _statusChip(
                  booking.status,
                  _bookingStatusColor(booking.status),
                ),
                _statusChip(
                  booking.paymentStatus,
                  _paymentStatusColor(booking.paymentStatus),
                ),
              ],
            ),

            _buildPaymentProof(booking),

            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      _showBookingDetail(booking);
                    },
                    child: const Text('Xem chi tiết'),
                  ),
                ),

                if (!booking.isPaid && !booking.isCancelled) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        _continuePayment(booking);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF07834D),
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('Thanh toán'),
                    ),
                  ),
                ],
                if (!booking.isCancelled &&
                    booking.status != 'Đã hoàn thành') ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        _confirmCancel(booking);
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                      ),
                      child: const Text('Hủy đặt'),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ======================================================
  // DANH SÁCH THEO TAB
  // ======================================================

  Widget _buildList(int tabIndex) {
    final items = _filterBookings(tabIndex);

    if (items.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.event_busy, size: 48, color: Colors.grey),
              SizedBox(height: 10),
              Text(
                'Chưa có lịch đặt sân ở mục này.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
      );
    }

    final list = ListView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
      itemCount: items.length,
      itemBuilder: (context, index) {
        return _bookingCard(items[index]);
      },
    );

    final refresh = widget.onRefresh;
    if (refresh == null) return list;
    return RefreshIndicator(onRefresh: refresh, child: list);
  }

  // ======================================================
  // BUILD
  // ======================================================

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: const Color(0xFFF5F7F5),

        // Chỉ có MỘT AppBar trong màn hình này.
        appBar: AppBar(
          title: const Text('Lịch sử đặt sân'),
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF075532),
          elevation: 0,
          actions: [
            if (widget.onRefresh != null)
              IconButton(
                tooltip: 'Tải lại',
                icon: const Icon(Icons.refresh),
                onPressed: () => widget.onRefresh!(),
              ),
          ],
          bottom: const TabBar(
            isScrollable: true,
            labelColor: Color(0xFF07834D),
            unselectedLabelColor: Colors.grey,
            indicatorColor: Color(0xFF07834D),
            tabs: [
              Tab(text: 'Tất cả'),
              Tab(text: 'Sắp tới'),
              Tab(text: 'Đã hoàn thành'),
              Tab(text: 'Đã hủy'),
            ],
          ),
        ),

        body: TabBarView(
          children: [
            _buildList(0),
            _buildList(1),
            _buildList(2),
            _buildList(3),
          ],
        ),
      ),
    );
  }
}
