import 'package:flutter/material.dart';

<<<<<<< HEAD
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
=======
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/features/booking/screens/booking_screen.dart';

/// ============================================================
/// MÀN HÌNH LỊCH SỬ ĐẶT SÂN
/// ============================================================
///
/// Chức năng:
/// - Hiển thị Tất cả / Sắp tới / Đã hoàn thành / Đã hủy.
/// - Xem chi tiết từng lượt đặt.
/// - Tiếp tục thanh toán khi lượt đặt còn chờ thanh toán.
/// - Hủy lượt đặt chưa thanh toán và còn ở trạng thái sắp tới.
///
/// Lưu ý:
/// - Không tự hủy lượt đã thanh toán trong giao diện này.
/// - Lượt đã thanh toán cần gửi yêu cầu hủy và xử lý hoàn tiền
///   theo quy định của backend/chủ sân.
class BookingHistoryScreen extends StatefulWidget {
  final List<Booking> bookings;
  final ValueChanged<Booking> onCancelBooking;

  // Các callback thanh toán là tùy chọn để không bắt buộc backend
  // phải được tích hợp ngay ở giai đoạn giao diện demo.
  final BookingPaymentUpdate? onPaymentUpdate;
  final CreateOnlinePaymentCallback? onCreatePayment;
  final VerifyOnlinePaymentCallback? onVerifyPayment;
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

  const BookingHistoryScreen({
    super.key,
    required this.bookings,
    required this.onCancelBooking,
    this.onPaymentUpdate,
<<<<<<< HEAD
    this.onRefresh,
=======
    this.onCreatePayment,
    this.onVerifyPayment,
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
  });

  @override
  State<BookingHistoryScreen> createState() => _BookingHistoryScreenState();
}

class _BookingHistoryScreenState extends State<BookingHistoryScreen> {
<<<<<<< HEAD
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
=======
  static const Color _mauXanh = Color(0xFF16845B);
  static const Color _mauNen = Color(0xFFF5F7F5);

  // ------------------------------------------------------------
  // HÀM HỖ TRỢ NGÀY GIỜ
  // ------------------------------------------------------------

  /// Chuyển chuỗi giờ dạng HH:mm thành thời điểm bắt đầu của lượt đặt.
  DateTime _thoiDiemBatDau(Booking booking) {
    final cacPhan = booking.timeSlot.split(':');
    final gio = cacPhan.isNotEmpty ? int.tryParse(cacPhan[0]) ?? 0 : 0;
    final phut = cacPhan.length > 1 ? int.tryParse(cacPhan[1]) ?? 0 : 0;

    return DateTime(
      booking.date.year,
      booking.date.month,
      booking.date.day,
      gio,
      phut,
    );
  }

  /// Tính thời điểm kết thúc dựa trên giờ bắt đầu và thời lượng thuê.
  DateTime _thoiDiemKetThuc(Booking booking) {
    return _thoiDiemBatDau(
      booking,
    ).add(Duration(minutes: booking.durationMinutes));
  }

  /// Định dạng ngày để hiển thị trên thẻ lịch đặt.
  String _dinhDangNgay(DateTime ngay) {
    final ngayText = ngay.day.toString().padLeft(2, '0');
    final thangText = ngay.month.toString().padLeft(2, '0');
    return '$ngayText/$thangText/${ngay.year}';
  }

  /// Định dạng thời gian thành HH:mm.
  String _dinhDangGio(DateTime thoiGian) {
    final gio = thoiGian.hour.toString().padLeft(2, '0');
    final phut = thoiGian.minute.toString().padLeft(2, '0');
    return '$gio:$phut';
  }

  // ------------------------------------------------------------
  // PHÂN LOẠI TRẠNG THÁI LỊCH ĐẶT
  // ------------------------------------------------------------

  /// Kiểm tra lượt đặt đã bị hủy hay chưa.
  bool _laLichDaHuy(Booking booking) {
    return booking.isCancelled ||
        booking.status.toLowerCase().contains('đã hủy');
  }

