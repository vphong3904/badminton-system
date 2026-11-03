import 'package:flutter/material.dart';

import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/auth_api.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/features/booking/data/booking_api.dart';
import 'package:flutter_application_1/features/booking/data/booking_callbacks.dart';
import 'package:flutter_application_1/features/payment/screens/payment_screen.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/models/court_model.dart';

/// Màn "Đặt lịch theo sân - trực quan": tóm tắt lịch đã chọn, nhập thông tin
/// liên hệ rồi gọi API tạo đơn và chuyển sang thanh toán.
class BookingConfirmScreen extends StatefulWidget {
  final Court court;
  final VenueSchedule schedule;
  final CourtSchedule selectedCourt;
  final DateTime date;
  final int startMinute;
  final int endMinute;
  final int unitMinutes;
  final int totalPrice;
  final ValueChanged<Booking> onBooked;
  final BookingPaymentUpdate? onPaymentUpdate;

  const BookingConfirmScreen({
    super.key,
    required this.court,
    required this.schedule,
    required this.selectedCourt,
    required this.date,
    required this.startMinute,
    required this.endMinute,
    required this.unitMinutes,
    required this.totalPrice,
    required this.onBooked,
    this.onPaymentUpdate,
  });

  @override
  State<BookingConfirmScreen> createState() => _BookingConfirmScreenState();
}

class _BookingConfirmScreenState extends State<BookingConfirmScreen> {
  static const Color _bg = Color(0xFF066B38);
  static const Color _card = Color(0xFF085A30);
  static const Color _accent = Color(0xFFE6E36A);

  late final TextEditingController _name;
  late final TextEditingController _phone;
  final TextEditingController _note = TextEditingController();

  bool _saveToAccount = false;
  bool _submitting = false;
  String? _nameError;
  String? _phoneError;

  @override
  void initState() {
    super.initState();
    final session = AuthApi.current;
    _name = TextEditingController(text: session?.fullName ?? '');
    _phone = TextEditingController(text: session?.phone ?? '');
    _phone.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _note.dispose();
    super.dispose();
  }

  /// Chỉ hỏi "lưu số điện thoại" khi số nhập khác số của tài khoản.
  bool get _canOfferSavePhone {
    final session = AuthApi.current;
    if (session == null || !AuthApi.isValidPhone(_phone.text)) return false;
    return AuthApi.normalizePhone(_phone.text) != session.phone;
  }

