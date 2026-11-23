import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:gal/gal.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/network/api_client.dart';
import '../../../core/router/app_events.dart';
import '../../auth/data/auth_api.dart';
import '../../../core/utils/formatters.dart';
import '../../booking/data/booking_api.dart';
import '../../booking/data/booking_callbacks.dart';
import '../../../models/booking_model.dart';
import '../../../models/invoice_model.dart';
import '../../../core/utils/time_utils.dart';
import '../../complaint/widgets/complaint_sheet.dart';
import '../../../shared/app_message_box.dart';
import '../../../shared/confirm_dialog.dart';

const Color _green = Color(0xFF2FA672);
const Color _greenDark = Color(0xFF1F2937);
const Color _greenLight = Color(0xFFDDF1E5);

/// Màn "Thanh toán": đếm ngược giữ chỗ, mã QR chuyển khoản, gửi ảnh chuyển khoản.
///
/// Luồng: quét QR chuyển khoản → chụp màn hình → chọn ảnh → "Kiểm tra thanh toán"
/// (gửi ảnh, backend tự đính mã đơn / tên / SĐT / số tiền) → trạng thái "đợi xác nhận".
/// Đơn chỉ thành công khi chủ sân xác nhận; bị từ chối thì khách thấy lý do và gửi lại.
/// Dữ liệu tiền / QR / trạng thái lấy từ backend (`hoa-don-nhap`), làm mới mỗi 5 giây.
class PaymentScreen extends StatefulWidget {
  final Booking booking;
  final BookingPaymentUpdate? onPaymentUpdate;

  /// true khi vừa đặt sân xong (màn này thay thế màn xác nhận đặt). Khi đó Back
  /// sẽ không quay về bảng chọn giờ mà hỏi người dùng có muốn thanh toán sau không.
  final bool fromBooking;

  const PaymentScreen({
    super.key,
    required this.booking,
    this.onPaymentUpdate,
    this.fromBooking = false,
  });

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  static const Duration _pollInterval = Duration(seconds: 5);

  Invoice? _invoice;
  bool _loading = true;
  String? _error;
  bool _refreshing = false;
  bool _checking = false; // đang bấm "Kiểm tra thanh toán" / đang gửi ảnh
  bool _cancelling = false; // đang gửi yêu cầu hủy đặt sân

  // Ảnh chuyển khoản khách vừa chọn (chưa gửi).
  static const int _maxImageBytes = 5 * 1024 * 1024;
  XFile? _pickedImage;
  Uint8List? _pickedBytes;
  bool _missingImage = false; // bấm gửi mà chưa chọn ảnh → viền đỏ
  bool _replacing = false; // đang chờ xác nhận nhưng muốn gửi lại ảnh khác
  late bool _complained = widget.booking.complained; // đã khiếu nại đơn này (mỗi đơn 1 lần)

  int _remaining = 0;
  // Chỉ dùng khi `confirming`: giây còn lại để chủ sân xác nhận (có thể âm = quá hạn, sân vẫn được giữ).
  int? _confirmRemaining;
  Timer? _tick;
  Timer? _poll;