  /// Kiểm tra lượt đặt đã hoàn thành hay chưa.
  ///
  /// Ưu tiên trạng thái do hệ thống lưu. Nếu chưa có trạng thái
  /// hoàn thành, dùng thời điểm kết thúc để phân loại giao diện.
  bool _laLichHoanThanh(Booking booking) {
    final trangThai = booking.status.toLowerCase();

    if (trangThai.contains('đã hoàn thành') ||
        trangThai.contains('hoàn thành')) {
      return true;
    }

    return _thoiDiemKetThuc(booking).isBefore(DateTime.now());
  }

  /// Lượt đặt sắp tới là lịch chưa hủy và chưa kết thúc.
  bool _laLichSapToi(Booking booking) {
    return !_laLichDaHuy(booking) && !_laLichHoanThanh(booking);
  }

  /// Lọc danh sách theo tab đang hiển thị.
  List<Booking> _layDanhSachTheoTab(int chiSoTab) {
    final danhSach = widget.bookings.where((booking) {
      switch (chiSoTab) {
        case 1:
          return _laLichSapToi(booking);
        case 2:
          return !_laLichDaHuy(booking) && _laLichHoanThanh(booking);
        case 3:
          return _laLichDaHuy(booking);
        case 0:
        default:
          return true;
      }
    }).toList();

    // Lịch sắp tới: thời gian gần nhất hiển thị trước.
    // Các tab còn lại: lịch mới nhất hiển thị trước.
    if (chiSoTab == 1) {
      danhSach.sort((a, b) => _thoiDiemBatDau(a).compareTo(_thoiDiemBatDau(b)));
    } else {
      danhSach.sort((a, b) => _thoiDiemBatDau(b).compareTo(_thoiDiemBatDau(a)));
    }

    return danhSach;
  }

  // ------------------------------------------------------------
  // HỦY LỊCH ĐẶT SÂN
  // ------------------------------------------------------------

  /// Chỉ cho hủy trực tiếp khi lịch còn ở tương lai và chưa thanh toán.
  /// Lịch đã thanh toán cần một quy trình yêu cầu hủy/hoàn tiền riêng.
  bool _duocPhepHuy(Booking booking) {
    return _laLichSapToi(booking) && !booking.isPaid;
  }

  /// Hiện hộp thoại để khách xác nhận trước khi hủy.
  Future<void> _xacNhanHuyDatSan(Booking booking) async {
    if (!_duocPhepHuy(booking)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Lịch đặt này không thể hủy trực tiếp. '
            'Với lịch đã thanh toán, vui lòng gửi yêu cầu hủy/hoàn tiền.',
          ),
        ),
      );
      return;
    }

    final dongYHuy = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Xác nhận hủy sân'),
          content: Text(
            'Bạn có chắc chắn muốn hủy lịch đặt tại '
            '${booking.court.name} không?\n\n'
            'Ngày chơi: ${_dinhDangNgay(booking.date)}\n'
            'Giờ bắt đầu: ${booking.timeSlot}\n'
            'Tổng tiền: ${formatMoney(booking.totalPrice)}\n\n'
            'Lịch đặt sẽ được chuyển sang trạng thái Đã hủy.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Giữ lại'),
            ),
            FilledButton.icon(
              onPressed: () => Navigator.pop(dialogContext, true),
              icon: const Icon(Icons.cancel_outlined),
              label: const Text('Xác nhận hủy'),
              style: FilledButton.styleFrom(
                backgroundColor: Colors.red.shade700,
                foregroundColor: Colors.white,
              ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
            ),
          ],
        );
      },
    );

<<<<<<< HEAD
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
=======
    if (!mounted || dongYHuy != true) return;

    // Gửi yêu cầu hủy về AppShell để cập nhật danh sách dùng chung.
    widget.onCancelBooking(booking);

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Đã gửi yêu cầu hủy lịch đặt sân.'),
        backgroundColor: _mauXanh,
      ),
    );

    setState(() {});
  }

  // ------------------------------------------------------------
  // TIẾP TỤC THANH TOÁN
  // ------------------------------------------------------------

  Future<void> _moManHinhThanhToan(Booking booking) async {
    if (booking.isPaid || _laLichDaHuy(booking)) return;

    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => OnlinePaymentScreen(
          booking: booking,
          onPaymentUpdate: widget.onPaymentUpdate,
          onCreatePayment: widget.onCreatePayment,
          onVerifyPayment: widget.onVerifyPayment,
        ),
      ),
    );

    // Cập nhật lại thẻ sau khi quay về từ màn hình thanh toán.
    if (mounted) {
      setState(() {});
    }
  }

  // ------------------------------------------------------------
  // HIỂN THỊ TRẠNG THÁI
  // ------------------------------------------------------------

  Widget _nhanTrangThai({
    required String noiDung,
    required Color mauNen,
    required Color mauChu,
    IconData? bieuTuong,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
      decoration: BoxDecoration(
        color: mauNen,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (bieuTuong != null) ...[
            Icon(bieuTuong, size: 13, color: mauChu),
            const SizedBox(width: 5),
          ],
          Text(
            noiDung,
            style: TextStyle(
              color: mauChu,
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
          ),
        ],
      ),
    );
  }

