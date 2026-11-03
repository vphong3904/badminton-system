import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/auth_api.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/features/booking/data/booking_api.dart';
import 'package:flutter_application_1/features/booking/data/booking_callbacks.dart';
import 'package:flutter_application_1/models/booking_model.dart';

const Color _green = Color(0xFF0B6B3A);
const Color _greenDark = Color(0xFF0B5D2E);
const Color _greenLight = Color(0xFFD6F2DE);

/// Màn "Thanh toán": đếm ngược giữ chỗ, mã QR chuyển khoản, tải ảnh chuyển khoản.
///
/// Dữ liệu tiền / QR / thời gian giữ chỗ / trạng thái đều lấy từ backend
/// (`hoa-don-nhap`) và được làm mới định kỳ. Đơn chỉ được xác nhận khi backend
/// nhận webhook ngân hàng (SePay); ảnh chuyển khoản chỉ để chủ sân tham khảo.
class PaymentScreen extends StatefulWidget {
  final Booking booking;
  final BookingPaymentUpdate? onPaymentUpdate;

  const PaymentScreen({super.key, required this.booking, this.onPaymentUpdate});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  static const int _maxImageBytes = 5 * 1024 * 1024;
  static const Duration _pollInterval = Duration(seconds: 5);

  Invoice? _invoice;
  bool _loading = true;
  String? _error;
  bool _refreshing = false;

  int _remaining = 0;
  Timer? _tick;
  Timer? _poll;

  XFile? _proof;
  Uint8List? _proofBytes;
  bool _uploading = false;
  bool _proofSent = false;

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

  // ------------------------------------------------------------
  // Dữ liệu
  // ------------------------------------------------------------

  Future<void> _refresh() async {
    final bookingId = widget.booking.apiId;
    if (bookingId == null) {
      setState(() {
        _loading = false;
        _error = 'Đơn này chưa được tạo trên hệ thống nên không thể thanh toán.';
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
        final seconds = invoice.remainingSeconds ?? 0;
        _remaining = seconds < 0 ? 0 : seconds;
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
        if (_invoice == null) _error = 'Không đọc được dữ liệu thanh toán.';
      });
    } finally {
      _refreshing = false;
    }
  }

