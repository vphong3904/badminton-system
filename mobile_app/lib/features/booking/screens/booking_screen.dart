import 'package:flutter/material.dart';
<<<<<<< HEAD

import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/features/booking/data/booking_api.dart';
import 'package:flutter_application_1/features/booking/data/booking_callbacks.dart';
import 'package:flutter_application_1/features/booking/screens/booking_confirm_screen.dart';
import 'package:flutter_application_1/features/search/widgets/date_picker_sheet.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/models/court_model.dart';

// Giữ nguyên đường import cũ: nơi khác vẫn lấy BookingPaymentUpdate từ file này.
export 'package:flutter_application_1/features/booking/data/booking_callbacks.dart';

enum _CellState { free, booked, locked, past, noPrice, selected }

/// Màn "Đặt lịch ngày": bảng lịch trực quan, mỗi hàng là một sân con, mỗi cột
/// là một khung giờ. Người dùng chạm ô để chọn một khoảng giờ liền nhau trên
/// MỘT sân (backend tạo mỗi đơn cho một sân), rồi sang bước xác nhận.
=======
import 'package:url_launcher/url_launcher.dart';

import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/models/court_model.dart';

// ============================================================
// CÁC KIỂU CALLBACK THANH TOÁN
// ============================================================

typedef BookingPaymentUpdate = void Function(
  Booking booking, {
  required String paymentStatus,
  required String paymentMethod,
  String? transactionId,
  DateTime? paidAt,
  String? paymentProof,
});

typedef CreateOnlinePaymentCallback = Future<OnlinePaymentRequest?> Function(
  Booking booking,
  String provider,
);

typedef VerifyOnlinePaymentCallback =
    Future<OnlinePaymentVerification?> Function(
  Booking booking,
  String transactionId,
);

// Kết quả tạo giao dịch do backend trả về.
class OnlinePaymentRequest {
  final String transactionId;
  final String checkoutUrl;

  const OnlinePaymentRequest({
    required this.transactionId,
    required this.checkoutUrl,
  });
}

// Kết quả xác minh giao dịch do backend trả về.
class OnlinePaymentVerification {
  final bool isSuccess;
  final String transactionId;
  final DateTime paidAt;
  final String proofReference;
  final String message;

  const OnlinePaymentVerification({
    required this.isSuccess,
    required this.transactionId,
    required this.paidAt,
    required this.proofReference,
    required this.message,
  });
}

// ============================================================
// MÀN HÌNH ĐẶT SÂN
// ============================================================

>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
class BookingScreen extends StatefulWidget {
  final Court court;
  final ValueChanged<Booking> onBooked;
  final BookingPaymentUpdate? onPaymentUpdate;
<<<<<<< HEAD
=======
  final CreateOnlinePaymentCallback? onCreatePayment;
  final VerifyOnlinePaymentCallback? onVerifyPayment;

  // Callback báo AppShell chuyển về Trang chủ khi hoàn tất.
  final VoidCallback? onPaymentCompleted;
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

  const BookingScreen({
    super.key,
    required this.court,
    required this.onBooked,
    this.onPaymentUpdate,
<<<<<<< HEAD
=======
    this.onCreatePayment,
    this.onVerifyPayment,
    this.onPaymentCompleted,
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
  });

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
<<<<<<< HEAD
  static const double _cellWidth = 64;
  static const double _rowHeight = 56;
  static const double _headerHeight = 44;
  static const double _nameWidth = 92;

  static const Color _bookedColor = Color(0xFFF65353);
  static const Color _lockedColor = Color(0xFFBDBDBD);
  static const Color _pastColor = Color(0xFFEFEFEF);
  static const Color _lineColor = Color(0xFFE3E6EA);

  final ScrollController _hScroll = ScrollController();

  DateTime _date = DateUtils.dateOnly(DateTime.now());
  int _unit = 30; // độ dài mỗi ô (phút)
  bool _unitChosen = false;

  VenueSchedule? _schedule;
  bool _loading = true;
  String? _error;
  int _loadToken = 0;

  int? _selCourt;
  int? _selStart;
  int? _selEnd;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _hScroll.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------
  // Tải lịch
  // ------------------------------------------------------------