<<<<<<< HEAD
  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
=======
  Widget _nhanTrangThaiDatSan(Booking booking) {
    if (_laLichDaHuy(booking)) {
      return _nhanTrangThai(
        noiDung: 'Đã hủy',
        mauNen: Colors.red.shade50,
        mauChu: Colors.red.shade700,
        bieuTuong: Icons.cancel_outlined,
      );
    }

    if (_laLichHoanThanh(booking)) {
      return _nhanTrangThai(
        noiDung: 'Đã hoàn thành',
        mauNen: Colors.green.shade50,
        mauChu: Colors.green.shade800,
        bieuTuong: Icons.check_circle_outline,
      );
    }

    if (booking.status.toLowerCase().contains('xác nhận')) {
      return _nhanTrangThai(
        noiDung: booking.status,
        mauNen: Colors.green.shade50,
        mauChu: Colors.green.shade800,
      );
    }

    return _nhanTrangThai(
      noiDung: booking.status,
      mauNen: Colors.orange.shade50,
      mauChu: Colors.orange.shade800,
    );
  }

  Widget _nhanTrangThaiThanhToan(Booking booking) {
    final daHuy = _laLichDaHuy(booking);

    if (daHuy) {
      return _nhanTrangThai(
        noiDung: 'Không áp dụng',
        mauNen: Colors.grey.shade100,
        mauChu: Colors.grey.shade700,
      );
    }

    if (booking.isPaid) {
      return _nhanTrangThai(
        noiDung: 'Đã thanh toán',
        mauNen: Colors.green.shade50,
        mauChu: Colors.green.shade800,
        bieuTuong: Icons.check_circle_outline,
      );
    }

    return _nhanTrangThai(
      noiDung: booking.paymentStatus,
      mauNen: Colors.orange.shade50,
      mauChu: Colors.orange.shade800,
      bieuTuong: Icons.payment,
    );
  }

  // ------------------------------------------------------------
  // THẺ HIỂN THỊ MỘT LƯỢT ĐẶT
  // ------------------------------------------------------------

  Widget _dongThongTin(String nhan, String giaTri) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
<<<<<<< HEAD
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
=======
            flex: 1,
            child: Text(
              nhan,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 1,
            child: Text(
              giaTri,
              textAlign: TextAlign.left,
              style: const TextStyle(
                color: Colors.black87,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
            ),
          ),
        ],
      ),
    );
  }

