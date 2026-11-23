import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../venue_detail/data/venue_detail_api.dart';
import '../../venue_detail/widgets/review_sheet.dart';
import '../../complaint/widgets/complaint_sheet.dart';

import '../../../core/network/api_client.dart';
import '../../../shared/app_message_box.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/map_launcher.dart';
import '../../../shared/round_icon_button.dart';
import '../../booking/data/booking_api.dart';
import '../../booking/data/booking_callbacks.dart';
import '../../checkin/checkin_flow.dart';
import '../widgets/refund_account_sheet.dart';
import '../../payment/screens/payment_screen.dart';
import '../../../models/booking_model.dart';

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
  // LỌC LỊCH ĐẶT

  List<Booking> _filterBookings(int tabIndex) {
    final result = [...widget.bookings];

    result.sort((a, b) => b.date.compareTo(a.date));

    switch (tabIndex) {
      case 1:
        // Nhóm tab do backend tính (`nhomTrangThai`): app chỉ lọc theo đó.
        return result.where((booking) => booking.statusGroup == 'sap_toi').toList();

      case 2:
        return result.where((booking) => booking.statusGroup == 'hoan_thanh').toList();

      case 3:
        return result.where((booking) => booking.statusGroup == 'da_huy').toList();

      default:
        return result;
    }
  }

  // ĐÁNH GIÁ SÂN (chỉ đơn backend báo `coTheDanhGia`)

  Future<void> _openReview(Booking booking) async {
    final apiId = booking.apiId;
    final venueId = booking.court.venueId;
    if (apiId == null || venueId == null) return;
    final sent = await showReviewSheet(
      context,
      bookingId: apiId,
      venueId: venueId,
      venueName: booking.court.name,
    );
    if (!mounted || !sent) return;
    // Tải lại để đơn chuyển sang "Đã đánh giá ★" (daDanhGia/soSaoDanhGia).
    await widget.onRefresh?.call();
  }

  /// Sửa đánh giá (trong 7 ngày): mở lại form với số sao + bình luận cũ.
  /// Gọi theo buổi đang giữ đánh giá (`reviewBookingId`; lịch cố định dùng chung 1 đánh giá).
  Future<void> _editReview(Booking booking) async {
    final reviewId = booking.reviewBookingId ?? booking.apiId;
    final venueId = booking.court.venueId;
    if (reviewId == null || venueId == null) return;
    final saved = await showReviewSheet(
      context,
      bookingId: reviewId,
      venueId: venueId,
      venueName: booking.court.name,
      editing: true,
      initialStars: booking.reviewStars ?? 0,
      initialContent: booking.reviewContent,
    );
    if (!mounted || !saved) return;
    await widget.onRefresh?.call();
  }

  /// Xoá đánh giá của mình (sau đó được đánh giá lại).
  Future<void> _deleteReview(Booking booking) async {
    final reviewId = booking.reviewBookingId ?? booking.apiId;
    final venueId = booking.court.venueId;
    if (reviewId == null || venueId == null) return;
    final confirmed = await showConfirmBox(
      context,
      title: 'Xóa đánh giá của bạn?',
      message: 'Đánh giá sẽ bị xóa và điểm của sân được tính lại. Bạn vẫn có thể đánh giá lại sau.',
      confirmLabel: 'Xóa đánh giá',
      cancelLabel: 'Giữ lại',
      danger: true,
    );
    if (!confirmed || !mounted) return;
    try {
      await VenueDetailApi.deleteReview(reviewId);
      VenueDetailApi.invalidateReviews(venueId);
    } on ApiException catch (error) {
      _message(error.message);
      return;
    } catch (_) {
      _message('Chưa xóa được đánh giá. Bạn kiểm tra mạng rồi thử lại nhé.', kind: MessageKind.danger);
      return;
    }
    if (!mounted) return;
    _message('Đã xóa đánh giá của bạn.', kind: MessageKind.success);
    await widget.onRefresh?.call();
  }

  Widget _reviewedBadge(Booking booking) {
    final stars = booking.reviewStars;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.star_rounded, color: AppTheme.star, size: 20),
        const SizedBox(width: 4),
        Text(
          stars == null ? 'Bạn đã đánh giá sân này' : 'Bạn đã đánh giá $stars sao',
          style: const TextStyle(color: AppTheme.hintGrey),
        ),
      ],
    );
  }

  // XÁC NHẬN HỦY ĐẶT SÂN

  Future<void> _confirmCancel(Booking booking) async {
    if (booking.isCancelled) return;

    // Đơn đã tạo trên backend: hỏi backend trước để cảnh báo ĐÚNG trường hợp hoàn tiền (100% / 50% / không hoàn).
    final apiId = booking.apiId;
    CancelPreview? preview;
    if (apiId != null) {
      try {
        preview = await BookingApi.previewCancel(apiId);
      } on ApiException catch (error) {
        _message(error.message);
        return;
      } catch (_) {
        _message('Chưa kiểm tra được chính sách hoàn tiền. Bạn thử lại sau ít phút nhé.', kind: MessageKind.danger);
        return;
      }
      if (!mounted) return;
    }

    final confirmed = await showConfirmBox(
      context,
      title: 'Bạn muốn hủy lịch đặt sân?',
      content: _cancelWarning(booking, preview),
      confirmLabel: 'Đồng ý hủy',
      cancelLabel: 'Giữ lịch đặt',
      kind: MessageKind.warning,
      danger: true,
    );

    // Chỉ khi khách đồng ý mới hủy.
    if (!confirmed || !mounted) return;

    var result = const CancelResult();
    if (apiId != null) {
      try {
        result = await BookingApi.cancelBooking(apiId);
      } on ApiException catch (error) {
        _message(error.message);
        return;
      } catch (_) {
        _message('Chưa hủy được lịch đặt. Bạn kiểm tra mạng rồi thử lại nhé.', kind: MessageKind.danger);
        return;
      }
      if (!mounted) return;
    }

    widget.onCancelBooking(booking);
    setState(() {});

    // Tải lại để hiện trạng thái hoàn tiền thật từ backend.
    await widget.onRefresh?.call();
    if (!mounted) return;

    if (apiId == null) {
      _message('Đã hủy lịch đặt sân.', kind: MessageKind.success);
      return;
    }
    await _showCancelResult(booking, result);
  }

  /// Nội dung cảnh báo theo từng trường hợp (số liệu do backend tính, app chỉ hiển thị).
  Widget _cancelWarning(Booking booking, CancelPreview? preview) {
    if (preview == null || !preview.paid) {
      return const Text(
        'Lịch đặt sẽ được hủy và sân được nhả lại cho người khác.\n'
        'Bạn chưa thanh toán nên không mất khoản phí nào.',
      );
    }

    final hours = preview.hoursLeft;
    final timeLeft = hours <= 0
        ? 'Đã quá giờ bắt đầu'
        : 'Còn ${hours.toStringAsFixed(hours == hours.roundToDouble() ? 0 : 1)} giờ tới giờ chơi';

    final Color color;
    final IconData icon;
    final String headline;
    final String detail;
    if (preview.refundPercent >= 100) {
      color = const Color(0xFF2FA672);
      icon = Icons.check_circle_outline;
      headline = 'Hoàn 100% = ${formatMoney(preview.refundAmount)}';
      detail = 'Hủy trước giờ chơi từ ${preview.freeHours} giờ trở lên.';
    } else if (preview.refundPercent > 0) {
      color = Colors.orange.shade800;
      icon = Icons.warning_amber_rounded;
      headline =
          'Chỉ hoàn ${preview.refundPercent}% = ${formatMoney(preview.refundAmount)}';
      detail =
          'Hủy trước giờ chơi ${preview.halfHours}–${preview.freeHours} giờ. '
          'Bạn mất ${formatMoney(preview.totalPaid - preview.refundAmount)}.';
    } else {
      color = AppTheme.danger;
      icon = Icons.error_outline;
      headline = 'KHÔNG được hoàn tiền (0đ)';
      detail =
          'Hủy trước giờ chơi dưới ${preview.halfHours} giờ. '
          'Bạn mất toàn bộ ${formatMoney(preview.totalPaid)} đã thanh toán.';
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          preview.sessionCount > 1
              ? 'Hủy ${preview.sessionCount} buổi còn lại của lịch cố định và giải phóng sân.'
              : 'Lịch đặt sẽ được hủy và sân được nhả lại cho người khác.',
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.08),
            border: Border.all(color: color.withValues(alpha: 0.5)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(icon, color: color, size: 20),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      headline,
                      style: TextStyle(color: color, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text('$timeLeft. $detail', style: const TextStyle(fontSize: 13)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          preview.refundAmount > 0
              ? 'Sau khi đồng ý, yêu cầu hoàn tiền sẽ được gửi đến chủ sân. Bạn chỉ cần chờ chủ sân chuyển khoản lại.'
              : 'Sau khi đồng ý, lịch đặt sẽ bị hủy và không thể khôi phục.',
          style: const TextStyle(fontSize: 13),
        ),
        const SizedBox(height: 8),
        const Text(
          'Chính sách: ≥24 giờ hoàn 100% · 12–24 giờ hoàn 50% · dưới 12 giờ không hoàn.',
          style: TextStyle(fontSize: 12, color: AppTheme.hintGrey),
        ),
      ],
    );
  }

  /// Kết quả hủy. Luôn có nút khiếu nại chủ sân để khách phản ánh ngay nếu cần.
  Future<void> _showCancelResult(Booking booking, CancelResult result) async {
    final String detail;
    if (result.refundAmount > 0) {
      detail =
          'Chủ sân sẽ hoàn lại ${formatMoney(result.refundAmount)} (${result.refundPercent}%) cho bạn. '
          'Bạn sẽ nhận được thông báo ngay khi chủ sân chuyển khoản. '
          'Nếu chờ quá lâu hoặc chưa nhận được tiền, bạn có thể khiếu nại chủ sân.';
    } else if (result.paid) {
      detail = result.message ??
          'Vì hủy khi còn dưới 12 giờ nên đơn này không được hoàn tiền theo chính sách của sân.';
    } else {
      detail = 'Lịch đặt đã được hủy và sân đã được nhả lại cho người khác.';
    }

    final canEnterAccount = result.canUpdateRefundAccount && result.refundAmount > 0 && booking.apiId != null;
    final choice = await showAppMessageBox<String>(
      context,
      kind: MessageKind.success,
      title: 'Đã hủy lịch đặt sân',
      message: detail,
      actions: [
        const MessageAction<String>(label: 'Đã hiểu', value: 'ok'),
        if (canEnterAccount)
          const MessageAction<String>(
            label: 'Nhập TK nhận hoàn',
            value: 'account',
            icon: Icons.account_balance_outlined,
          ),
        if (booking.apiId != null && !booking.complained)
          const MessageAction<String>(
            label: 'Khiếu nại chủ sân',
            value: 'complaint',
            style: MessageActionStyle.warning,
            icon: Icons.report_problem_outlined,
          ),
      ],
    );
    if (!mounted) return;
    if (choice == 'account') {
      await _openRefundAccount(booking.apiId!, amount: result.refundAmount);
    } else if (choice == 'complaint') {
      await _openComplaint(booking, atCancel: true);
    }
  }

  // HOÀN TIỀN (G4.7) — chủ sân tự chuyển + gửi ảnh chứng từ; khách nhập TK nhận và xác nhận đã nhận / chưa nhận.

  Future<void> _openRefundAccount(int bookingId, {int amount = 0}) async {
    final saved = await showRefundAccountSheet(context, bookingId: bookingId, refundAmount: amount);
    if (!mounted || !saved) return;
    _message('Đã lưu tài khoản nhận hoàn. Chủ sân sẽ chuyển khoản cho bạn.', kind: MessageKind.success);
    await widget.onRefresh?.call();
  }

  Future<void> _confirmRefundReceived(Booking booking) async {
    final refundId = booking.refundId;
    if (refundId == null) return;
    final ok = await showConfirmBox(
      context,
      title: 'Bạn đã nhận lại tiền?',
      content: Text(
        'Xác nhận đã nhận ${formatMoney(booking.refundAmount)} từ chủ sân. '
        'Sau khi xác nhận, khoản hoàn tiền sẽ được đóng.',
      ),
      confirmLabel: 'Đã nhận lại',
      cancelLabel: 'Chưa',
      kind: MessageKind.info,
      danger: false,
    );
    if (!ok || !mounted) return;
    try {
      await BookingApi.confirmRefundReceived(refundId);
    } on ApiException catch (error) {
      _message(error.message);
      return;
    } catch (_) {
      _message('Chưa xác nhận được. Bạn kiểm tra mạng rồi thử lại nhé.', kind: MessageKind.danger);
      return;
    }
    if (!mounted) return;
    _message('Cảm ơn bạn, đã ghi nhận bạn nhận lại tiền.', kind: MessageKind.success);
    await widget.onRefresh?.call();
  }

  Future<void> _reportRefundNotReceived(Booking booking) async {
    final refundId = booking.refundId;
    if (refundId == null) return;
    // Dialog tự giữ & huỷ TextEditingController của nó (huỷ controller ngay sau khi showDialog trả về
    // sẽ làm TextField đang chạy hiệu ứng đóng dùng controller đã dispose → lỗi đỏ toàn trang).
    final note = await showDialog<String>(
      context: context,
      builder: (_) => const _RefundNotReceivedDialog(),
    );
    if (note == null || !mounted) return;
    try {
      await BookingApi.reportRefundNotReceived(refundId, note: note);
    } on ApiException catch (error) {
      _message(error.message);
      return;
    } catch (_) {
      _message('Chưa gửi được báo cáo. Bạn kiểm tra mạng rồi thử lại nhé.', kind: MessageKind.danger);
      return;
    }
    if (!mounted) return;
    _message('Đã báo cho chủ sân. Họ sẽ kiểm tra và chuyển lại.', kind: MessageKind.warning);
    await widget.onRefresh?.call();
  }

  // QR CHECK-IN TẠI SÂN (G3.9) — backend quyết định đúng/sai (giờ máy chủ), app chỉ hiển thị theo mã lỗi

  Future<void> _scanCheckIn(Booking booking) async {
    final checkedIn = await startQrCheckIn(context, booking);
    if (!mounted || !checkedIn) return;
    await widget.onRefresh?.call();
  }

  // KHIẾU NẠI CHỦ SÂN (admin xử lý)

  Future<void> _openComplaint(
    Booking booking, {
    int? apiId,
    bool atCancel = false,
  }) async {
    final id = apiId ?? booking.apiId;
    if (id == null) return;
    final sent = await showComplaintSheet(
      context,
      bookingId: id,
      venueName: booking.court.name,
      atCancel: atCancel,
      stage: booking.isCancelled
          ? ComplaintStage.cancelled
          : (booking.isPaid ? ComplaintStage.paid : ComplaintStage.paymentPending),
    );
    if (!mounted || !sent) return;
    await widget.onRefresh?.call();
  }

  // TIẾP TỤC THANH TOÁN TRỰC TUYẾN

  Future<void> _continuePayment(Booking booking) async {
    if (booking.isCancelled) {
      _message('Lịch đặt này đã được hủy trước đó.', kind: MessageKind.warning);
      return;
    }

    if (!booking.canPay) {
      _message(
        booking.isPaid
            ? 'Bạn đã thanh toán lịch đặt này rồi.'
            : 'Lịch đặt này không cần thanh toán trên ứng dụng.',
      );
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

    // Tải lại để lấy mã giao dịch / thời gian thanh toán thật từ backend.
    await widget.onRefresh?.call();
    if (!mounted) return;

    setState(() {});
  }

  void _message(String value, {MessageKind kind = MessageKind.info}) {
    showAppToast(context, value, kind: kind);
  }

  Widget _checkedInBadge(Booking booking) {
    final at = booking.checkedInAt!;
    String two(int v) => v.toString().padLeft(2, '0');
    return Row(
      children: [
        const Icon(Icons.verified_rounded, size: 18, color: AppTheme.primaryColor),
        const SizedBox(width: 6),
        Text(
          'Đã check-in lúc ${two(at.hour)}:${two(at.minute)}',
          style: const TextStyle(color: AppTheme.primaryColor, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  // TRẠNG THÁI LỊCH ĐẶT (mã `trangThaiHienThi` do backend trả)
  // Xanh: thành công / đã hoàn tiền · Cam: đang chờ · Đỏ: bị từ chối, huỷ, hết hạn · Xám: chưa thanh toán.

  Color _displayStatusColor(String displayStatus) {
    switch (displayStatus) {
      case 'paid':
      case 'checked_in':
      case 'completed':
      case 'cancelled_refunded':
      case 'cancelled_refund_received':
      case 'late_payment_refunded':
        return AppTheme.primaryColor;

      case 'awaiting_owner_approval':
      case 'cancelled_refund_pending':
      case 'late_payment_refund_pending':
        return Colors.orange;

      case 'payment_rejected':
      case 'cancelled_refund_failed':
      case 'cancelled_no_refund':
      case 'cancelled_unpaid':
      case 'expired':
        return AppTheme.danger;

      default: // awaiting_payment, unknown
        return AppTheme.hintGrey;
    }
  }

  // TRẠNG THÁI THANH TOÁN

  Color _paymentStatusColor(String status) {
    switch (status) {
      case 'Đã thanh toán':
        return AppTheme.primaryColor;

      case 'Chờ xác nhận':
        return Colors.orange;

      case 'Thanh toán thất bại':
        return AppTheme.danger;

      case 'Thanh toán tại sân':
        return AppTheme.primaryColor;

      default:
        return AppTheme.hintGrey;
    }
  }

  // THẺ TRẠNG THÁI

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

  // CHI TIẾT THANH TOÁN (khớp bảng ThanhToan của backend)

  /// Chỉ hiện dòng nào backend thật sự có dữ liệu; không in "Chưa có mã"
  /// cho đơn không có giao dịch ngân hàng.
  Widget _buildPaymentProof(Booking booking) {
    if (!booking.isPaid || booking.source != 'app') {
      return _buildRefundInfo(booking);
    }

    final rows = <Widget>[
      _infoRow('Phương thức', booking.paymentMethod),
      if (booking.transactionId != null)
        _infoRow('Mã giao dịch ngân hàng', booking.transactionId!),
      if (booking.paidAt != null)
        _infoRow('Thời gian thanh toán', _formatDateTime(booking.paidAt!)),
      if (booking.transferContent != null)
        _infoRow('Nội dung chuyển khoản', booking.transferContent!),
    ];

    final hasBankData =
        booking.transactionId != null || booking.paidAt != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          margin: const EdgeInsets.only(top: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFDDF1E5),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.verified, color: AppTheme.primaryColor, size: 19),
                  SizedBox(width: 6),
                  Text(
                    'Thông tin thanh toán',
                    style: TextStyle(
                      color: AppTheme.primaryColor,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ...rows,
              if (!hasBankData)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text(
                    'Đơn đã được xác nhận thanh toán, chưa có chi tiết giao dịch ngân hàng.',
                    style: TextStyle(color: Colors.black54, fontSize: 11),
                  ),
                ),
            ],
          ),
        ),
        _buildRefundInfo(booking),
      ],
    );
  }

  String _refundLabel(Booking booking) {
    switch (booking.refundDetail ?? booking.refundStatus) {
      case 'waiting_info':
      case 'processing':
        return 'Chờ chủ sân hoàn tiền';
      case 'refunded':
        return 'Chủ sân đã chuyển, chờ bạn xác nhận';
      case 'received':
        return 'Đã nhận lại tiền';
      case 'not_received':
        return 'Bạn báo chưa nhận, chờ chủ sân chuyển lại';
      case 'escalated':
        return 'Quá hạn hoàn, đã báo Admin hỗ trợ';
      case 'failed':
        return 'Hoàn tiền thất bại';
      default:
        return 'Không hoàn tiền';
    }
  }

  /// Ảnh chứng từ chủ sân đã chuyển hoàn (đường dẫn tương đối được ghép với địa chỉ backend).
  void _showRefundProof(String path) {
    final url = ApiClient.resolveFileUrl(path);
    showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: InteractiveViewer(
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('Không tải được ảnh chứng từ.'),
                  ),
                ),
              ),
            ),
            TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('Đóng')),
          ],
        ),
      ),
    );
  }

  /// Lý do chủ sân từ chối ảnh chuyển khoản (`payment_rejected`) — nút "Gửi lại ảnh" nằm ở hàng nút.
  Widget _buildRejectReason(Booking booking) {
    final reason = booking.rejectReason;
    if (!booking.isPaymentRejected || reason == null) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        'Chủ sân từ chối ảnh chuyển khoản: $reason',
        style: const TextStyle(color: AppTheme.danger, fontSize: 12.5, height: 1.35),
      ),
    );
  }

  /// Khối "Hoàn tiền": chỉ cho cancelled_refund_pending / cancelled_refunded / cancelled_refund_failed.
  /// cancelled_no_refund hiện một dòng giải thích.
  Widget _buildRefundInfo(Booking booking) {
    if (booking.isNoRefund) {
      return const Padding(
        padding: EdgeInsets.only(top: 10),
        child: Text(
          'Hủy dưới 12 giờ nên không được hoàn tiền',
          style: TextStyle(color: AppTheme.hintGrey, fontSize: 12.5),
        ),
      );
    }
    if (!booking.showRefundBlock) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4E5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.currency_exchange, color: Colors.orange, size: 19),
              SizedBox(width: 6),
              Text(
                'Hoàn tiền',
                style: TextStyle(
                  color: Colors.orange,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _infoRow('Trạng thái', _refundLabel(booking)),
          _infoRow('Số tiền hoàn', formatMoney(booking.refundAmount)),
          if (booking.refundDeadline != null && !booking.canConfirmRefund && booking.refundDetail != 'received')
            _infoRow('Hạn chủ sân hoàn', _formatDateTime(booking.refundDeadline!)),
          if (booking.refundStatus == 'waiting_info' ||
              booking.refundStatus == 'processing')
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text(
                'Chủ sân sẽ chuyển khoản hoàn lại cho bạn trong thời gian sớm nhất.',
                style: TextStyle(color: Colors.black54, fontSize: 11),
              ),
            ),
          if (booking.refundProofUrl != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
                onPressed: () => _showRefundProof(booking.refundProofUrl!),
                icon: const Icon(Icons.receipt_long_outlined, size: 18),
                label: const Text('Xem ảnh chứng từ chủ sân đã chuyển'),
              ),
            ),
          if (booking.canEnterRefundAccount)
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: () => _openRefundAccount(booking.apiId!, amount: booking.refundAmount),
                icon: const Icon(Icons.account_balance_outlined, size: 18),
                label: const Text('Nhập / sửa TK nhận hoàn'),
              ),
            ),
          if (booking.canConfirmRefund) ...[
            const SizedBox(height: 6),
            const Text(
              'Chủ sân báo đã chuyển khoản hoàn. Bạn đã nhận được tiền chưa?',
              style: TextStyle(fontSize: 12.5, height: 1.35),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _reportRefundNotReceived(booking),
                    style: OutlinedButton.styleFrom(foregroundColor: AppTheme.danger),
                    child: const Text('Chưa nhận được'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: () => _confirmRefundReceived(booking),
                    child: const Text('Đã nhận lại'),
                  ),
                ),
              ],
            ),
          ],
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

  // CHI TIẾT LỊCH ĐẶT

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
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Chi tiết lịch đặt',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      RoundIconButton(
                        tooltip: 'Chỉ đường',
                        icon: Icons.alt_route,
                        onTap: () => MapLauncher.openMap(
                          context,
                          mapLink: booking.court.mapLink,
                          address: booking.court.address,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  _infoRow('Mã đặt sân', booking.id),
                  _infoRow('Tên sân', booking.court.name),
                  _infoRow('Địa chỉ', booking.court.address),
                  _infoRow('Ngày chơi', _formatDate(booking.date)),
                  _infoRow('Giờ bắt đầu', booking.timeSlot),
                  _infoRow('Giờ kết thúc', booking.endTimeSlot),
                  _infoRow('Thời lượng', '${booking.durationMinutes} phút'),
                  _infoRow('Tổng tiền', formatMoney(booking.totalPrice)),
                  _infoRow('Trạng thái đặt sân', booking.statusLabel),
                  _infoRow('Trạng thái thanh toán', booking.paymentStatus),

                  _buildRejectReason(booking),
                  _buildPaymentProof(booking), // gồm cả khối hoàn tiền

                  const SizedBox(height: 16),

                  if (booking.canCheckIn) ...[
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _scanCheckIn(booking);
                        },
                        icon: const Icon(Icons.qr_code_scanner_rounded),
                        label: const Text('Quét QR check-in'),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ] else if (booking.isCheckedIn && booking.checkedInAt != null) ...[
                    _checkedInBadge(booking),
                    const SizedBox(height: 8),
                  ],

                  if (booking.canReview &&
                      booking.apiId != null &&
                      booking.court.venueId != null)
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          _openReview(booking);
                        },
                        icon: const Icon(Icons.star_rounded),
                        label: const Text('Đánh giá sân'),
                      ),
                    )
                  else if (booking.reviewed) ...[
                    _reviewedBadge(booking),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        if (booking.canEditReview)
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () {
                                Navigator.pop(context);
                                _editReview(booking);
                              },
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              label: const Text('Sửa đánh giá'),
                            ),
                          ),
                        if (booking.canEditReview) const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {
                              Navigator.pop(context);
                              _deleteReview(booking);
                            },
                            icon: const Icon(Icons.delete_outline, size: 18),
                            label: const Text('Xoá'),
                            style: OutlinedButton.styleFrom(foregroundColor: AppTheme.danger),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                  ],

                  if (booking.canComplain && booking.apiId != null) ...[
                    ComplaintButton(
                      label: booking.slowReview ? 'Khiếu nại (Chậm duyệt)' : 'Khiếu nại chủ sân',
                      onPressed: () {
                        Navigator.pop(context);
                        _openComplaint(booking);
                      },
                    ),
                    const SizedBox(height: 8),
                  ] else if (booking.complained) ...[
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Center(
                        child: Text(
                          'Bạn đã gửi khiếu nại cho đơn này.',
                          style: TextStyle(color: AppTheme.hintGrey),
                        ),
                      ),
                    ),
                  ],

                  if (booking.canCancel)
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () {
                          Navigator.pop(context);
                          _confirmCancel(booking);
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppTheme.danger,
                        ),
                        child: const Text('Hủy đặt sân'),
                      ),
                    ),

                  if (booking.canPay)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.pop(context);
                          _continuePayment(booking);
                        },
                        child: Text(
                          booking.isPaymentRejected
                              ? 'Gửi lại ảnh chuyển khoản'
                              : 'Tiếp tục thanh toán trực tuyến',
                        ),
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

  // ITEM LỊCH ĐẶT

  Widget _bookingCard(Booking booking) {
    return Card(
      color: Colors.white,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 13),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFDDF1E5)),
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
                  backgroundColor: Color(0xFFDDF1E5),
                  child: Icon(Icons.sports_tennis, color: Color(0xFF2FA672)),
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

                // Góc phải: mở Google Maps chỉ đường tới cơ sở.
                const SizedBox(width: 8),
                RoundIconButton(
                  tooltip: 'Chỉ đường',
                  icon: Icons.alt_route,
                  onTap: () => MapLauncher.openMap(
                    context,
                    mapLink: booking.court.mapLink,
                    address: booking.court.address,
                  ),
                ),
              ],
            ),

            const Divider(height: 22),

            _infoRow('Mã đặt sân', booking.id),
            _infoRow('Ngày chơi', _formatDate(booking.date)),
            _infoRow('Giờ bắt đầu', booking.timeSlot),
            _infoRow('Giờ kết thúc', booking.endTimeSlot),
            _infoRow('Thời lượng', '${booking.durationMinutes} phút'),
            _infoRow('Tổng tiền', formatMoney(booking.totalPrice)),

            const SizedBox(height: 10),

            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                _statusChip(
                  booking.statusLabel,
                  _displayStatusColor(booking.displayStatus),
                ),
                // Đơn chủ sân tạo (trả tại sân) không có trạng thái thanh toán trực tuyến nên giữ chip riêng.
                if (booking.source == 'owner')
                  _statusChip(
                    booking.paymentStatus,
                    _paymentStatusColor(booking.paymentStatus),
                  ),
                if (booking.reviewed)
                  _statusChip(
                    'Đã đánh giá ★${booking.reviewStars ?? ''}',
                    AppTheme.primaryColor,
                  ),
                if (booking.complained)
                  _statusChip('Đã khiếu nại', Colors.orange),
              ],
            ),

            _buildRejectReason(booking),
            _buildPaymentProof(booking), // gồm cả khối hoàn tiền

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

                if (booking.canReview &&
                    booking.apiId != null &&
                    booking.court.venueId != null) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _openReview(booking),
                      icon: const Icon(Icons.star_rounded, size: 18),
                      label: const Text('Đánh giá'),
                    ),
                  ),
                ],

                if (booking.canPay) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        _continuePayment(booking);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2FA672),
                        foregroundColor: Colors.white,
                      ),
                      child: Text(booking.isPaymentRejected ? 'Gửi lại ảnh' : 'Thanh toán'),
                    ),
                  ),
                ],
                if (booking.canCancel) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        _confirmCancel(booking);
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.danger,
                      ),
                      child: const Text('Hủy đặt'),
                    ),
                  ),
                ],
              ],
            ),

            if (booking.canCheckIn) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () => _scanCheckIn(booking),
                  icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
                  label: Text(booking.inCheckInWindow ? 'Quét QR check-in' : 'Quét QR check-in (khi đến sân)'),
                ),
              ),
            ] else if (booking.isCheckedIn && booking.checkedInAt != null) ...[
              const SizedBox(height: 8),
              _checkedInBadge(booking),
            ],

            // Mọi đơn đặt qua app đều có nút khiếu nại chủ sân (admin xử lý); khiếu nại rồi thì khóa nút.
            if (booking.apiId != null && (booking.canComplain || booking.complained)) ...[
              const SizedBox(height: 8),
              ComplaintButton(
                label: booking.complained
                    ? 'Đã gửi khiếu nại'
                    : (booking.slowReview ? 'Khiếu nại (Chậm duyệt)' : 'Khiếu nại chủ sân'),
                onPressed: booking.complained ? null : () => _openComplaint(booking),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // DANH SÁCH THEO TAB

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

  // BUILD

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: const Color(0xFFF1F9F4),

        // Chỉ có MỘT AppBar trong màn hình này.
        appBar: AppBar(
          title: const Text('Lịch sử đặt sân'),
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF1F2937),
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
            labelColor: Color(0xFF2FA672),
            unselectedLabelColor: Colors.grey,
            indicatorColor: Color(0xFF2FA672),
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

/// Hộp thoại "Chưa nhận được tiền?": nhập ghi chú tuỳ chọn, trả về chuỗi ghi chú (có thể rỗng) hoặc null nếu đóng.
class _RefundNotReceivedDialog extends StatefulWidget {
  const _RefundNotReceivedDialog();

  @override
  State<_RefundNotReceivedDialog> createState() => _RefundNotReceivedDialogState();
}

class _RefundNotReceivedDialogState extends State<_RefundNotReceivedDialog> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Chưa nhận được tiền?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Chủ sân sẽ được báo để kiểm tra và chuyển lại. Bạn có thể ghi thêm lý do (không bắt buộc).',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _controller,
              maxLength: 255,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Ví dụ: tài khoản của tôi chưa thấy tiền',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Đóng')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_controller.text),
          child: const Text('Báo chưa nhận'),
        ),
      ],
    );
  }
}
