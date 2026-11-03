import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';

/// Hộp chọn ngày dạng bottom sheet (lịch tuần bắt đầu từ T2).
/// Trả về ngày đã chọn, hoặc null nếu đóng mà không xác nhận.
Future<DateTime?> showDatePickerSheet(
  BuildContext context, {
  DateTime? initial,
}) {
  return showModalBottomSheet<DateTime>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => _DatePickerSheet(initial: initial),
  );
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

class _DatePickerSheet extends StatefulWidget {
  final DateTime? initial;
  const _DatePickerSheet({this.initial});

  @override
  State<_DatePickerSheet> createState() => _DatePickerSheetState();
}

class _DatePickerSheetState extends State<_DatePickerSheet> {
  static const _weekdayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  static const int _maxMonthsAhead = 12;

  late final DateTime today;
  late DateTime selected;
  late DateTime visibleMonth; // luôn là ngày 1 của tháng

  @override
  void initState() {
    super.initState();
    today = _dateOnly(DateTime.now());

    final init = widget.initial == null ? today : _dateOnly(widget.initial!);
    selected = init.isBefore(today) ? today : init;
    visibleMonth = DateTime(selected.year, selected.month);
  }

  bool get canGoPrev => visibleMonth.isAfter(DateTime(today.year, today.month));

  bool get canGoNext => visibleMonth.isBefore(
    DateTime(today.year, today.month + _maxMonthsAhead),
  );

  void _changeMonth(int delta) {
    setState(() {
      visibleMonth = DateTime(visibleMonth.year, visibleMonth.month + delta);
    });
  }

  /// 6 hàng x 7 cột (hoặc 5 hàng nếu đủ), bắt đầu từ thứ hai.
  List<DateTime> get cells {
    final first = visibleMonth;
    final offset = first.weekday - 1; // Thứ hai = 0
    final daysInMonth = DateTime(first.year, first.month + 1, 0).day;
    final rows = ((offset + daysInMonth) / 7).ceil();

    // Dùng constructor DateTime (ngày có thể âm/tràn) để tránh lệch giờ do múi giờ.
    return List.generate(
      rows * 7,
      (i) => DateTime(first.year, first.month, 1 - offset + i),
    );
  }

  @override
  Widget build(BuildContext context) {
    final days = cells;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 18, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildTitle(),
            const SizedBox(height: 20),
            _buildMonthBar(),
            const SizedBox(height: 14),
            Row(
              children: _weekdayLabels
                  .map(
                    (label) => Expanded(
                      child: Center(
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 8),
            for (var row = 0; row < days.length ~/ 7; row++)
              Row(
                children: [
                  for (var col = 0; col < 7; col++)
                    Expanded(child: _buildDayCell(days[row * 7 + col])),
                ],
              ),
            const Divider(height: 28),
            TextButton(
              onPressed: () => setState(() {
                selected = today;
                visibleMonth = DateTime(today.year, today.month);
              }),
              child: const Text(
                'Hôm nay',
                style: TextStyle(fontSize: 18, color: AppTheme.sheetBlue),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton(
                onPressed: () => Navigator.pop(context, selected),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.sheetBlue,
                  shape: const StadiumBorder(),
                ),
                child: const Text(
                  'Xác nhận',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTitle() {
    return Row(
      children: [
        const SizedBox(width: 40),
        const Expanded(
          child: Text(
            'Chọn ngày',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w500),
          ),
        ),
        IconButton(
          tooltip: 'Đóng',
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close, color: AppTheme.sheetBlue),
        ),
      ],
    );
  }

  Widget _buildMonthBar() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        IconButton(
          tooltip: 'Tháng trước',
          onPressed: canGoPrev ? () => _changeMonth(-1) : null,
          icon: const Icon(Icons.chevron_left, size: 30),
        ),
        Text(
          'Tháng ${visibleMonth.month} năm ${visibleMonth.year}',
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
        ),
        IconButton(
          tooltip: 'Tháng sau',
          onPressed: canGoNext ? () => _changeMonth(1) : null,
          icon: const Icon(Icons.chevron_right, size: 30),
        ),
      ],
    );
  }

  Widget _buildDayCell(DateTime day) {
    final inMonth = day.month == visibleMonth.month;
    final isPast = day.isBefore(today);
    final enabled = inMonth && !isPast;
    final isSelected = day == selected && inMonth;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? () => setState(() => selected = day) : null,
      child: Container(
        height: 52,
        margin: const EdgeInsets.all(3),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.sheetBlue : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          '${day.day}',
          style: TextStyle(
            fontSize: isSelected ? 18 : 20,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            color: isSelected
                ? Colors.white
                : enabled
                ? const Color(0xFF1F2328)
                : const Color(0xFFB4B8BE),
          ),
        ),
      ),
    );
  }
}