  Future<void> _load() async {
    final venueId = widget.court.venueId;
    if (venueId == null) {
      setState(() {
        _loading = false;
        _error =
            'Cơ sở "${widget.court.name}" chưa liên kết với hệ thống đặt sân '
            '(thiếu mã cơ sở trên backend).';
      });
      return;
    }

    final token = ++_loadToken;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final schedule = await BookingApi.fetchSchedule(venueId, _date);
      if (!mounted || token != _loadToken) return;
      setState(() {
        _schedule = schedule;
        _loading = false;
        if (!_unitChosen) {
          _unit = schedule.minMinutes >= 60 ? 60 : 30;
          _unitChosen = true;
        }
        _clearSelection();
      });
      _scrollToNow();
    } on ApiException catch (error) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } catch (_) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _loading = false;
        _error = 'Dữ liệu lịch không hợp lệ. Vui lòng thử lại.';
      });
    }
  }

  void _scrollToNow() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final schedule = _schedule;
      if (!mounted || schedule == null || !_hScroll.hasClients) return;

      double offset = 0;
      final now = DateTime.now();
      if (_date == DateUtils.dateOnly(now)) {
        final minute = now.hour * 60 + now.minute;
        final index = ((minute - schedule.openMinute) / _unit).floor();
        offset = index * _cellWidth;
      }
      _hScroll.jumpTo(offset.clamp(0.0, _hScroll.position.maxScrollExtent));
    });
  }

  // ------------------------------------------------------------
  // Trạng thái ô
  // ------------------------------------------------------------

  List<int> _cellStarts(VenueSchedule schedule) {
    final starts = <int>[];
    for (var m = schedule.openMinute; m + _unit <= schedule.closeMinute; m += _unit) {
      starts.add(m);
    }
    return starts;
  }

  bool _isPast(int start) {
    final now = DateTime.now();
    final today = DateUtils.dateOnly(now);
    if (_date.isBefore(today)) return true;
    if (_date.isAfter(today)) return false;
    return start <= now.hour * 60 + now.minute;
  }

  /// Trạng thái của ô không tính phần đang chọn.
  _CellState _baseState(VenueSchedule schedule, CourtSchedule court, int start) {
    final end = start + _unit;
    final busy = court.busyAt(start, end);
    if (busy != null) return busy.locked ? _CellState.locked : _CellState.booked;
    if (_isPast(start)) return _CellState.past;
    if (schedule.priceFor(start, end) == null) return _CellState.noPrice;
    return _CellState.free;
  }

  _CellState _cellState(VenueSchedule schedule, CourtSchedule court, int start) {
    if (_selCourt == court.id &&
        _selStart != null &&
        start >= _selStart! &&
        start + _unit <= _selEnd!) {
      return _CellState.selected;
    }
    return _baseState(schedule, court, start);
  }

  // ------------------------------------------------------------
  // Chọn ô
  // ------------------------------------------------------------

  void _clearSelection() {
    _selCourt = null;
    _selStart = null;
    _selEnd = null;
  }

  void _select(int courtId, int start, int end) {
    _selCourt = courtId;
    _selStart = start;
    _selEnd = end;
  }

  bool _rangeFree(VenueSchedule schedule, CourtSchedule court, int start, int end) {
    for (var m = start; m < end; m += _unit) {
      if (_baseState(schedule, court, m) != _CellState.free) return false;
    }
    return true;
  }

  void _onTapCell(VenueSchedule schedule, CourtSchedule court, int start) {
    switch (_baseState(schedule, court, start)) {
      case _CellState.booked:
        _toast('Khung giờ này đã có người đặt.');
        return;
      case _CellState.locked:
        _toast('Sân đang bị khóa trong khung giờ này.');
        return;
      case _CellState.past:
        _toast('Khung giờ này đã qua.');
        return;
      case _CellState.noPrice:
        _toast('Khung giờ này chưa có bảng giá.');
        return;
      case _CellState.free:
      case _CellState.selected:
        break;
    }

    final end = start + _unit;
    setState(() {
      final selStart = _selStart;
      final selEnd = _selEnd;
      if (_selCourt != court.id || selStart == null || selEnd == null) {
        _select(court.id, start, end);
        return;
      }

      // Chạm vào ô đã chọn: thu hẹp hoặc bỏ chọn.
      if (start >= selStart && end <= selEnd) {
        if (selEnd - selStart == _unit) {
          _clearSelection();
        } else if (start == selStart) {
          _select(court.id, start, end);
        } else {
          _selEnd = end;
        }
        return;
      }

      // Chạm ô khác cùng sân: mở rộng nếu toàn bộ khoảng ở giữa còn trống.
      final newStart = start < selStart ? start : selStart;
      final newEnd = end > selEnd ? end : selEnd;
      if (_rangeFree(schedule, court, newStart, newEnd)) {
        _selStart = newStart;
        _selEnd = newEnd;
      } else {
        _select(court.id, start, end);
      }
    });
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // ------------------------------------------------------------
  // Chọn ngày / khung giờ
  // ------------------------------------------------------------

  Future<void> _pickDate() async {
    final picked = await showDatePickerSheet(context, initial: _date);
    if (picked == null || !mounted) return;
    final date = DateUtils.dateOnly(picked);
    if (date == _date) return;
    setState(() => _date = date);
    _load();
  }

  Future<void> _pickUnit() async {
    final picked = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 16),
            const Text(
              'Chọn khung giờ',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            for (final minutes in const [30, 60])
              ListTile(
                title: Text('$minutes Phút'),
                trailing: minutes == _unit
                    ? const Icon(Icons.check, color: AppTheme.primaryColor)
                    : null,
                onTap: () => Navigator.pop(sheetContext, minutes),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked == null || picked == _unit || !mounted) return;
    setState(() {
      _unit = picked;
      _clearSelection();
    });
    _scrollToNow();
  }

  // ------------------------------------------------------------
  // Sang bước xác nhận
  // ------------------------------------------------------------

  Future<void> _goConfirm() async {
    final schedule = _schedule;
    final courtId = _selCourt;
    final start = _selStart;
    final end = _selEnd;
    if (schedule == null || courtId == null || start == null || end == null) return;

    if (!ApiClient.hasToken) {
      _toast('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại để đặt sân.');
      return;
    }
    if (end - start < schedule.minMinutes) {
      _toast(
        'Cơ sở yêu cầu đặt tối thiểu ${schedule.minMinutes} phút. '
        'Vui lòng chọn thêm giờ.',
      );
      return;
    }
    final total = schedule.priceFor(start, end);
    if (total == null) {
      _toast('Khung giờ đã chọn chưa có bảng giá.');
      return;
    }

    final court = schedule.courts.firstWhere((item) => item.id == courtId);
    await Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => BookingConfirmScreen(
          court: widget.court,
          schedule: schedule,
          selectedCourt: court,
          date: _date,
          startMinute: start,
          endMinute: end,
          unitMinutes: _unit,
          totalPrice: total,
          onBooked: widget.onBooked,
          onPaymentUpdate: widget.onPaymentUpdate,
        ),
      ),
    );

    // Quay lại từ bước xác nhận/thanh toán: tải lại lịch cho đúng thực tế.
    if (mounted) _load();
  }

  // ------------------------------------------------------------
  // Giao diện
  // ------------------------------------------------------------
