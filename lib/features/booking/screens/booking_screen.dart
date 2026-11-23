import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/app_message_box.dart';
import '../data/booking_api.dart';
import '../data/booking_callbacks.dart';
import 'booking_confirm_screen.dart';
import '../../search/widgets/date_picker_sheet.dart';
import '../../../models/booking_cluster_model.dart';
import '../../../models/booking_model.dart';
import '../../../models/court_model.dart';
import '../../../models/schedule_model.dart';

// Giữ nguyên đường import cũ: nơi khác vẫn lấy BookingPaymentUpdate từ file này.
export '../data/booking_callbacks.dart';

enum _CellState { free, booked, locked, past, noPrice, selected }

/// Màn "Đặt lịch ngày": bảng lịch trực quan, mỗi hàng là một sân con, mỗi cột
/// là một khung giờ. Người dùng chạm từng ô để chọn NHIỀU sân / NHIỀU khung giờ
/// trong MỘT ngày (G1.4): các ô liền nhau cùng sân tự gộp thành một cụm (mỗi cụm là
/// một đơn con ở backend, tất cả thanh toán một QR), rồi sang bước xác nhận.
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
  // Nhãn giờ nằm đúng trên đường kẻ giữa 2 cột nên cần chừa mỗi bên nửa nhãn.
  static const double _labelWidth = 48;
  static const double _gutter = _labelWidth / 2;

  static const Color _bookedColor = Color(0xFFE5484D);
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

  /// Ô đã chọn: mã sân → các giờ bắt đầu (phút) của ô, mỗi ô dài `_unit` phút.
  final Map<int, Set<int>> _sel = {};

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

  // Tải lịch

  /// [keepSelection]: sau khi backend báo trùng, giữ lại các ô còn trống để khách chỉ sửa riêng cụm bị trùng.
  Future<void> _load({bool keepSelection = false}) async {
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
        if (keepSelection) {
          _pruneSelection(schedule);
        } else {
          _clearSelection();
        }
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

  // Trạng thái ô

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
    if (_sel[court.id]?.contains(start) ?? false) return _CellState.selected;
    return _baseState(schedule, court, start);
  }

  // Chọn ô

  void _clearSelection() => _sel.clear();

  /// Bỏ các ô không còn trống (vừa bị người khác đặt / chủ sân khóa) sau khi tải lại lịch.
  void _pruneSelection(VenueSchedule schedule) {
    for (final court in schedule.courts) {
      _sel[court.id]?.removeWhere(
        (start) => _baseState(schedule, court, start) != _CellState.free,
      );
    }
    _sel.removeWhere((courtId, starts) =>
        starts.isEmpty || !schedule.courts.any((court) => court.id == courtId));
  }

  /// Gộp các ô đã chọn thành cụm: cùng sân, ô liền nhau (kết thúc ô trước = bắt đầu ô sau). Sắp theo giờ rồi sân.
  List<BookingCluster> _clusters(VenueSchedule schedule) {
    final result = <BookingCluster>[];
    for (final court in schedule.courts) {
      final starts = (_sel[court.id] ?? const <int>{}).toList()..sort();
      int? from;
      int? to;
      for (final start in starts) {
        if (from != null && to == start) {
          to = start + _unit;
          continue;
        }
        if (from != null && to != null) {
          result.add(BookingCluster(
            courtId: court.id,
            courtName: court.name,
            startMinute: from,
            endMinute: to,
          ));
        }
        from = start;
        to = start + _unit;
      }
      if (from != null && to != null) {
        result.add(BookingCluster(
          courtId: court.id,
          courtName: court.name,
          startMinute: from,
          endMinute: to,
        ));
      }
    }
    result.sort((a, b) {
      final byStart = a.startMinute.compareTo(b.startMinute);
      return byStart != 0 ? byStart : a.courtId.compareTo(b.courtId);
    });
    return result;
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

    // Chạm để chọn / bỏ chọn từng ô; không giới hạn số sân hay số khung giờ.
    setState(() {
      final starts = _sel.putIfAbsent(court.id, () => <int>{});
      if (!starts.remove(start)) starts.add(start);
      if (starts.isEmpty) _sel.remove(court.id);
    });
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  // Chọn ngày / khung giờ

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

  // Sang bước xác nhận

  Future<void> _goConfirm() async {
    final schedule = _schedule;
    if (schedule == null) return;
    final clusters = _clusters(schedule);
    if (clusters.isEmpty) return;

    if (!ApiClient.hasToken) {
      _toast('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại để đặt sân.');
      return;
    }
    // Tối thiểu tính theo CỤM sau khi gộp (vd tối thiểu 120': sân 1 11–12 + 12–13 hợp lệ).
    final shortOnes = clusters.where((c) => c.minutes < schedule.minMinutes).toList();
    if (shortOnes.isNotEmpty) {
      final first = shortOnes.first;
      final more = shortOnes.length > 1 ? ' (và ${shortOnes.length - 1} cụm khác)' : '';
      _toast(
        '${first.courtName}, ${formatHourLabel(first.startMinute)} - '
        '${formatHourLabel(first.endMinute)} chỉ ${first.minutes} phút, cơ sở yêu cầu '
        'tối thiểu ${schedule.minMinutes} phút. Vui lòng chọn thêm giờ$more.',
      );
      return;
    }
    var total = 0;
    for (final cluster in clusters) {
      final price = schedule.priceFor(cluster.startMinute, cluster.endMinute);
      if (price == null) {
        _toast('Khung giờ đã chọn chưa có bảng giá.');
        return;
      }
      total += price;
    }

    final conflicts = await Navigator.push<List<ConflictCluster>>(
      context,
      MaterialPageRoute<List<ConflictCluster>>(
        builder: (_) => BookingConfirmScreen(
          court: widget.court,
          schedule: schedule,
          date: _date,
          clusters: clusters,
          totalPrice: total,
          onBooked: widget.onBooked,
          onPaymentUpdate: widget.onPaymentUpdate,
        ),
      ),
    );

    // Quay lại từ bước xác nhận/thanh toán: tải lại lịch cho đúng thực tế.
    // Có cụm bị trùng (409) thì giữ phần còn trống để khách sửa riêng các cụm đó.
    if (!mounted) return;
    final conflictList = conflicts ?? const <ConflictCluster>[];
    await _load(keepSelection: conflictList.isNotEmpty);
    if (!mounted || conflictList.isEmpty) return;
    await _showConflicts(conflictList);
  }

  /// Báo đủ mọi cụm vừa bị đặt/khóa (backend trả `cacCumTrung`); các ô đó đã được bỏ khỏi phần chọn.
  Future<void> _showConflicts(List<ConflictCluster> conflicts) {
    return showInfoBox(
      context,
      title: 'Có khung giờ vừa không còn trống',
      message: 'Các khung giờ sau vừa được đặt hoặc bị khóa. Bạn chọn lại riêng các khung này, '
          'những khung còn trống vẫn được giữ nguyên lựa chọn.',
      kind: MessageKind.warning,
      buttonLabel: 'Chọn lại',
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final item in conflicts)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '• ${item.courtName}, ${formatHourLabel(item.startMinute)} - '
                '${formatHourLabel(item.endMinute)}'
                '${item.reason == 'locked' ? ' (sân bị khóa)' : ' (đã có người đặt)'}',
                style: const TextStyle(fontSize: 14),
              ),
            ),
        ],
      ),
    );
  }

  // Giao diện

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
            _buildRuleNotice(),
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

  /// Quy định của cơ sở: giờ đặt tối thiểu và thời gian đến trễ tối đa
  /// (NGHIEP_VU 4.6: phải hiển thị trước khi khách đặt).
  Widget _buildRuleNotice() {
    final schedule = _schedule;
    if (schedule == null) return const SizedBox.shrink();
    final lateMinutes = schedule.maxLateMinutes;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F8FA),
        border: Border.all(color: _lineColor),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Đặt tối thiểu ${schedule.minMinutes} phút (tính theo cụm các ô liền nhau cùng sân). '
            'Có thể chọn nhiều sân, nhiều khung giờ trong cùng một ngày.',
            style: const TextStyle(fontSize: 13),
          ),
          if (lateMinutes != null)
            Text(
              'Được đến trễ tối đa $lateMinutes phút so với giờ bắt đầu.',
              style: const TextStyle(fontSize: 13),
            ),
        ],
      ),
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

    final totalWidth = starts.length * _cellWidth;
    final endMinute = starts.last + _unit;

    return SingleChildScrollView(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Cột tên sân cố định bên trái.
          Column(
            children: [
              _gridBox(width: _nameWidth, height: _headerHeight, showRight: false),
              for (final court in schedule.courts)
                _gridBox(
                  width: _nameWidth,
                  height: _rowHeight,
                  showRight: false,
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
                  _buildTimeHeader(starts, totalWidth, endMinute),
                  for (final court in schedule.courts)
                    Row(
                      children: [
                        _gutterBox(),
                        for (final start in starts) _buildCell(schedule, court, start),
                        _gutterBox(leftLine: true),
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

  /// Hàng giờ: mỗi nhãn đặt giữa đường kẻ dọc phân cách 2 cột (giờ bắt đầu của
  /// ô bên phải = giờ kết thúc của ô bên trái), kèm vạch nhỏ trên đường kẻ.
  Widget _buildTimeHeader(List<int> starts, double totalWidth, int endMinute) {
    final boundaries = [...starts, endMinute];
    return Container(
      width: totalWidth + _gutter * 2,
      height: _headerHeight,
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: _lineColor)),
      ),
      child: Stack(
        children: [
          for (var i = 0; i < boundaries.length; i++) ...[
            Positioned(
              left: _gutter + i * _cellWidth,
              bottom: 0,
              child: Container(width: 1, height: 8, color: _lineColor),
            ),
            Positioned(
              left: i * _cellWidth,
              width: _labelWidth,
              top: 0,
              bottom: 8,
              child: Center(
                child: Text(
                  formatMinutesAsHm(boundaries[i]),
                  maxLines: 1,
                  style: const TextStyle(fontSize: 14),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Phần đệm hai đầu hàng để đường kẻ đầu/cuối thẳng hàng với nhãn giờ.
  Widget _gutterBox({bool leftLine = false}) {
    return Container(
      width: _gutter,
      height: _rowHeight,
      decoration: BoxDecoration(
        border: Border(
          left: leftLine ? const BorderSide(color: _lineColor) : BorderSide.none,
          bottom: const BorderSide(color: _lineColor),
        ),
      ),
    );
  }

  Widget _gridBox({
    required double width,
    required double height,
    Widget? child,
    Color? color,
    bool showRight = true,
    bool showLeft = false,
  }) {
    return Container(
      width: width,
      height: height,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        border: Border(
          left: showLeft ? const BorderSide(color: _lineColor) : BorderSide.none,
          right: showRight ? const BorderSide(color: _lineColor) : BorderSide.none,
          bottom: const BorderSide(color: _lineColor),
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
        showLeft: true,
        showRight: false,
        child: state == _CellState.selected
            ? const Icon(Icons.check, color: Colors.white, size: 20)
            : null,
      ),
    );
  }

  Widget _buildBottomBar() {
    final schedule = _schedule;
    final clusters = schedule == null ? const <BookingCluster>[] : _clusters(schedule);
    final hasSelection = clusters.isNotEmpty;

    var totalMinutes = 0;
    var total = 0;
    var priceMissing = false;
    if (schedule != null) {
      for (final cluster in clusters) {
        totalMinutes += cluster.minutes;
        final price = schedule.priceFor(cluster.startMinute, cluster.endMinute);
        if (price == null) {
          priceMissing = true;
        } else {
          total += price;
        }
      }
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
          if (hasSelection && schedule != null) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Đã chọn ${clusters.length} cụm · ${formatTotalHours(totalMinutes)}'
                    '${priceMissing ? '' : ' · ${formatMoney(total)}'}',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
                TextButton(
                  onPressed: () => setState(_clearSelection),
                  child: const Text('Bỏ chọn'),
                ),
              ],
            ),
            // Cụm sau gộp: cụm ngắn hơn tối thiểu tô đỏ để khách chọn thêm giờ trước khi đặt.
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 92),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final cluster in clusters)
                      _clusterLine(cluster, tooShort: cluster.minutes < schedule.minMinutes,
                          minMinutes: schedule.minMinutes),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
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

  Widget _clusterLine(
    BookingCluster cluster, {
    required bool tooShort,
    required int minMinutes,
  }) {
    final color = tooShort ? _bookedColor : Colors.black87;
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: Text(
        '${cluster.courtName} · ${formatHourLabel(cluster.startMinute)} - '
        '${formatHourLabel(cluster.endMinute)} · ${cluster.minutes} phút'
        '${tooShort ? ' (cần tối thiểu $minMinutes phút)' : ''}',
        style: TextStyle(fontSize: 13, color: color),
      ),
    );
  }
}
