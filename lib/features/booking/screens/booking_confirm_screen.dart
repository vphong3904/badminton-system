import 'package:flutter/material.dart';
import '../../../shared/app_message_box.dart';
import '../../../core/utils/validators.dart';

import '../../../core/network/api_client.dart';
import '../../auth/data/auth_api.dart';
import '../../../core/utils/formatters.dart';
import '../data/booking_api.dart';
import '../data/booking_callbacks.dart';
import '../../payment/screens/payment_screen.dart';
import '../../../models/booking_cluster_model.dart';
import '../../../models/booking_model.dart';
import '../../../models/court_model.dart';
import '../../../models/schedule_model.dart';

/// Màn "Đặt lịch theo sân - trực quan": tóm tắt các cụm đã chọn (nhiều sân / nhiều khung giờ trong
/// một ngày), nhập thông tin liên hệ rồi gọi `POST /khach/dat-san/nhieu` và chuyển sang thanh toán
/// (một QR cho cả nhóm). Backend báo cụm trùng (409) → màn này đóng và trả danh sách [ConflictCluster]
/// cho màn lịch để khách sửa riêng các cụm đó.
class BookingConfirmScreen extends StatefulWidget {
  final Court court;
  final VenueSchedule schedule;
  final DateTime date;

  /// Các cụm đã gộp (mỗi cụm = một sân + một khoảng giờ liền nhau), sắp theo giờ.
  final List<BookingCluster> clusters;
  final int totalPrice;
  final ValueChanged<Booking> onBooked;
  final BookingPaymentUpdate? onPaymentUpdate;

  const BookingConfirmScreen({
    super.key,
    required this.court,
    required this.schedule,
    required this.date,
    required this.clusters,
    required this.totalPrice,
    required this.onBooked,
    this.onPaymentUpdate,
  });

  @override
  State<BookingConfirmScreen> createState() => _BookingConfirmScreenState();
}