=======
  DateTime _ngayChon = DateUtils.dateOnly(DateTime.now());
  String _gioBatDau = '08:00';
  int _thoiLuong = 60;
  bool _dangTaoDatSan = false;

  final List<String> _danhSachGio = const [
    '06:00',
    '07:00',
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
    '18:00',
    '19:00',
    '20:00',
    '21:00',
  ];

  final List<int> _danhSachThoiLuong = const [30, 60, 90, 120];

  int get _tongTien =>
      (widget.court.pricePerHour * _thoiLuong / 60).round();

  String _dinhDangNgay(DateTime ngay) {
    final ngayText = ngay.day.toString().padLeft(2, '0');
    final thangText = ngay.month.toString().padLeft(2, '0');
    return '$ngayText/$thangText/${ngay.year}';
  }

  String _dinhDangThoiLuong(int phut) {
    if (phut < 60) return '$phut phút';
    final gio = phut ~/ 60;
    final phutConLai = phut % 60;
    if (phutConLai == 0) return '$gio giờ';
    return '$gio giờ $phutConLai phút';
  }

  // Chọn ngày đặt sân.
  Future<void> _chonNgay() async {
    final homNay = DateUtils.dateOnly(DateTime.now());

    final ngayDuocChon = await showDatePicker(
      context: context,
      initialDate: _ngayChon,
      firstDate: homNay,
      lastDate: homNay.add(const Duration(days: 90)),
      helpText: 'Chọn ngày chơi',
      cancelText: 'Hủy',
      confirmText: 'Xác nhận',
    );

    if (!mounted || ngayDuocChon == null) return;

    setState(() {
      _ngayChon = DateUtils.dateOnly(ngayDuocChon);
    });
  }

  // Tạo lượt đặt sân và chuyển sang màn hình thanh toán.
  Future<void> _xacNhanDatSan() async {
    if (_dangTaoDatSan) return;

    setState(() {
      _dangTaoDatSan = true;
    });

    try {
      final datSanMoi = Booking(
        id: 'BK${DateTime.now().millisecondsSinceEpoch}',
        court: widget.court,
        date: _ngayChon,
        timeSlot: _gioBatDau,
        durationMinutes: _thoiLuong,
        totalPrice: _tongTien,
        status: 'Chờ xác nhận',
        paymentStatus: 'Chờ thanh toán',
        paymentMethod: 'Thanh toán trực tuyến',
      );

      // Lưu lịch đặt với trạng thái chờ thanh toán.
      widget.onBooked(datSanMoi);

      if (!mounted) return;

      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => OnlinePaymentScreen(
            booking: datSanMoi,
            onPaymentUpdate: widget.onPaymentUpdate,
            onCreatePayment: widget.onCreatePayment,
            onVerifyPayment: widget.onVerifyPayment,
            onPaymentCompleted: widget.onPaymentCompleted,
          ),
        ),
      );
    } catch (loi) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Không thể tạo lịch đặt: $loi'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _dangTaoDatSan = false;
        });
      }
    }
  }

  Widget _tieuDeMuc(String tieuDe, IconData bieuTuong) {
    return Row(
      children: [
        Icon(bieuTuong, color: const Color(0xFF16845B)),
        const SizedBox(width: 9),
        Text(
          tieuDe,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }

  Widget _dongThongTin(String nhan, String giaTri) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          nhan,
          style: TextStyle(color: Colors.grey.shade700),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            giaTri,
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  Widget _theThongTinSan() {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: const Color(0xFFE5F3EB),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.sports_tennis,
              color: Color(0xFF16845B),
              size: 28,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.court.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  widget.court.address,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '${formatMoney(widget.court.pricePerHour)}/giờ',
                  style: const TextStyle(
                    color: Color(0xFF16845B),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chonGio() {
    return Wrap(
      spacing: 9,
      runSpacing: 9,
      children: _danhSachGio.map((gio) {
        final dangChon = _gioBatDau == gio;

        return ChoiceChip(
          label: Text(gio),
          selected: dangChon,
          onSelected: (_) {
            setState(() {
              _gioBatDau = gio;
            });
          },
          selectedColor: const Color(0xFF16845B),
          backgroundColor: Colors.white,
          labelStyle: TextStyle(
            color: dangChon ? Colors.white : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        );
      }).toList(),
    );
  }

  Widget _chonThoiLuong() {
    return Wrap(
      spacing: 9,
      runSpacing: 9,
      children: _danhSachThoiLuong.map((phut) {
        final dangChon = _thoiLuong == phut;

        return ChoiceChip(
          label: Text(_dinhDangThoiLuong(phut)),
          selected: dangChon,
          onSelected: (_) {
            setState(() {
              _thoiLuong = phut;
            });
          },
          selectedColor: const Color(0xFF16845B),
          backgroundColor: Colors.white,
          labelStyle: TextStyle(
            color: dangChon ? Colors.white : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        );
      }).toList(),
    );
  }

  Widget _theTongKet() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F8F4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD6EADF)),
      ),
      child: Column(
        children: [
          _dongThongTin('Tên sân', widget.court.name),
          const SizedBox(height: 12),
          _dongThongTin('Ngày chơi', _dinhDangNgay(_ngayChon)),
          const SizedBox(height: 12),
          _dongThongTin('Giờ bắt đầu', _gioBatDau),
          const SizedBox(height: 12),
          _dongThongTin(
            'Thời lượng',
            _dinhDangThoiLuong(_thoiLuong),
          ),
          const Divider(height: 26),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Tổng tiền',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                formatMoney(_tongTien),
                style: const TextStyle(
                  color: Color(0xFF16845B),
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

  @override
  Widget build(BuildContext context) {
    return Scaffold(
<<<<<<< HEAD
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('Đặt lịch ngày'),
        centerTitle: true,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: [
          IconButton(
            tooltip: 'Tải lại lịch',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: _selector(
                      label: 'Chọn ngày:',
                      value: formatDate(_date),
                      icon: Icons.calendar_month,
                      onTap: _pickDate,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _selector(
                      label: 'Chọn khung giờ:',
                      value: '$_unit Phút',
                      icon: Icons.access_time,
                      onTap: _pickUnit,
                    ),
                  ),
                ],
              ),
            ),
            _buildLegend(),
            const SizedBox(height: 8),
            const Divider(height: 1, color: _lineColor),
            Expanded(child: _buildBody()),
            _buildBottomBar(),
          ],
=======
      backgroundColor: const Color(0xFFF5F7F5),
      appBar: AppBar(
        title: const Text('Đặt sân'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF10583F),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _tieuDeMuc('Thông tin sân', Icons.sports_tennis),
              const SizedBox(height: 12),
              _theThongTinSan(),
              const SizedBox(height: 24),

              _tieuDeMuc('Chọn ngày chơi', Icons.calendar_month),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _chonNgay,
                  icon: const Icon(Icons.calendar_today),
                  label: Text(_dinhDangNgay(_ngayChon)),
                ),
              ),
              const SizedBox(height: 24),

              _tieuDeMuc('Chọn giờ bắt đầu', Icons.access_time),
              const SizedBox(height: 12),
              _chonGio(),
              const SizedBox(height: 24),

              _tieuDeMuc('Chọn thời lượng', Icons.timelapse),
              const SizedBox(height: 12),
              _chonThoiLuong(),
              const SizedBox(height: 24),

              _tieuDeMuc('Thông tin thanh toán', Icons.receipt_long),
              const SizedBox(height: 12),
              _theTongKet(),
              const SizedBox(height: 16),

              Container(
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF8E7),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, color: Colors.orange),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Lịch đặt sẽ ở trạng thái chờ thanh toán. '
                        'Chỉ chuyển sang đã xác nhận sau khi hệ thống '
                        'kiểm tra giao dịch thành công.',
                        style: TextStyle(fontSize: 12, height: 1.5),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _dangTaoDatSan ? null : _xacNhanDatSan,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF16845B),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _dangTaoDatSan
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          'Tiếp tục thanh toán',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
        ),
      ),
    );
  }