<<<<<<< HEAD
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
=======
  Widget _nutXemChiTiet(Booking booking) {
    return OutlinedButton.icon(
      onPressed: () {
        Navigator.of(context).push<void>(
          MaterialPageRoute<void>(
            builder: (context) => _ChiTietDatSanScreen(
              booking: booking,
              dinhDangNgay: _dinhDangNgay,
              dinhDangGio: _dinhDangGio,
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
            ),
          ),
        );
      },
<<<<<<< HEAD
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
=======
      icon: const Icon(Icons.visibility_outlined, size: 17),
      label: const Text('Xem chi tiết'),
      style: OutlinedButton.styleFrom(
        foregroundColor: _mauXanh,
        side: BorderSide(color: Colors.grey.shade500),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }

  Widget _nutThanhToan(Booking booking) {
    return ElevatedButton.icon(
      onPressed: () => _moManHinhThanhToan(booking),
      icon: const Icon(Icons.payment, size: 17),
      label: const Text('Thanh toán'),
      style: ElevatedButton.styleFrom(
        backgroundColor: _mauXanh,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }

  Widget _nutHuyDatSan(Booking booking) {
    return OutlinedButton.icon(
      onPressed: () => _xacNhanHuyDatSan(booking),
      icon: const Icon(Icons.delete_outline, size: 18),
      label: const Text('Hủy đặt sân'),
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.red.shade700,
        side: BorderSide(color: Colors.red.shade300),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }

  Widget _theLichDat(Booking booking) {
    final duocThanhToan = !booking.isPaid && !_laLichDaHuy(booking);
    final duocHuy = _duocPhepHuy(booking);
    final gioKetThuc = _thoiDiemKetThuc(booking);

    return Card(
      margin: EdgeInsets.zero,
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.grey.shade200),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
<<<<<<< HEAD
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xFFE1F4E9),
                  child: Icon(Icons.sports_tennis, color: Color(0xFF16845B)),
                ),

                const SizedBox(width: 10),

=======
            // Tên sân và địa chỉ.
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: Color(0xFFE5F3EB),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.sports_tennis,
                    color: _mauXanh,
                    size: 25,
                  ),
                ),
                const SizedBox(width: 12),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        booking.court.name,
<<<<<<< HEAD
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
=======
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
<<<<<<< HEAD

                      const SizedBox(height: 4),

                      Text(
                        booking.court.address,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.black54,
                          fontSize: 12,
=======
                      const SizedBox(height: 4),
                      Text(
                        booking.court.address,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const Divider(height: 22),

<<<<<<< HEAD
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
=======
            // Các thông tin chính của lượt đặt.
            _dongThongTin('Mã đặt sân', booking.id),
            _dongThongTin('Ngày chơi', _dinhDangNgay(booking.date)),
            _dongThongTin('Giờ bắt đầu', booking.timeSlot),
            _dongThongTin('Giờ kết thúc', _dinhDangGio(gioKetThuc)),
            _dongThongTin('Thời lượng', '${booking.durationMinutes} phút'),
            _dongThongTin('Tổng tiền', formatMoney(booking.totalPrice)),

            const SizedBox(height: 8),

            // Hai trạng thái được hiển thị riêng biệt.
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _nhanTrangThaiDatSan(booking),
                _nhanTrangThaiThanhToan(booking),
              ],
            ),

            const SizedBox(height: 12),

            // Hàng nút xem chi tiết và thanh toán.
            Row(
              children: [
                Expanded(child: _nutXemChiTiet(booking)),
                if (duocThanhToan) ...[
                  const SizedBox(width: 8),
                  Expanded(child: _nutThanhToan(booking)),
                ],
              ],
            ),

            // Nút hủy nằm riêng một hàng để giao diện không bị chật.
            // Chỉ hiện nếu lịch còn sắp tới và chưa thanh toán.
            if (duocHuy) ...[
              const SizedBox(height: 8),
              SizedBox(width: double.infinity, child: _nutHuyDatSan(booking)),
            ],
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------
  // DANH SÁCH VÀ TRẠNG THÁI RỖNG
  // ------------------------------------------------------------

  Widget _trangThaiRong(int chiSoTab) {
    const tieuDe = [
      'Bạn chưa có lịch đặt sân nào.',
      'Bạn chưa có lịch đặt sắp tới.',
      'Chưa có lịch đặt nào hoàn thành.',
      'Bạn chưa có lịch đặt nào bị hủy.',
    ];

    const moTa = [
      'Hãy tìm sân cầu lông và đặt lịch chơi ngay.',
      'Các lịch đặt trong tương lai sẽ hiển thị tại đây.',
      'Lịch đặt đã kết thúc sẽ được lưu ở mục này.',
      'Các lịch đã hủy sẽ được lưu để bạn tiện theo dõi.',
    ];

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              chiSoTab == 3
                  ? Icons.event_busy_outlined
                  : Icons.calendar_today_outlined,
              size: 58,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 14),
            Text(
              tieuDe[chiSoTab],
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 7),
            Text(
              moTa[chiSoTab],
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
          ],
        ),
      ),
    );
  }