class _BookingConfirmScreenState extends State<BookingConfirmScreen> {
  // Bảng màu đồng bộ với màn Thanh toán (QR): nền xám nhạt, thẻ trắng, nhấn xanh lá.
  static const Color _bg = Color(0xFFF5F6F7);
  static const Color _green = Color(0xFF2FA672);
  static const Color _card = Colors.white;
  static const Color _accent = Color(0xFFDDF1E5); // nền chip icon xanh nhạt
  static const Color _ink = Color(0xFF1F2937);
  static const Color _muted = Color(0xFF6B7280);

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
    if (session == null || !AuthApi.isValidMobile(_phone.text)) return false;
    return AuthApi.normalizePhone(_phone.text) != session.phone;
  }

  Future<void> _submit() async {
    if (_submitting) return;

    final name = _name.text.trim();
    final String? nameError = Validators.bookingName(name);
    final String? phoneError = Validators.phone(_phone.text);
    final noteError = Validators.note(_note.text);
    if (noteError != null) {
      _showSnack(noteError);
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
      final created = await BookingApi.createMultiBooking(
        venueId: widget.schedule.venueId,
        date: widget.date,
        clusters: widget.clusters,
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

      final first = widget.clusters.first;
      final courtNames = <String>[];
      for (final cluster in widget.clusters) {
        if (!courtNames.contains(cluster.courtName)) courtNames.add(cluster.courtName);
      }
      final booking = Booking(
        id: created.orderCode,
        court: widget.court,
        date: widget.date,
        timeSlot: formatMinutesAsHm(first.startMinute),
        durationMinutes: widget.clusters.fold<int>(0, (sum, c) => sum + c.minutes),
        totalPrice: created.totalAmount,
        status: 'Chờ xác nhận',
        paymentStatus: 'Chờ thanh toán',
        paymentMethod: 'Chuyển khoản QR',
        apiId: created.bookingId,
        courtName: courtNames.join(', '),
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
            fromBooking: true,
          ),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _submitting = false);
      if (error.isConflict) {
        // Có cụm vừa bị đặt/khóa: không giữ cụm nào (tất cả hoặc không). Quay lại bảng lịch kèm danh sách cụm
        // trùng để khách sửa riêng các cụm đó (màn lịch tải lại và báo chi tiết).
        final conflicts = ConflictCluster.listFrom(error.data);
        if (conflicts.isEmpty) {
          await showInfoBox(
            context,
            title: 'Rất tiếc, khung giờ này vừa có người đặt',
            message: error.message,
            kind: MessageKind.warning,
            buttonLabel: 'Chọn giờ khác',
          );
        }
        if (mounted) Navigator.pop(context, conflicts);
      } else if (error.statusCode == 429) {
        // Chặn tạm do hủy/để hết hạn giữ chỗ quá nhiều lần (giữ sân ảo). `message` đã là câu đọc được.
        await showInfoBox(
          context,
          title: 'Tạm thời chưa đặt được sân',
          message: error.message,
          kind: MessageKind.warning,
        );
      } else if (error.isUnauthorized) {
        _showSnack('Phiên đăng nhập đã hết hạn. Bạn hãy đăng nhập lại để tiếp tục đặt sân nhé.');
      } else {
        _showSnack(error.message);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _showSnack('Chưa đặt được sân. Bạn kiểm tra mạng rồi thử lại nhé.');
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // Giao diện

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        title: const Text('ĐẶT LỊCH THEO SÂN - TRỰC QUAN'),
        centerTitle: true,
        backgroundColor: _green,
        foregroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _venueCard(),
              const SizedBox(height: 12),
              _bookingCard(),
              const SizedBox(height: 16),
              _label('TÊN CỦA BẠN'),
              _textField(
                controller: _name,
                hint: 'Nhập tên của bạn',
                error: _nameError,
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 12),
              _label('SỐ ĐIỆN THOẠI'),
              _phoneField(),
              if (_canOfferSavePhone)
                CheckboxListTile(
                  value: _saveToAccount,
                  onChanged: (value) => setState(() => _saveToAccount = value ?? false),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  dense: true,
                  activeColor: _green,
                  checkColor: Colors.white,
                  side: const BorderSide(color: _muted),
                  title: const Text(
                    'Thêm số điện thoại này vào tài khoản của tôi',
                    style: TextStyle(color: _ink, fontSize: 13),
                  ),
                ),
              const SizedBox(height: 12),
              _label('GHI CHÚ CHO CHỦ SÂN'),
              _textField(
                controller: _note,
                hint: 'Nhập ghi chú',
                minLines: 2,
                maxLines: 4,
                maxLength: 500,
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 46,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _green,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: _green.withValues(alpha: 0.6),
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'XÁC NHẬN & THANH TOÁN',
                          style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold),
                        ),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Sân được giữ chỗ trong ít phút để bạn chuyển khoản. '
                'Lịch chỉ được xác nhận sau khi nhận được tiền.',
                textAlign: TextAlign.center,
                style: TextStyle(color: _muted, fontSize: 12),
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
        const SizedBox(height: 8),
        _kv('Địa chỉ: ', widget.schedule.address),
      ],
    );
  }

  Widget _bookingCard() {
    final schedule = widget.schedule;
    final lines = <Widget>[];
    for (final cluster in widget.clusters) {
      final price = schedule.priceFor(cluster.startMinute, cluster.endMinute);
      lines.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 3),
          child: Text.rich(
            TextSpan(
              style: const TextStyle(color: _ink, fontSize: 13.5),
              children: [
                TextSpan(
                  text: '- ${cluster.courtName}: '
                      '${formatHourLabel(cluster.startMinute)} - ${formatHourLabel(cluster.endMinute)}'
                      ' (${cluster.minutes} phút)',
                ),
                if (price != null) ...[
                  const TextSpan(text: ' | '),
                  TextSpan(
                    text: formatMoney(price),
                    style: const TextStyle(color: _green, fontWeight: FontWeight.w700),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }
    final totalMinutes = widget.clusters.fold<int>(0, (sum, c) => sum + c.minutes);

    return _sectionCard(
      icon: Icons.confirmation_number_outlined,
      title: 'Thông tin lịch đặt',
      children: [
        _kv('Ngày: ', formatDate(widget.date)),
        const SizedBox(height: 8),
        ...lines,
        const SizedBox(height: 8),
        _kv('Đối tượng: ', 'Bảng giá niêm yết'),
        const SizedBox(height: 8),
        _kv('Tổng giờ: ', formatTotalHours(totalMinutes)),
        const SizedBox(height: 8),
        _kv('Tổng tiền: ', formatMoney(widget.totalPrice)),
        const SizedBox(height: 4),
        const Text(
          'Thanh toán một lần cho tất cả các khung trên (một mã QR). '
          'Số tiền cuối cùng do hệ thống tính khi đặt.',
          style: TextStyle(color: _muted, fontSize: 12.5),
        ),
        const SizedBox(height: 8),
        _kv('Đặt tối thiểu: ', '${schedule.minMinutes} phút'),
        if (schedule.maxLateMinutes != null) ...[
          const SizedBox(height: 8),
          _kv('Đến trễ tối đa: ', '${schedule.maxLateMinutes} phút'),
          const SizedBox(height: 4),
          const Text(
            'Đến trong thời gian cho phép vẫn chơi đến hết giờ đã đặt, '
            'không bù thời gian và không hoàn tiền phần đến trễ.',
            style: TextStyle(color: _muted, fontSize: 12.5),
          ),
        ],
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
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _card,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 3)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: _accent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: _green, size: 18),
              ),
              const SizedBox(width: 10),
              Text(
                title,
                style: const TextStyle(
                  color: _green,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }

  Widget _kv(String key, String value) {
    return Text.rich(
      TextSpan(
        style: const TextStyle(color: _muted, fontSize: 13.5),
        children: [
          TextSpan(text: key),
          TextSpan(
            text: value,
            style: const TextStyle(fontWeight: FontWeight.w700, color: _ink),
          ),
        ],
      ),
    );
  }

  Widget _label(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: const TextStyle(
          color: _ink,
          fontSize: 13,
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
      errorStyle: const TextStyle(color: Color(0xFFD64545), fontSize: 12),
      hintStyle: const TextStyle(fontSize: 14),
      isDense: true,
      filled: true,
      fillColor: Colors.white,
      counterStyle: const TextStyle(color: _muted, fontSize: 11),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(11),
        borderSide: const BorderSide(color: Color(0xFFD9DDE1)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(11),
        borderSide: const BorderSide(color: Color(0xFFD9DDE1)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(11),
        borderSide: const BorderSide(color: _green, width: 1.6),
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
      style: const TextStyle(fontSize: 14),
      decoration: _decoration(hint, error),
    );
  }

  Widget _phoneField() {
    return TextField(
      controller: _phone,
      enabled: !_submitting,
      keyboardType: TextInputType.phone,
      style: const TextStyle(fontSize: 14),
      decoration: _decoration('Nhập số điện thoại', _phoneError).copyWith(
        prefixIcon: Padding(
          padding: const EdgeInsets.only(left: 12, right: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: const BoxDecoration(
                  color: Color(0xFFDA251D),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.star, size: 13, color: Color(0xFFDDF1E5)),
              ),
              const SizedBox(width: 6),
              const Text('+84', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 6),
              Container(width: 1, height: 18, color: Colors.black26),
            ],
          ),
        ),
      ),
    );
  }
}