<<<<<<< HEAD

  Widget _selector({
    required String label,
    required String value,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 15)),
        const SizedBox(height: 8),
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: const Color(0xFFF7F8FA),
              border: Border.all(color: _lineColor),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    value,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
                  ),
                ),
                Icon(icon, color: Colors.black87),
              ],
=======
}

// ============================================================
// MÀN HÌNH THANH TOÁN TRỰC TUYẾN
// ============================================================

class OnlinePaymentScreen extends StatefulWidget {
  final Booking booking;
  final BookingPaymentUpdate? onPaymentUpdate;
  final CreateOnlinePaymentCallback? onCreatePayment;
  final VerifyOnlinePaymentCallback? onVerifyPayment;
  final VoidCallback? onPaymentCompleted;

  const OnlinePaymentScreen({
    super.key,
    required this.booking,
    this.onPaymentUpdate,
    this.onCreatePayment,
    this.onVerifyPayment,
    this.onPaymentCompleted,
  });

  @override
  State<OnlinePaymentScreen> createState() =>
      _OnlinePaymentScreenState();
}

class _OnlinePaymentScreenState extends State<OnlinePaymentScreen> {
  String _congThanhToan = 'VNPay';
  bool _dangXuLy = false;
  bool _daThanhToan = false;

  OnlinePaymentRequest? _yeuCauThanhToan;
  OnlinePaymentVerification? _ketQuaXacMinh;
  String? _thongBaoLoi;