<<<<<<< HEAD
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
=======
  Widget _danhSachLichDat(int chiSoTab) {
    final danhSach = _layDanhSachTheoTab(chiSoTab);

    if (danhSach.isEmpty) {
      return _trangThaiRong(chiSoTab);
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      itemCount: danhSach.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        return _theLichDat(danhSach[index]);
      },
    );
  }

  // ------------------------------------------------------------
  // GIAO DIỆN CHÍNH
  // ------------------------------------------------------------
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
<<<<<<< HEAD
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
=======
        backgroundColor: _mauNen,
        appBar: AppBar(
          title: const Text(
            'Lịch sử đặt sân',
            style: TextStyle(
              color: Color(0xFF10583F),
              fontWeight: FontWeight.w500,
            ),
          ),
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF10583F),
          elevation: 0,
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: _mauXanh,
            unselectedLabelColor: Colors.grey,
            indicatorColor: _mauXanh,
            indicatorWeight: 3,
            labelStyle: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
            tabs: [
              Tab(text: 'Tất cả'),
              Tab(text: 'Sắp tới'),
              Tab(text: 'Đã hoàn thành'),
              Tab(text: 'Đã hủy'),
            ],
          ),
        ),
<<<<<<< HEAD

        body: TabBarView(
          children: [
            _buildList(0),
            _buildList(1),
            _buildList(2),
            _buildList(3),
=======
        body: TabBarView(
          children: [
            _danhSachLichDat(0),
            _danhSachLichDat(1),
            _danhSachLichDat(2),
            _danhSachLichDat(3),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
          ],
        ),
      ),
    );
  }
}
<<<<<<< HEAD
=======

/// ============================================================
/// MÀN HÌNH CHI TIẾT MỘT LƯỢT ĐẶT
/// ============================================================
///
/// Màn hình phụ để khách xem đầy đủ thông tin của một lịch đặt.
class _ChiTietDatSanScreen extends StatelessWidget {
  final Booking booking;
  final String Function(DateTime) dinhDangNgay;
  final String Function(DateTime) dinhDangGio;

  const _ChiTietDatSanScreen({
    required this.booking,
    required this.dinhDangNgay,
    required this.dinhDangGio,
  });

  Widget _dongThongTin(String nhan, String giaTri) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(nhan, style: TextStyle(color: Colors.grey.shade600)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              giaTri,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final gioBatDau = booking.timeSlot.split(':');
    final gio = gioBatDau.isNotEmpty ? int.tryParse(gioBatDau[0]) ?? 0 : 0;
    final phut = gioBatDau.length > 1 ? int.tryParse(gioBatDau[1]) ?? 0 : 0;

    final thoiDiemKetThuc = DateTime(
      booking.date.year,
      booking.date.month,
      booking.date.day,
      gio,
      phut,
    ).add(Duration(minutes: booking.durationMinutes));

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),
      appBar: AppBar(title: const Text('Chi tiết đặt sân')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const CircleAvatar(
                        backgroundColor: Color(0xFFE5F3EB),
                        child: Icon(
                          Icons.sports_tennis,
                          color: Color(0xFF16845B),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          booking.court.name,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    booking.court.address,
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                  const Divider(height: 28),
                  _dongThongTin('Mã đặt sân', booking.id),
                  _dongThongTin('Ngày chơi', dinhDangNgay(booking.date)),
                  _dongThongTin('Giờ bắt đầu', booking.timeSlot),
                  _dongThongTin('Giờ kết thúc', dinhDangGio(thoiDiemKetThuc)),
                  _dongThongTin(
                    'Thời lượng',
                    '${booking.durationMinutes} phút',
                  ),
                  _dongThongTin('Tổng tiền', formatMoney(booking.totalPrice)),
                  _dongThongTin('Trạng thái đặt sân', booking.status),
                  _dongThongTin('Trạng thái thanh toán', booking.paymentStatus),
                  _dongThongTin(
                    'Phương thức thanh toán',
                    booking.paymentMethod,
                  ),
                  if (booking.transactionId != null &&
                      booking.transactionId!.isNotEmpty)
                    _dongThongTin('Mã giao dịch', booking.transactionId!),
                  if (booking.paidAt != null)
                    _dongThongTin(
                      'Thời gian thanh toán',
                      '${dinhDangNgay(booking.paidAt!)} '
                          '${dinhDangGio(booking.paidAt!)}',
                    ),
                  if (booking.paymentProof != null &&
                      booking.paymentProof!.isNotEmpty)
                    _dongThongTin('Mã biên lai', booking.paymentProof!),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