  void _onTick() {
    final invoice = _invoice;
    if (!mounted || invoice == null || !invoice.isOpen) return;
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
        transactionId: invoice.orderCode,
        paidAt: DateTime.now(),
      );
    } else if (invoice.isExpired) {
      widget.onPaymentUpdate?.call(
        widget.booking,
        paymentStatus: 'Thanh toán thất bại',
        paymentMethod: 'Chuyển khoản QR',
      );
    }
  }

  // ------------------------------------------------------------
  // Hành động
  // ------------------------------------------------------------

  Future<void> _pickImage() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 1800,
      );
      if (picked == null) return;

      final lower = picked.name.toLowerCase();
      const unsupported = ['.gif', '.heic', '.heif', '.bmp', '.tif', '.tiff'];
      if (unsupported.any(lower.endsWith)) {
        _snack('Chỉ nhận ảnh PNG hoặc JPG.');
        return;
      }
      if (await picked.length() > _maxImageBytes) {
        _snack('Ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.');
        return;
      }
      final bytes = await picked.readAsBytes();
      if (!mounted) return;
      setState(() {
        _proof = picked;
        _proofBytes = bytes;
      });
    } catch (_) {
      _snack('Không mở được thư viện ảnh. Hãy kiểm tra quyền truy cập ảnh.');
    }
  }

  Future<void> _submit() async {
    final invoice = _invoice;
    final bookingId = widget.booking.apiId;
    if (invoice == null || bookingId == null || !invoice.isOpen || _uploading) return;

    if (_proofSent || invoice.isWaitingForBank) {
      await _refresh();
      _snack('Hệ thống đang chờ ngân hàng báo có tiền. Vui lòng đợi trong giây lát.');
      return;
    }

    final proof = _proof;
    if (proof == null) {
      _snack('Vui lòng tải ảnh chuyển khoản trước khi tiếp tục.');
      return;
    }

    setState(() => _uploading = true);
    try {
      await BookingApi.uploadTransferProof(bookingId, proof);
      if (!mounted) return;
      setState(() => _proofSent = true);
      _snack('Đã gửi ảnh chuyển khoản. Đơn sẽ được xác nhận khi nhận được tiền.');
      await _refresh();
    } on ApiException catch (error) {
      _snack(error.message);
      if (error.isConflict) _refresh();
    } catch (_) {
      _snack('Không gửi được ảnh. Vui lòng thử lại.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _copy(String label, String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    _snack('Đã sao chép $label.');
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  void _showQrFullScreen(String url) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.white,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: InteractiveViewer(child: Image.network(url, fit: BoxFit.contain)),
        ),
      ),
    );
  }

  void _backToStart() {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  // ------------------------------------------------------------
  // Giao diện
  // ------------------------------------------------------------

  String get _countdownText {
    final minutes = (_remaining ~/ 60).toString().padLeft(2, '0');
    final seconds = (_remaining % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final invoice = _invoice;
    final isOpen = invoice != null && invoice.isOpen;

    return Scaffold(
      backgroundColor: const Color(0xFFF5F6F7),
      appBar: AppBar(
        title: const Text('Thanh toán'),
        centerTitle: true,
        foregroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 22,
          fontWeight: FontWeight.w600,
        ),
        flexibleSpace: const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF0B6B3A), Color(0xFF12A557)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
          ),
        ),
      ),
      body: _buildBody(invoice),
      bottomNavigationBar: isOpen ? _buildBottomBar(invoice) : null,
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
        message: 'Đơn đặt sân này đã được hủy nên không thể thanh toán.',
        buttonLabel: 'Quay lại',
        onPressed: _backToStart,
      );
    }
    if (invoice.isExpired) {
      return _messageView(
        icon: Icons.timer_off_outlined,
        title: 'Đơn đã hết hạn giữ chỗ',
        message: invoice.paymentStatus == 'late_payment'
            ? 'Hệ thống nhận được tiền sau khi đơn hết hạn. Vui lòng liên hệ chủ sân '
                'để được hỗ trợ hoàn tiền.'
            : 'Sân không còn được giữ cho bạn. Vui lòng đặt lại khung giờ khác.',
        buttonLabel: 'Quay lại',
        onPressed: _backToStart,
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
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: Colors.black38),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: onPressed,
              style: ElevatedButton.styleFrom(
                backgroundColor: _greenDark,
                foregroundColor: Colors.white,
                minimumSize: const Size(180, 48),
              ),
              child: Text(buttonLabel),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPaidView(Invoice invoice) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 12),
        const Icon(Icons.check_circle, size: 84, color: _green),
        const SizedBox(height: 12),
        const Text(
          'Thanh toán thành công',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: _green),
        ),
        const SizedBox(height: 6),
        const Text(
          'Lịch đặt sân của bạn đã được xác nhận.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        _orderCard(invoice),
        const SizedBox(height: 24),
        ElevatedButton(
          onPressed: _backToStart,
          style: ElevatedButton.styleFrom(
            backgroundColor: _greenDark,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
          ),
          child: const Text(
            'Hoàn tất',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  Widget _buildOpenView(Invoice invoice) {
    final params = _qrParams(invoice.qrUrl);
    final amountText = formatMoney(invoice.amount);

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Container(
          width: double.infinity,
          color: const Color(0xFFD9F7C4),
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            children: [
              const Text(
                'Đơn của bạn còn được giữ chỗ trong',
                style: TextStyle(
                  color: _green,
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _countdownText,
                style: const TextStyle(
                  color: _green,
                  fontSize: 30,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _orderCard(invoice),
              const SizedBox(height: 20),
              const Text(
                'Phương thức thanh toán',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: _green),
              ),
              const SizedBox(height: 10),
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
                    _qrCard(invoice, params),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF3E0),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.warning_amber_rounded,
                            color: Color(0xFFF59E0B),
                            size: 34,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text.rich(
                              TextSpan(
                                style: const TextStyle(fontSize: 16, height: 1.3),
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
                                    text: ' đúng nội dung và gửi ảnh vào ô bên dưới '
                                        'để hoàn tất đặt lịch!',
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text.rich(
                      TextSpan(
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                        children: [
                          TextSpan(text: 'Hình ảnh thanh toán '),
                          TextSpan(text: '*', style: TextStyle(color: Colors.red)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    _uploadBox(),
                    if (_proofSent || invoice.isWaitingForBank) ...[
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Text(
                              'Đang chờ ngân hàng báo có tiền để xác nhận đơn...',
                              style: TextStyle(fontSize: 14),
                            ),
                          ),
                        ],
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

  Widget _orderCard(Invoice invoice) {
    final booking = widget.booking;
    final start = parseHm(booking.timeSlot);
    final end = start + booking.durationMinutes;
    final phone = booking.contactPhone ?? AuthApi.current?.phone ?? '';
    final courtName = booking.courtName ?? booking.court.name;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
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
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: _greenLight,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: _green, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Colors.black54, fontSize: 15)),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    color: Color(0xFF0A4D2A),
                    fontSize: 18,
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

  Map<String, String> _qrParams(String? url) {
    if (url == null) return const {};
    try {
      return Uri.parse(url).queryParameters;
    } catch (_) {
      return const {};
    }
  }

  Widget _qrCard(Invoice invoice, Map<String, String> params) {
    final qrUrl = invoice.qrUrl;
    final account = params['acc'];
    final bank = params['bank'];
    final content = params['des'] ?? invoice.transferContent;

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
            onTap: qrUrl == null ? null : () => _showQrFullScreen(qrUrl),
            child: SizedBox(
              width: 128,
              height: 128,
              child: qrUrl == null
                  ? const Icon(Icons.qr_code_2, size: 96, color: Colors.black26)
                  : Image.network(
                      qrUrl,
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
                if (bank != null && bank.isNotEmpty) _copyLine('Ngân hàng', bank),
                if (account != null && account.isNotEmpty)
                  _copyLine('Số tài khoản', account),
                _copyLine('Số tiền', formatMoney(invoice.amount), copyValue: '${invoice.amount}'),
                _copyLine('Nội dung CK', content, strong: true),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _copyLine(String label, String value, {String? copyValue, bool strong = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Colors.black54, fontSize: 13)),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: strong ? 17 : 15,
                    fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
                    color: strong ? _green : Colors.black87,
                  ),
                ),
              ],
            ),
          ),
          InkWell(
            onTap: () => _copy(label.toLowerCase(), copyValue ?? value),
            borderRadius: BorderRadius.circular(16),
            child: const Padding(
              padding: EdgeInsets.all(6),
              child: Icon(Icons.copy_outlined, size: 20, color: Colors.black54),
            ),
          ),
        ],
      ),
    );
  }

  Widget _uploadBox() {
    final bytes = _proofBytes;
    final locked = _proofSent || _uploading;

    return GestureDetector(
      onTap: locked ? null : _pickImage,
      child: CustomPaint(
        painter: _DashedBorderPainter(color: _green, radius: 14),
        child: Container(
          width: double.infinity,
          height: 190,
          alignment: Alignment.center,
          child: bytes == null
              ? const Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add_photo_alternate_outlined, size: 64, color: _green),
                    SizedBox(height: 8),
                    Text(
                      'Tải ảnh chuyển khoản',
                      style: TextStyle(
                        color: _green,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text('PNG, JPG (tối đa 5MB)', style: TextStyle(fontSize: 14)),
                  ],
                )
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.memory(bytes!, fit: BoxFit.contain),
                      ),
                    ),
                    if (!locked)
                      Positioned(
                        top: 4,
                        right: 4,
                        child: IconButton.filled(
                          onPressed: () => setState(() {
                            _proof = null;
                            _proofBytes = null;
                          }),
                          style: IconButton.styleFrom(backgroundColor: Colors.black54),
                          icon: const Icon(Icons.close, size: 18, color: Colors.white),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildBottomBar(Invoice invoice) {
    final waiting = _proofSent || invoice.isWaitingForBank;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
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
                const Text('Thanh toán:', style: TextStyle(color: Colors.black54, fontSize: 17)),
                const Text(
                  'Tiền sân',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Tổng :', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                Text(
                  formatMoney(invoice.amount),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: _green,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _uploading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _greenDark,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: _greenDark.withValues(alpha: 0.6),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(27)),
                ),
                child: _uploading
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        waiting ? 'Kiểm tra thanh toán' : 'Tiếp tục thanh toán',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Viền nét đứt bo góc cho ô tải ảnh.
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
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)),
      );

    const dash = 9.0;
    const gap = 6.0;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + dash), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