  final List<Map<String, String>> _danhSachCong = const [
    {
      'ma': 'VNPay',
      'moTa': 'Thanh toán qua cổng VNPay',
    },
    {
      'ma': 'MoMo',
      'moTa': 'Thanh toán bằng ví MoMo',
    },
    {
      'ma': 'ZaloPay',
      'moTa': 'Thanh toán bằng ví ZaloPay',
    },
  ];

  String _dinhDangThoiGian(DateTime thoiGian) {
    final ngay = thoiGian.day.toString().padLeft(2, '0');
    final thang = thoiGian.month.toString().padLeft(2, '0');
    final gio = thoiGian.hour.toString().padLeft(2, '0');
    final phut = thoiGian.minute.toString().padLeft(2, '0');
    return '$ngay/$thang/${thoiGian.year} $gio:$phut';
  }

  // Tạo giao dịch với backend rồi mở trang thanh toán của cổng.
  Future<void> _taoGiaoDich() async {
    if (_dangXuLy || _daThanhToan) return;

    if (widget.onCreatePayment == null) {
      setState(() {
        _thongBaoLoi =
            'Chưa kết nối API tạo thanh toán. Cần tích hợp backend '
            'với cổng thanh toán trước khi sử dụng chức năng này.';
      });
      return;
    }

    setState(() {
      _dangXuLy = true;
      _thongBaoLoi = null;
    });

    try {
      final yeuCau = await widget.onCreatePayment!(
        widget.booking,
        _congThanhToan,
      );

      if (!mounted) return;

      if (yeuCau == null) {
        setState(() {
          _thongBaoLoi = 'Không thể tạo giao dịch. Vui lòng thử lại.';
        });
        return;
      }

      final diaChi = Uri.tryParse(yeuCau.checkoutUrl);

      if (diaChi == null ||
          !diaChi.hasScheme ||
          (diaChi.scheme != 'https' && diaChi.scheme != 'http')) {
        setState(() {
          _thongBaoLoi = 'Đường dẫn thanh toán không hợp lệ.';
        });
        return;
      }

      setState(() {
        _yeuCauThanhToan = yeuCau;
      });

      final daMo = await launchUrl(
        diaChi,
        mode: LaunchMode.externalApplication,
      );

      if (!mounted) return;

      if (!daMo) {
        setState(() {
          _thongBaoLoi = 'Không thể mở trang thanh toán trên thiết bị.';
        });
      }
    } catch (loi) {
      if (!mounted) return;
      setState(() {
        _thongBaoLoi = 'Lỗi tạo giao dịch: $loi';
      });
    } finally {
      if (mounted) {
        setState(() {
          _dangXuLy = false;
        });
      }
    }
  }

