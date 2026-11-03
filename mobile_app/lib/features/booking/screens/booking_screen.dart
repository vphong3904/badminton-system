import 'package:flutter/material.dart';

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
class BookingScreen extends StatefulWidget {
  final Court court;
  final ValueChanged<Booking> onBooked;
  final BookingPaymentUpdate? onPaymentUpdate;

  const BookingScreen({
    super.key,
    required this.court,
    required this.onBooked,
    this.onPaymentUpdate,
  });

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
        ),
      ),
    );
  }

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
            ),
          ),
        ),
      ],
    );
  }

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
        ],
      ),
    );
  }

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
              ),
            ),
          ),
        ],
      ),
    );
  }

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
        ],
      ),
    );
  }
}