  bool _reportedFinalState = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _refresh();
    });
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => _onTick());
    _poll = Timer.periodic(_pollInterval, (_) => _refresh());
  }

  @override
  void dispose() {
    _tick?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  // Dữ liệu

  Future<void> _refresh() async {
    final bookingId = widget.booking.apiId;
    if (bookingId == null) {
      setState(() {
        _loading = false;
        _error = 'Đơn đặt sân này chưa được ghi nhận nên chưa thể thanh toán. Bạn hãy quay lại và đặt sân lại nhé.';
      });
      return;
    }
    if (_refreshing) return;
    _refreshing = true;

    try {
      final invoice = await BookingApi.fetchInvoice(bookingId);
      if (!mounted) return;
      setState(() {
        _invoice = invoice;
        _loading = false;
        _error = null;
        // `conLaiGiay` = null khi đã gửi ảnh: không còn đếm ngược giữ chỗ.
        final seconds = invoice.remainingSeconds ?? 0;
        _remaining = seconds < 0 ? 0 : seconds;
        _confirmRemaining = invoice.confirmRemainingSeconds;
      });
      _reportIfFinished(invoice);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        // Lỗi nền khi đã có dữ liệu thì bỏ qua, lần làm mới sau sẽ thử lại.
        if (_invoice == null) _error = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (_invoice == null) _error = 'Chưa tải được thông tin thanh toán. Bạn kiểm tra kết nối mạng rồi thử lại nhé.';
      });
    } finally {
      _refreshing = false;
    }
  }

  void _onTick() {
    final invoice = _invoice;
    if (!mounted || invoice == null || !invoice.isOpen) return;
    if (invoice.isAwaitingOwner) {
      // Đã gửi ảnh: không đếm giữ chỗ, chỉ đếm hạn chủ sân xác nhận (cho phép âm).
      final left = _confirmRemaining;
      if (left != null) setState(() => _confirmRemaining = left - 1);
      return;
    }
    if (_remaining > 0) {
      setState(() => _remaining -= 1);
      if (_remaining == 0) _refresh(); // để backend chốt hết hạn
    }
  }

  /// Báo trạng thái cuối (đã thanh toán / hết hạn) cho danh sách lịch đặt và
  /// dừng các bộ đếm.
  void _reportIfFinished(Invoice invoice) {
    if (invoice.isOpen || _reportedFinalState) return;
    _reportedFinalState = true;
    _tick?.cancel();
    _poll?.cancel();

    if (invoice.isPaid) {
      widget.onPaymentUpdate?.call(
        widget.booking,
        paymentStatus: 'Đã thanh toán',
        paymentMethod: 'Chuyển khoản QR',
        // Giờ thanh toán do backend ghi khi chủ sân xác nhận;
        // danh sách lịch đặt tải lại sau khi thanh toán để lấy đúng giá trị.
      );
    } else if (invoice.isExpired) {
      widget.onPaymentUpdate?.call(
        widget.booking,
        paymentStatus: 'Thanh toán thất bại',
        paymentMethod: 'Chuyển khoản QR',
      );
    }
  }

  // Hành động

  /// Chọn ảnh chụp màn hình chuyển khoản (PNG/JPG, tối đa 5MB).
  Future<void> _pickImage() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 2000,
        imageQuality: 90,
      );
      if (picked == null) return;
      final name = picked.name.toLowerCase();
      if (!(name.endsWith('.png') ||
          name.endsWith('.jpg') ||
          name.endsWith('.jpeg') ||
          name.endsWith('.webp'))) {
        _snack('Bạn hãy chọn ảnh định dạng JPG hoặc PNG nhé.', kind: MessageKind.warning);
        return;
      }
      if (await picked.length() > _maxImageBytes) {
        _snack('Ảnh hơi nặng, bạn hãy chọn ảnh dưới 5MB nhé.', kind: MessageKind.warning);
        return;
      }
      final bytes = await picked.readAsBytes();
      if (!mounted) return;
      setState(() {
        _pickedImage = picked;
        _pickedBytes = bytes;
        _missingImage = false;
      });
    } catch (_) {
      _snack('Ứng dụng chưa được phép xem ảnh của bạn. Hãy cấp quyền truy cập ảnh trong Cài đặt rồi thử lại.', kind: MessageKind.warning);
    }
  }

  void _clearImage() {
    setState(() {
      _pickedImage = null;
      _pickedBytes = null;
    });
  }

  /// Nút "Kiểm tra thanh toán":
  ///  - chưa gửi ảnh: bắt buộc có ảnh, gửi lên cùng đơn → trạng thái "đợi xác nhận";
  ///  - đã gửi ảnh (đợi chủ sân): làm mới trạng thái (hoặc gửi ảnh mới nếu vừa chọn lại).
  Future<void> _checkPayment() async {
    final invoice = _invoice;
    final bookingId = widget.booking.apiId;
    if (invoice == null || !invoice.isOpen || _checking || bookingId == null) return;

    final image = _pickedImage;
    final imageBytes = _pickedBytes;
    if (image == null && !invoice.isAwaitingOwner) {
      setState(() => _missingImage = true);
      _snack('Bạn chưa chọn ảnh chuyển khoản. Hãy tải ảnh biên lai lên để chủ sân xác nhận nhé.', kind: MessageKind.warning);
      return;
    }

    setState(() => _checking = true);
    var sent = false;
    if (image != null) {
      try {
        final bytes = imageBytes ?? await image.readAsBytes();
        await BookingApi.uploadTransferProof(
          bookingId,
          bytes,
          image.name,
        );
        sent = true;
        _pickedImage = null;
        _pickedBytes = null;
        _replacing = false;
        widget.onPaymentUpdate?.call(
          widget.booking,
          paymentStatus: 'Chờ xác nhận',
          paymentMethod: 'Chuyển khoản QR',
        );
      } on ApiException catch (error) {
        if (error.code == 'PROOF_LIMIT') {
          // 409: đã đủ số ảnh tối đa, thôi gửi thêm và làm mới danh sách ảnh.
          _pickedImage = null;
          _pickedBytes = null;
          _replacing = false;
          _snack(error.message, kind: MessageKind.warning);
        } else {
          _snack(error.message, kind: MessageKind.danger);
        }
      } catch (error) {
        debugPrint('Gửi ảnh chuyển khoản lỗi: $error');
        _snack(
          'Chưa gửi được ảnh vì kết nối mạng không ổn định. Bạn kiểm tra mạng rồi gửi lại nhé.',
          kind: MessageKind.danger,
        );
      }
    }
    await _refresh();
    if (!mounted) return;
    setState(() => _checking = false);

    final latest = _invoice;
    if (sent) {
      // Gửi ảnh xong luôn báo đặt lịch thành công (chủ sân sẽ duyệt sau); đóng thì sang tab Lịch đặt.
      await showSuccessBox(
        context,
        title: 'Đặt lịch thành công',
        message: 'Đơn của bạn đang chờ chủ sân xác nhận thanh toán. '
            'Nếu sau 30 phút chủ sân chưa duyệt, nút "Khiếu nại (Chậm duyệt)" sẽ hiện trong mục Lịch đặt '
            'để quản trị viên hỗ trợ bạn.',
        buttonLabel: 'Đóng',
      );
      if (!mounted) return;
      _backToStart();
      AppEvents.requestOpenBookingHistory();
    } else if (image == null && latest != null && latest.isOpen) {
      _snack(
        'Chủ sân chưa xác nhận khoản chuyển của bạn. Bạn chờ thêm chút nhé, '
        'nếu quá 30 phút hãy bấm "Khiếu nại (Chậm duyệt)".',
      );
    }
  }

  // Khiếu nại chủ sân: luôn có nút, nằm cạnh nút chính ở đáy màn hình.
  Future<void> _openComplaint() async {
    final bookingId = widget.booking.apiId;
    if (bookingId == null) {
      _snack('Đơn này chưa được ghi nhận nên chưa thể khiếu nại.', kind: MessageKind.warning);
      return;
    }
    final invoice = _invoice;
    final stage = (invoice?.isPaid ?? false)
        ? ComplaintStage.paid
        : ((invoice?.isCancelled ?? false) || (invoice?.isExpired ?? false))
            ? ComplaintStage.cancelled
            : ComplaintStage.paymentPending;
    final sent = await showComplaintSheet(
      context,
      bookingId: bookingId,
      venueName: widget.booking.court.name,
      stage: stage,
    );
    if (!mounted || !sent) return;
    setState(() => _complained = true);
  }

  Widget _complaintButton({double? height}) {
    return ComplaintButton(
      label: _complained
          ? 'Đã khiếu nại'
          : ((_invoice?.slowReview ?? false) ? 'Khiếu nại (Chậm duyệt)' : 'Khiếu nại'),
      height: height,
      onPressed: _complained ? null : _openComplaint,
    );
  }

  bool _savingQr = false;

  /// Vẽ mã QR VietQR thành ảnh PNG (nền trắng, viền trắng) để lưu về máy.
  Future<Uint8List?> _renderQrPng(String payload) async {
    const total = 1000.0;
    const margin = 100.0;
    final painter = QrPainter(
      data: payload,
      version: QrVersions.auto,
      errorCorrectionLevel: QrErrorCorrectLevel.M,
      eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
      dataModuleStyle: const QrDataModuleStyle(
        dataModuleShape: QrDataModuleShape.square,
        color: Colors.black,
      ),
    );
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(const Rect.fromLTWH(0, 0, total, total), Paint()..color = Colors.white);
    canvas.translate(margin, margin);
    painter.paint(canvas, const Size(total - 2 * margin, total - 2 * margin));
    final image = await recorder.endRecording().toImage(total.toInt(), total.toInt());
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  }

  /// Nút "Tải QR": lưu ảnh QR thẳng vào thư viện ảnh của máy (không mở trình duyệt).
  Future<void> _downloadQr({String? payload, String? url}) async {
    if (_savingQr) return;
    setState(() => _savingQr = true);
    try {
      Uint8List? bytes;
      if (payload != null) {
        bytes = await _renderQrPng(payload);
      } else if (url != null) {
        final response = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 20));
        if (response.statusCode == 200) bytes = response.bodyBytes;
      }
      if (bytes == null || bytes.isEmpty) {
        _snack('Chưa lấy được ảnh mã QR, bạn thử lại sau nhé.', kind: MessageKind.warning);
        return;
      }
      if (!await Gal.hasAccess(toAlbum: true)) {
        if (!await Gal.requestAccess(toAlbum: true)) {
          _snack('Bạn cần cho phép ứng dụng lưu ảnh vào thư viện để tải mã QR.', kind: MessageKind.warning);
          return;
        }
      }
      final code = _invoice?.orderCode ?? DateTime.now().millisecondsSinceEpoch.toString();
      await Gal.putImageBytes(bytes, album: 'Badminton Booking', name: 'QR_thanh_toan_$code');
      _snack('Đã lưu mã QR vào thư viện ảnh của bạn.', kind: MessageKind.success);
    } catch (error) {
      debugPrint('Tải QR lỗi: $error');
      _snack('Chưa lưu được ảnh mã QR, bạn thử lại sau nhé.', kind: MessageKind.warning);
    } finally {
      if (mounted) setState(() => _savingQr = false);
    }
  }

  void _snack(String message, {MessageKind kind = MessageKind.info}) {
    if (!mounted) return;
    showAppToast(context, message, kind: kind);
  }

  /// Mã QR tự vẽ từ nội dung VietQR (nền trắng + viền trắng để app ngân hàng quét dễ).
  Widget _localQr(String payload, double size) {
    return QrImageView(
      data: payload,
      size: size,
      padding: EdgeInsets.zero,
      backgroundColor: Colors.white,
      errorCorrectionLevel: QrErrorCorrectLevel.M,
      errorStateBuilder: (context, error) => const Center(
        child: Text(
          'Không tạo được mã QR',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12),
        ),
      ),
    );
  }

  void _showQrFullScreen({String? payload, String? url}) {
    if (payload == null && url == null) return;
    showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.white,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: payload != null
              ? AspectRatio(aspectRatio: 1, child: _localQr(payload, 300))
              : InteractiveViewer(child: Image.network(url!, fit: BoxFit.contain)),
        ),
      ),
    );
  }

  void _backToStart() {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  /// "Hủy đặt sân" (G1.5): hủy CẢ NHÓM đặt (mọi sân/khung giờ cùng một QR) khi khách chưa gửi ảnh chuyển khoản.
  /// Backend hủy mọi đơn con theo `MaNhomDat` và nhả slot; app không tự tính gì.
  Future<void> _cancelBooking() async {
    final bookingId = widget.booking.apiId;
    if (bookingId == null || _cancelling) return;
    final confirmed = await showConfirmDialog(
      context,
      title: 'Hủy đặt sân?',
      message: 'Toàn bộ các khung giờ trong lần đặt này sẽ được hủy và nhả lại cho người khác. '
          'Bạn chưa thanh toán nên không mất khoản phí nào.',
      confirmLabel: 'Hủy đặt sân',
      cancelLabel: 'Giữ chỗ',
      danger: true,
    );
    if (!confirmed || !mounted) return;

    setState(() => _cancelling = true);
    try {
      await BookingApi.cancelBooking(bookingId);
      if (!mounted) return;
      _tick?.cancel();
      _poll?.cancel();
      _reportedFinalState = true;
      widget.onPaymentUpdate?.call(
        widget.booking,
        paymentStatus: 'Chưa thanh toán',
        paymentMethod: 'Chuyển khoản QR',
      );
      _snack('Đã hủy đặt sân.', kind: MessageKind.success);
      _backToStart();
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _cancelling = false);
      // Vd 409 PAYMENT_CONFIRMING (đã gửi ảnh, chờ chủ sân) hoặc đơn đã hết hạn: hiện đúng thông báo rồi làm mới.
      _snack(error.message, kind: MessageKind.warning);
      _refresh();
    } catch (_) {
      if (!mounted) return;
      setState(() => _cancelling = false);
      _snack('Chưa hủy được đặt sân. Bạn kiểm tra mạng rồi thử lại nhé.', kind: MessageKind.danger);
    }
  }

  Future<void> _confirmLeave() async {
    final leave = await showConfirmDialog(
      context,
      title: 'Thanh toán sau nhé?',
      message: 'Sân vẫn được giữ cho bạn trong thời gian quy định. '
          'Bạn có thể quay lại thanh toán bất cứ lúc nào trong mục Lịch đặt.',
      confirmLabel: 'Để sau',
      cancelLabel: 'Ở lại thanh toán',
    );
    if (leave && mounted) _backToStart();
  }

  // Giao diện

  /// Đếm ngược hạn chủ sân xác nhận: mm:ss (hoặc h:mm:ss khi ≥ 1 giờ).
  String _formatCountdown(int seconds) {
    final h = seconds ~/ 3600;
    final m = ((seconds % 3600) ~/ 60).toString().padLeft(2, '0');
    final sec = (seconds % 60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$sec' : '$m:$sec';
  }

  /// Chuỗi ngày giờ backend ("2026-11-21 09:41:00" / ISO) → "09:41 21/11/2026"; lạ thì giữ nguyên (chỉ hiển thị).
  String _formatServerTime(String raw) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?').firstMatch(raw);
    if (match == null) return raw;
    final date = '${match.group(3)}/${match.group(2)}/${match.group(1)}';
    final hour = match.group(4);
    return hour == null ? date : '$hour:${match.group(5)} $date';
  }

  String get _countdownText {
    final minutes = (_remaining ~/ 60).toString().padLeft(2, '0');
    final seconds = (_remaining % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final invoice = _invoice;
    final isOpen = invoice != null && invoice.isOpen;
    final askBeforeLeave =
        widget.fromBooking && (invoice == null || invoice.isOpen);

    return PopScope(
      canPop: !askBeforeLeave,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmLeave();
      },
      child: Scaffold(
      backgroundColor: const Color(0xFFF5F6F7),
      appBar: AppBar(
        title: const Text('Thanh toán'),
        centerTitle: true,
        foregroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
        flexibleSpace: const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF2FA672), Color(0xFF2FA672)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
          ),
        ),
      ),
      body: _buildBody(invoice),
      bottomNavigationBar: isOpen ? _buildBottomBar(invoice) : null,
      ),
    );
  }

  Widget _buildBody(Invoice? invoice) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    if (invoice == null) {
      return _messageView(
        icon: Icons.cloud_off,
        title: 'Không tải được thông tin thanh toán',
        message: _error ?? 'Vui lòng thử lại.',
        buttonLabel: 'Thử lại',
        onPressed: () {
          setState(() {
            _loading = true;
            _error = null;
          });
          _refresh();
        },
      );
    }

    if (invoice.isPaid) return _buildPaidView(invoice);
    if (invoice.isCancelled) {
      return _messageView(
        icon: Icons.cancel_outlined,
        title: 'Đơn đã bị hủy',
        message: 'Đơn đặt sân này đã được hủy nên không thể thanh toán nữa.',
        buttonLabel: 'Quay lại',
        onPressed: _backToStart,
        showComplaint: true,
      );
    }
    if (invoice.isExpired) {
      return _messageView(
        icon: Icons.timer_off_outlined,
        title: 'Đơn đã hết hạn giữ chỗ',
        message: invoice.paymentStatus == 'late_payment'
            ? 'Thời gian giữ chỗ đã hết trước khi chủ sân xác nhận khoản chuyển của bạn. '
                'Nếu bạn đã chuyển khoản, hãy bấm "Khiếu nại" để quản trị viên hỗ trợ hoàn tiền.'
            : 'Rất tiếc, sân không còn được giữ cho bạn. Bạn hãy đặt lại khung giờ khác nhé.',
        buttonLabel: 'Quay lại',
        onPressed: _backToStart,
        showComplaint: true,
      );
    }
    return _buildOpenView(invoice);
  }

  Widget _messageView({
    required IconData icon,
    required String title,
    required String message,
    required String buttonLabel,
    required VoidCallback onPressed,
    bool showComplaint = false,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 52, color: Colors.black38),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: onPressed,
              style: ElevatedButton.styleFrom(
                backgroundColor: _green,
                foregroundColor: Colors.white,
                elevation: 0,
                minimumSize: const Size(160, 44),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11),
                ),
              ),
              child: Text(
                buttonLabel,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
            ),
            if (showComplaint) ...[
              const SizedBox(height: 10),
              SizedBox(width: 200, child: _complaintButton()),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPaidView(Invoice invoice) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            children: [
              // Dấu tích trong vòng tròn xanh nhạt.
              Center(
                child: Container(
                  width: 52,
                  height: 52,
                  decoration: const BoxDecoration(
                    color: _greenLight,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_rounded, size: 30, color: _green),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Đặt lịch thành công',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1F2937),
                ),
              ),
              const SizedBox(height: 2),
              const Text(
                'Lịch đặt sân của bạn đã được xác nhận.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
              ),
              _orderCard(invoice),
              const SizedBox(height: 10),
              // Gợi ý đánh giá sân.
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _greenLight,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.star_outline_rounded, size: 16, color: _green),
                    SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Sau khi chơi xong, vào Lịch đặt sân → mở đơn → '
                        '"Đánh giá sân" để chấm sao và bình luận.',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.3,
                          color: Color(0xFF1F2937),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Nút nằm cố định ở đáy màn hình.
        Container(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          decoration: const BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(color: Color(0x1A000000), blurRadius: 10, offset: Offset(0, -2)),
            ],
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(flex: 4, child: _complaintButton(height: 44)),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 6,
                      child: SizedBox(
                        height: 44,
                        child: ElevatedButton(
                          onPressed: _backToStart,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _green,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text(
                            'Hoàn tất',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildOpenView(Invoice invoice) {
    final amountText = formatMoney(invoice.amount);
    final awaiting = invoice.isAwaitingOwner;
    final showUploader = !awaiting || _replacing;

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Container(
          width: double.infinity,
          color: awaiting ? const Color(0xFFFFF3E0) : const Color(0xFFDDF1E5),
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: awaiting
              ? Column(
                  children: [
                    const Text(
                      'Đã gửi ảnh, chờ chủ sân xác nhận',
                      style: TextStyle(
                        color: Color(0xFFE67E00),
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _confirmRemaining != null && _confirmRemaining! >= 0
                          ? Text(
                              'Còn ${_formatCountdown(_confirmRemaining!)} để chủ sân xác nhận',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Color(0xFFE67E00),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            )
                          : const Text(
                              'Chủ sân đang xử lý, sân của bạn vẫn được giữ',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Color(0xFFE67E00),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                    ),
                  ],
                )
              : Column(
                  children: [
                    const Text(
                      'Đơn của bạn còn được giữ chỗ trong',
                      style: TextStyle(
                        color: _green,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _countdownText,
                      style: const TextStyle(
                        color: _green,
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _orderCard(invoice),
              const SizedBox(height: 16),
              const Text(
                'Phương thức thanh toán',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _green),
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (invoice.paymentNotConfigured) ...[
                      _noticeBox(
                        icon: Icons.info_outline,
                        color: const Color(0xFFD64545),
                        background: const Color(0xFFFDECEC),
                        child: const Text(
                          'Hiện chưa có mã QR để chuyển khoản. Sân vẫn được giữ cho bạn, '
                          'bạn hãy quay lại sau ít phút hoặc nhờ quản trị viên hỗ trợ nhé.',
                          style: TextStyle(fontSize: 13, height: 1.3),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    _qrCard(invoice),
                    const SizedBox(height: 14),
                    if (invoice.proofs.isNotEmpty) ...[
                      _proofList(invoice),
                      const SizedBox(height: 12),
                    ],
                    if (invoice.rejectReason != null && !awaiting) ...[
                      _noticeBox(
                        icon: Icons.error_outline,
                        color: const Color(0xFFD64545),
                        background: const Color(0xFFFDECEC),
                        child: Text(
                          'Chủ sân chưa xác nhận khoản chuyển của bạn. Lý do: ${invoice.rejectReason}. '
                          'Bạn kiểm tra lại và gửi ảnh chuyển khoản mới nhé. '
                          'Nếu thấy chưa đúng, hãy bấm "Khiếu nại" bên dưới.',
                          style: const TextStyle(fontSize: 13, height: 1.3),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (awaiting) ...[
                      _noticeBox(
                        icon: Icons.hourglass_top_rounded,
                        color: const Color(0xFFE67E00),
                        background: const Color(0xFFFFF3E0),
                        child: const Text(
                          'Chủ sân đã nhận được ảnh chuyển khoản của bạn. Đơn sẽ hoàn tất ngay '
                          'khi chủ sân xác nhận đã nhận tiền. Sau 30 phút chưa được duyệt, bạn có thể khiếu nại (chậm duyệt).',
                          style: TextStyle(fontSize: 13, height: 1.3),
                        ),
                      ),
                      if (!_replacing) ...[
                        if (invoice.canSendMoreProofs)
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton.icon(
                              onPressed: () => setState(() => _replacing = true),
                              icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
                              label: Text(
                                'Gửi thêm ảnh (${invoice.proofs.length}/${invoice.maxProofs})',
                                style: const TextStyle(fontSize: 13),
                              ),
                            ),
                          )
                        else
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              'Bạn đã gửi tối đa ${invoice.maxProofs} ảnh cho đơn này.',
                              style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B7280)),
                            ),
                          ),
                      ],
                    ] else
                      _noticeBox(
                        icon: Icons.warning_amber_rounded,
                        color: const Color(0xFFF59E0B),
                        background: const Color(0xFFFFF3E0),
                        child: Text.rich(
                          TextSpan(
                            style: const TextStyle(fontSize: 13, height: 1.3),
                            children: [
                              const TextSpan(text: 'Vui lòng chuyển khoản '),
                              TextSpan(
                                text: amountText,
                                style: const TextStyle(
                                  color: _green,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const TextSpan(
                                text: ' và gửi ảnh vào ô bên dưới để hoàn tất đặt lịch!',
                              ),
                            ],
                          ),
                        ),
                      ),
                    if (showUploader) ...[
                      const SizedBox(height: 16),
                      Text.rich(
                        TextSpan(
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                          children: [
                            const TextSpan(text: 'Hình ảnh thanh toán '),
                            TextSpan(
                              text: '*',
                              style: TextStyle(color: Colors.red.shade600),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      _uploadBox(),
                      if (awaiting)
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: _checking
                                ? null
                                : () => setState(() {
                                      _replacing = false;
                                      _pickedImage = null;
                                      _pickedBytes = null;
                                      _missingImage = false;
                                    }),
                            child: const Text('Thôi, không gửi thêm', style: TextStyle(fontSize: 13)),
                          ),
                        ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Danh sách ảnh đã gửi (mới nhất trước): kết quả + lý do nếu bị từ chối. Chỉ hiển thị dữ liệu backend.
  Widget _proofList(Invoice invoice) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Ảnh đã gửi (${invoice.proofs.length}/${invoice.maxProofs})',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        for (final proof in invoice.proofs) _proofTile(proof),
      ],
    );
  }

  Widget _proofTile(PaymentProof proof) {
    final (label, color) = switch (proof.result) {
      'accepted' => ('Đã chấp nhận', _green),
      'rejected' => ('Bị từ chối', const Color(0xFFD64545)),
      _ => ('Đang chờ chủ sân', const Color(0xFFE67E00)),
    };
    final url = ApiClient.resolveFileUrl(proof.imageUrl);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => showDialog<void>(
              context: context,
              builder: (dialogContext) => Dialog(
                backgroundColor: Colors.white,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: InteractiveViewer(child: Image.network(url, fit: BoxFit.contain)),
                ),
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                url,
                width: 64,
                height: 64,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stack) => const SizedBox(
                  width: 64,
                  height: 64,
                  child: Icon(Icons.broken_image_outlined, color: Colors.black38),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: color),
                ),
                const SizedBox(height: 2),
                Text(
                  'Gửi lúc ${_formatServerTime(proof.sentAt)}',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                ),
                if (proof.transferredAt != null)
                  Text(
                    'Giờ chuyển: ${_formatServerTime(proof.transferredAt!)}',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                  ),
                if (proof.isRejected && proof.reason != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Lý do: ${proof.reason}',
                    style: const TextStyle(fontSize: 12.5, height: 1.3, color: Color(0xFFD64545)),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _noticeBox({
    required IconData icon,
    required Color color,
    required Color background,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(width: 10),
          Expanded(child: child),
        ],
      ),
    );
  }

  /// Ô chọn ảnh viền nét đứt; sau khi chọn thì xem trước + đổi/xoá.
  Widget _uploadBox() {
    final bytes = _pickedBytes;
    final borderColor = _missingImage ? Colors.red.shade400 : _green;

    return GestureDetector(
      onTap: _checking ? null : _pickImage,
      child: CustomPaint(
        painter: _DashedBorderPainter(color: borderColor, radius: 16),
        child: Container(
          width: double.infinity,
          height: 150,
          alignment: Alignment.center,
          child: bytes == null
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add_photo_alternate_outlined, size: 40, color: borderColor),
                    const SizedBox(height: 6),
                    Text(
                      'Tải ảnh chuyển khoản',
                      style: TextStyle(
                        color: borderColor,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'PNG, JPG (tối đa 5MB)',
                      style: TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
                    ),
                  ],
                )
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(6),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.memory(bytes, fit: BoxFit.contain),
                      ),
                    ),
                    Positioned(
                      top: 6,
                      right: 6,
                      child: Row(
                        children: [
                          _roundAction(Icons.edit_outlined, _pickImage),
                          const SizedBox(width: 6),
                          _roundAction(Icons.close, _clearImage),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _roundAction(IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: _checking ? null : onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 30,
        height: 30,
        decoration: const BoxDecoration(color: Color(0xCC000000), shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 16),
      ),
    );
  }

  Widget _orderCard(Invoice invoice) {
    final booking = widget.booking;
    final start = parseHm(booking.timeSlot);
    final end = start + booking.durationMinutes;
    final phone = booking.contactPhone ?? AuthApi.current?.phone ?? '';
    final courtName = booking.courtName ?? booking.court.name;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 3)),
        ],
      ),
      child: Column(
        children: [
          if (phone.isNotEmpty) _infoRow(Icons.phone_outlined, 'SĐT', phone),
          _infoRow(Icons.emoji_events_outlined, 'Mã đơn', '#${invoice.orderCode}'),
          _infoRow(
            Icons.calendar_month,
            'Chi tiết đơn',
            '${formatDate(booking.date)}\n'
                '   - $courtName: ${formatHourLabel(start)} - ${formatHourLabel(end)}',
          ),
          _infoRow(Icons.payments_outlined, 'Tổng đơn', formatMoney(invoice.amount)),
          _infoRow(
            Icons.savings_outlined,
            'Cần thanh toán',
            formatMoney(invoice.isPaid ? 0 : invoice.amount),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: _greenLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: _green, size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12)),
                const SizedBox(height: 1),
                Text(
                  value,
                  style: const TextStyle(
                    color: Color(0xFF1F2937),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _qrCard(Invoice invoice) {
    final qrUrl = invoice.qrUrl;
    final qrPayload = invoice.qrPayload;
    final hasQr = qrPayload != null || qrUrl != null;
    final account = invoice.accountNumber;
    final name = invoice.accountName;
    final bank = invoice.bankName ?? invoice.bankCode;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFFD9DDE1)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: !hasQr ? null : () => _showQrFullScreen(payload: qrPayload, url: qrUrl),
            child: SizedBox(
              width: 112,
              height: 112,
              child: !hasQr
                  ? const Icon(Icons.qr_code_2, size: 80, color: Colors.black26)
                  // Ưu tiên tự vẽ QR từ nội dung backend gửi (offline); chỉ khi không có
                  // mới tải ảnh dự phòng từ mạng.
                  : qrPayload != null
                  ? _localQr(qrPayload, 112)
                  : Image.network(
                      qrUrl!,
                      fit: BoxFit.contain,
                      loadingBuilder: (context, child, progress) => progress == null
                          ? child
                          : const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                      errorBuilder: (context, error, stack) => const Center(
                        child: Text(
                          'Không tải được mã QR',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (name != null)
                  Text(
                    name,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                  ),
                if (account != null) _infoLine('Số tài khoản', account),
                if (bank != null) _infoLine('Ngân hàng', bank),
                _infoLine('Số tiền', formatMoney(invoice.amount)),
                _infoLine('Nội dung CK', invoice.transferContent, strong: true),
                if (hasQr)
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton.icon(
                      onPressed: _savingQr
                          ? null
                          : () => _downloadQr(payload: qrPayload, url: qrUrl),
                      icon: _savingQr
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.download, size: 16),
                      label: const Text('Tải QR', style: TextStyle(fontSize: 13)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _green,
                        side: const BorderSide(color: _green),
                        visualDensity: VisualDensity.compact,
                        minimumSize: const Size(0, 34),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(11),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoLine(String label, String value, {bool strong = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: strong ? 14.5 : 13.5,
                    fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
                    color: strong ? _green : Colors.black87,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar(Invoice invoice) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(color: Color(0x1A000000), blurRadius: 10, offset: Offset(0, -2)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Thanh toán:', style: TextStyle(color: Colors.black54, fontSize: 13)),
                const Text(
                  'Tiền sân',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Tổng :', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                Text(
                  formatMoney(invoice.amount),
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: _green,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                // Đã gửi ảnh: chỉ hiện nút khiếu nại khi chủ sân duyệt chậm (quá 30 phút).
                if (!invoice.isAwaitingOwner || invoice.slowReview) ...[
                  Expanded(flex: 4, child: _complaintButton(height: 46)),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  flex: 6,
                  child: SizedBox(
                    height: 46,
                    child: ElevatedButton(
                      onPressed: _checking ? null : _checkPayment,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _green,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        disabledBackgroundColor: _green.withValues(alpha: 0.6),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: _checking
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              invoice.isAwaitingOwner && _pickedImage == null
                                  ? 'Kiểm tra lại'
                                  : 'Gửi ảnh xác nhận',
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ),
              ],
            ),
            // Chưa gửi ảnh chuyển khoản mới hủy được; đã gửi ảnh thì chờ chủ sân xác nhận/từ chối (backend chặn hủy).
            if (!invoice.isAwaitingOwner)
              TextButton.icon(
                onPressed: _cancelling || _checking ? null : _cancelBooking,
                icon: _cancelling
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.close_rounded, size: 18),
                label: const Text('Hủy đặt sân'),
                style: TextButton.styleFrom(foregroundColor: const Color(0xFFE5484D)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Viền nét đứt bo góc cho ô tải ảnh (không cần thêm package).
class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final double radius;

  const _DashedBorderPainter({required this.color, required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)));
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + 9), paint);
        distance += 15;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) => old.color != color || old.radius != radius;
}