  // Xác minh giao dịch với backend; không cho người dùng tự xác nhận.
  Future<void> _kiemTraThanhToan() async {
    if (_dangXuLy || _daThanhToan) return;

    final yeuCau = _yeuCauThanhToan;

    if (yeuCau == null) {
      setState(() {
        _thongBaoLoi = 'Bạn cần tạo giao dịch thanh toán trước.';
      });
      return;
    }

    if (widget.onVerifyPayment == null) {
      setState(() {
        _thongBaoLoi =
            'Chưa cấu hình API xác minh giao dịch. '
            'Ứng dụng không thể tự đánh dấu đã thanh toán.';
      });
      return;
    }

    setState(() {
      _dangXuLy = true;
      _thongBaoLoi = null;
    });

    try {
      final ketQua = await widget.onVerifyPayment!(
        widget.booking,
        yeuCau.transactionId,
      );

      if (!mounted) return;

      if (ketQua == null || !ketQua.isSuccess) {
        setState(() {
          _thongBaoLoi = ketQua?.message.isNotEmpty == true
              ? ketQua!.message
              : 'Giao dịch chưa thành công hoặc chưa được xác minh.';
        });
        return;
      }

      widget.onPaymentUpdate?.call(
        widget.booking,
        paymentStatus: 'Đã thanh toán',
        paymentMethod: _congThanhToan,
        transactionId: ketQua.transactionId,
        paidAt: ketQua.paidAt,
        paymentProof: ketQua.proofReference,
      );

      setState(() {
        _ketQuaXacMinh = ketQua;
        _daThanhToan = true;
        _thongBaoLoi = null;
      });
    } catch (loi) {
      if (!mounted) return;
      setState(() {
        _thongBaoLoi = 'Lỗi xác minh giao dịch: $loi';
      });
    } finally {
      if (mounted) {
        setState(() {
          _dangXuLy = false;
        });
      }
    }
  }

  // Trở về đúng màn hình gốc AppShell, không trở lại Chi tiết sân.
  void _veTrangChu() {
    widget.onPaymentCompleted?.call();

    Navigator.of(context).popUntil(
      (route) => route.isFirst,
    );
  }

  Widget _dongThongTin(String nhan, String giaTri) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          nhan,
          style: TextStyle(
            color: Colors.grey.shade600,
            fontSize: 13,
          ),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            giaTri,
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
            ),
          ),
        ),
      ],
    );
  }