  Future<void> _submit() async {
    if (_submitting) return;

    final name = _name.text.trim();
    String? nameError;
    String? phoneError;
    if (name.length < 2) nameError = 'Vui lòng nhập tên (tối thiểu 2 ký tự).';
    if (!AuthApi.isValidPhone(_phone.text)) {
      phoneError = 'Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).';
    }
    if (_note.text.trim().length > 500) {
      _showSnack('Ghi chú tối đa 500 ký tự.');
      return;
    }
    if (nameError != null || phoneError != null) {
      setState(() {
        _nameError = nameError;
        _phoneError = phoneError;
      });
      return;
    }

    setState(() {
      _submitting = true;
      _nameError = null;
      _phoneError = null;
    });

    final phone = AuthApi.normalizePhone(_phone.text);
    try {
      final created = await BookingApi.createBooking(
        courtId: widget.selectedCourt.id,
        date: widget.date,
        startMinute: widget.startMinute,
        endMinute: widget.endMinute,
        name: name,
        phone: phone,
        note: _note.text,
      );

      if (_saveToAccount && _canOfferSavePhone) {
        try {
          await AuthApi.updatePhone(phone);
        } catch (_) {
          // Không ảnh hưởng đơn đã tạo.
        }
      }
      if (!mounted) return;

      final booking = Booking(
        id: created.orderCode,
        court: widget.court,
        date: widget.date,
        timeSlot: formatMinutesAsHm(widget.startMinute),
        durationMinutes: widget.endMinute - widget.startMinute,
        totalPrice: created.totalAmount,
        status: 'Chờ xác nhận',
        paymentStatus: 'Chờ thanh toán',
        paymentMethod: 'Chuyển khoản QR',
        apiId: created.bookingId,
        courtName: widget.selectedCourt.name,
        contactName: name,
        contactPhone: phone,
      );
      widget.onBooked(booking);

      await Navigator.pushReplacement<void, void>(
        context,
        MaterialPageRoute<void>(
          builder: (_) => PaymentScreen(
            booking: booking,
            onPaymentUpdate: widget.onPaymentUpdate,
          ),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _submitting = false);
      if (error.isConflict) {
        // Có người đặt trước: quay lại bảng lịch để chọn giờ khác.
        await showDialog<void>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Không thể đặt sân'),
            content: Text(error.message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Chọn giờ khác'),
              ),
            ],
          ),
        );
        if (mounted) Navigator.pop(context);
      } else if (error.isUnauthorized) {
        _showSnack('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại để đặt sân.');
      } else {
        _showSnack(error.message);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _showSnack('Không thể tạo đơn đặt sân. Vui lòng thử lại.');
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // ------------------------------------------------------------
  // Giao diện
  // ------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        title: const Text('ĐẶT LỊCH THEO SÂN - TRỰC QUAN'),
        centerTitle: true,
        backgroundColor: _bg,
        foregroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _venueCard(),
              const SizedBox(height: 16),
              _bookingCard(),
              const SizedBox(height: 20),
              _label('TÊN CỦA BẠN'),
              _textField(
                controller: _name,
                hint: 'Nhập tên của bạn',
                error: _nameError,
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 16),
              _label('SỐ ĐIỆN THOẠI'),
              _phoneField(),
              if (_canOfferSavePhone)
                CheckboxListTile(
                  value: _saveToAccount,
                  onChanged: (value) => setState(() => _saveToAccount = value ?? false),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  dense: true,
                  activeColor: _accent,
                  checkColor: Colors.black87,
                  side: const BorderSide(color: Colors.white70),
                  title: const Text(
                    'Thêm số điện thoại này vào tài khoản của tôi',
                    style: TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ),
              const SizedBox(height: 16),
              _label('GHI CHÚ CHO CHỦ SÂN'),
              _textField(
                controller: _note,
                hint: 'Nhập ghi chú',
                minLines: 2,
                maxLines: 4,
                maxLength: 500,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.accentGold,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppTheme.accentGold.withValues(alpha: 0.6),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'XÁC NHẬN & THANH TOÁN',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                        ),
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Sân được giữ chỗ trong ít phút để bạn chuyển khoản. '
                'Lịch chỉ được xác nhận sau khi nhận được tiền.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white70, fontSize: 12.5),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _venueCard() {
    return _sectionCard(
      icon: Icons.map_outlined,
      title: 'Thông tin sân',
      children: [
        _kv('Tên CLB: ', widget.schedule.name),
        const SizedBox(height: 10),
        _kv('Địa chỉ: ', widget.schedule.address),
      ],
    );
  }

  Widget _bookingCard() {
    final schedule = widget.schedule;
    final lines = <Widget>[];
    for (var m = widget.startMinute; m < widget.endMinute; m += widget.unitMinutes) {
      final price = schedule.priceFor(m, m + widget.unitMinutes);
      lines.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text.rich(
            TextSpan(
              style: const TextStyle(color: Colors.white, fontSize: 16),
              children: [
                TextSpan(
                  text: '- ${widget.selectedCourt.name}: '
                      '${formatHourLabel(m)} - ${formatHourLabel(m + widget.unitMinutes)}',
                ),
                if (price != null) ...[
                  const TextSpan(text: ' | '),
                  TextSpan(
                    text: formatMoney(price),
                    style: const TextStyle(color: _accent),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    return _sectionCard(
      icon: Icons.confirmation_number_outlined,
      title: 'Thông tin lịch đặt',
      children: [
        _kv('Ngày: ', formatDate(widget.date)),
        const SizedBox(height: 12),
        ...lines,
        const SizedBox(height: 14),
        _kv('Đối tượng: ', 'Bảng giá niêm yết'),
        const SizedBox(height: 14),
        _kv('Tổng giờ: ', formatTotalHours(widget.endMinute - widget.startMinute)),
        const SizedBox(height: 14),
        _kv('Tổng tiền: ', formatMoney(widget.totalPrice)),
      ],
    );
  }

  Widget _sectionCard({
    required IconData icon,
    required String title,
    required List<Widget> children,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: _accent, size: 26),
              const SizedBox(width: 10),
              Text(
                title,
                style: const TextStyle(
                  color: _accent,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _kv(String key, String value) {
    return Text.rich(
      TextSpan(
        style: const TextStyle(color: Colors.white, fontSize: 16),
        children: [
          TextSpan(text: key),
          TextSpan(
            text: value,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  Widget _label(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  InputDecoration _decoration(String hint, String? error) {
    return InputDecoration(
      hintText: hint,
      errorText: error,
      errorStyle: const TextStyle(color: Color(0xFFFFD2D2)),
      filled: true,
      fillColor: Colors.white,
      counterStyle: const TextStyle(color: Colors.white70),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide.none,
      ),
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String hint,
    String? error,
    int minLines = 1,
    int maxLines = 1,
    int? maxLength,
    TextCapitalization textCapitalization = TextCapitalization.none,
  }) {
    return TextField(
      controller: controller,
      minLines: minLines,
      maxLines: maxLines,
      maxLength: maxLength,
      textCapitalization: textCapitalization,
      enabled: !_submitting,
      style: const TextStyle(fontSize: 17),
      decoration: _decoration(hint, error),
    );
  }

  Widget _phoneField() {
    return TextField(
      controller: _phone,
      enabled: !_submitting,
      keyboardType: TextInputType.phone,
      style: const TextStyle(fontSize: 17),
      decoration: _decoration('Nhập số điện thoại', _phoneError).copyWith(
        prefixIcon: Padding(
          padding: const EdgeInsets.only(left: 12, right: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: const BoxDecoration(
                  color: Color(0xFFDA251D),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.star, size: 16, color: Color(0xFFFFFF00)),
              ),
              const SizedBox(width: 8),
              const Text('+84', style: TextStyle(fontSize: 17)),
              const SizedBox(width: 6),
              Container(width: 1, height: 24, color: Colors.black26),
            ],
          ),
        ),
      ),
    );
  }
}