<<<<<<< HEAD
  Widget _buildLegend() {
    Widget item(String label, Color fill, {Color? border}) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              color: fill,
              shape: BoxShape.circle,
              border: Border.all(color: border ?? fill, width: 1.5),
            ),
          ),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 14)),
        ],
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 18,
        runSpacing: 6,
        children: [
          item('Trống', Colors.white, border: Colors.black54),
          item('Đã đặt', _bookedColor),
          item('Khoá', _lockedColor),
          item('Đã chọn', AppTheme.primaryColor),
=======
  Widget _theThongTinDatSan() {
    final datSan = widget.booking;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          _dongThongTin('Mã đặt sân', datSan.id),
          const Divider(height: 24),
          _dongThongTin('Tên sân', datSan.court.name),
          const SizedBox(height: 13),
          _dongThongTin(
            'Ngày chơi',
            '${datSan.date.day.toString().padLeft(2, '0')}/'
                '${datSan.date.month.toString().padLeft(2, '0')}/'
                '${datSan.date.year}',
          ),
          const SizedBox(height: 13),
          _dongThongTin('Giờ bắt đầu', datSan.timeSlot),
          const SizedBox(height: 13),
          _dongThongTin(
            'Thời lượng',
            '${datSan.durationMinutes} phút',
          ),
          const Divider(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Số tiền cần thanh toán',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                formatMoney(datSan.totalPrice),
                style: const TextStyle(
                  color: Color(0xFF16845B),
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
        ],
      ),
    );
  }

<<<<<<< HEAD
  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final error = _error;
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, size: 44, color: Colors.black38),
              const SizedBox(height: 12),
              Text(error, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Thử lại'),
              ),
            ],
          ),
        ),
      );
    }

    final schedule = _schedule;
    if (schedule == null) return const SizedBox.shrink();
    if (schedule.courts.isEmpty) {
      return const Center(child: Text('Cơ sở này chưa có sân đang hoạt động.'));
    }
    return _buildGrid(schedule);
  }

  Widget _buildGrid(VenueSchedule schedule) {
    final starts = _cellStarts(schedule);
    if (starts.isEmpty) {
      return const Center(child: Text('Không có khung giờ phù hợp trong ngày.'));
    }

    return SingleChildScrollView(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Cột tên sân cố định bên trái.
          Column(
            children: [
              _gridBox(width: _nameWidth, height: _headerHeight),
              for (final court in schedule.courts)
                _gridBox(
                  width: _nameWidth,
                  height: _rowHeight,
                  child: Text(
                    court.name,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                  ),
                ),
            ],
          ),
          // Phần giờ cuộn ngang.
          Expanded(
            child: SingleChildScrollView(
              controller: _hScroll,
              scrollDirection: Axis.horizontal,
              child: Column(
                children: [
                  Row(
                    children: [
                      for (final start in starts)
                        _gridBox(
                          width: _cellWidth,
                          height: _headerHeight,
                          child: Text(
                            formatMinutesAsHm(start),
                            style: const TextStyle(fontSize: 14),
                          ),
                        ),
                    ],
                  ),
                  for (final court in schedule.courts)
                    Row(
                      children: [
                        for (final start in starts) _buildCell(schedule, court, start),
                      ],
                    ),
                ],
=======
  Widget _chonCongThanhToan() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 8,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: RadioGroup<String>(
        groupValue: _congThanhToan,
        onChanged: (String? giaTri) {
          if (giaTri == null || _yeuCauThanhToan != null) return;
          setState(() {
            _congThanhToan = giaTri;
          });
        },
        child: Column(
          children: _danhSachCong.map((cong) {
            return RadioListTile<String>(
              value: cong['ma']!,
              contentPadding: EdgeInsets.zero,
              activeColor: const Color(0xFF16845B),
              title: Text(
                cong['ma']!,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                cong['moTa']!,
                style: const TextStyle(fontSize: 12),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _hienThiThongBaoLoi() {
    if (_thongBaoLoi == null) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 15),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: Colors.red.shade700),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              _thongBaoLoi!,
              style: TextStyle(
                color: Colors.red.shade800,
                fontSize: 13,
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
              ),
            ),
          ),
        ],
      ),
    );
  }

<<<<<<< HEAD
  Widget _gridBox({
    required double width,
    required double height,
    Widget? child,
    Color? color,
  }) {
    return Container(
      width: width,
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        border: const Border(
          right: BorderSide(color: _lineColor),
          bottom: BorderSide(color: _lineColor),
        ),
      ),
      child: child,
    );
  }

  Widget _buildCell(VenueSchedule schedule, CourtSchedule court, int start) {
    final state = _cellState(schedule, court, start);
    final Color? color;
    switch (state) {
      case _CellState.booked:
        color = _bookedColor;
      case _CellState.locked:
        color = _lockedColor;
      case _CellState.past:
      case _CellState.noPrice:
        color = _pastColor;
      case _CellState.selected:
        color = AppTheme.primaryColor;
      case _CellState.free:
        color = null;
    }

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _onTapCell(schedule, court, start),
      child: _gridBox(
        width: _cellWidth,
        height: _rowHeight,
        color: color,
        child: state == _CellState.selected
            ? const Icon(Icons.check, color: Colors.white, size: 20)
            : null,
      ),
    );
  }

  Widget _buildBottomBar() {
    final schedule = _schedule;
    final courtId = _selCourt;
    final start = _selStart;
    final end = _selEnd;
    final hasSelection =
        schedule != null && courtId != null && start != null && end != null;

    String? summary;
    if (hasSelection) {
      final court = schedule.courts.firstWhere((item) => item.id == courtId);
      final total = schedule.priceFor(start, end);
      summary =
          '${court.name} · ${formatHourLabel(start)} - ${formatHourLabel(end)} '
          '· ${formatTotalHours(end - start)}'
          '${total == null ? '' : ' · ${formatMoney(total)}'}';
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, -2)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (summary != null) ...[
            Text(
              summary,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
            const SizedBox(height: 10),
          ],
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: hasSelection ? _goConfirm : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryColor,
                foregroundColor: Colors.white,
                disabledBackgroundColor: const Color(0xFFBDBDBD),
                disabledForegroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text(
                'Đặt lịch',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
            ),
          ),
=======
  Widget _bienLaiThanhToan() {
    final ketQua = _ketQuaXacMinh;
    if (ketQua == null) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF8F2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFB9DEC7)),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.check_circle,
            color: Color(0xFF16845B),
            size: 55,
          ),
          const SizedBox(height: 10),
          const Text(
            'THANH TOÁN THÀNH CÔNG',
            style: TextStyle(
              color: Color(0xFF16845B),
              fontSize: 17,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Giao dịch đã được hệ thống xác minh.',
            style: TextStyle(fontSize: 12),
          ),
          const Divider(height: 28),
          _dongThongTin('Mã đặt sân', widget.booking.id),
          const SizedBox(height: 12),
          _dongThongTin('Mã giao dịch', ketQua.transactionId),
          const SizedBox(height: 12),
          _dongThongTin('Cổng thanh toán', _congThanhToan),
          const SizedBox(height: 12),
          _dongThongTin(
            'Thời gian',
            _dinhDangThoiGian(ketQua.paidAt),
          ),
          const SizedBox(height: 12),
          _dongThongTin('Mã biên lai', ketQua.proofReference),
          const Divider(height: 28),
          _dongThongTin(
            'Tổng thanh toán',
            formatMoney(widget.booking.totalPrice),
          ),
          const SizedBox(height: 16),
          const Text(
            'Vui lòng lưu thông tin giao dịch để đối chiếu khi cần.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
        ],
      ),
    );
  }
<<<<<<< HEAD
=======

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),
      appBar: AppBar(
        title: const Text('Thanh toán trực tuyến'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF10583F),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!_daThanhToan)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE9F5EE),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lock_outline, color: Color(0xFF16845B)),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Thanh toán qua cổng thanh toán trực tuyến.',
                          style: TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 20),
              const Text(
                'Thông tin đặt sân',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              _theThongTinDatSan(),

              if (!_daThanhToan) ...[
                const SizedBox(height: 24),
                const Text(
                  'Chọn phương thức thanh toán',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                _chonCongThanhToan(),
                _hienThiThongBaoLoi(),
                const SizedBox(height: 20),

                if (_yeuCauThanhToan == null)
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _dangXuLy ? null : _taoGiaoDich,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16845B),
                        foregroundColor: Colors.white,
                      ),
                      child: _dangXuLy
                          ? const CircularProgressIndicator(
                              color: Colors.white,
                            )
                          : const Text(
                              'Tạo giao dịch và thanh toán',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                    ),
                  )
                else ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'Mã giao dịch: ${_yeuCauThanhToan!.transactionId}\n'
                      'Sau khi thanh toán trên cổng $_congThanhToan, '
                      'hãy quay lại ứng dụng để kiểm tra giao dịch.',
                      style: const TextStyle(fontSize: 13, height: 1.5),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed:
                          _dangXuLy ? null : _kiemTraThanhToan,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16845B),
                        foregroundColor: Colors.white,
                      ),
                      child: _dangXuLy
                          ? const CircularProgressIndicator(
                              color: Colors.white,
                            )
                          : const Text(
                              'Kiểm tra kết quả thanh toán',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ],
              ],

              if (_daThanhToan) ...[
                _bienLaiThanhToan(),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: _veTrangChu,
                    icon: const Icon(Icons.home_outlined),
                    label: const Text(
                      'Hoàn tất – về Trang chủ',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF16845B),
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
}
