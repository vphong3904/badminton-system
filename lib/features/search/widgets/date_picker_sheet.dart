import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

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
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildTitle(),
            _buildMonthBar(),
            const SizedBox(height: 2),
            Row(
              children: _weekdayLabels
                  .map(
                    (label) => Expanded(
                      child: Center(
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                            color: AppTheme.hintGrey,
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 4),
            for (var row = 0; row < days.length ~/ 7; row++)
              Row(
                children: [
                  for (var col = 0; col < 7; col++)
                    Expanded(child: _buildDayCell(days[row * 7 + col])),
                ],
              ),
            const Divider(height: 12),
            TextButton(
              style: TextButton.styleFrom(
                visualDensity: VisualDensity.compact,
                minimumSize: const Size(0, 30),
                padding: const EdgeInsets.symmetric(horizontal: 12),
              ),
              onPressed: () => setState(() {
                selected = today;
                visibleMonth = DateTime(today.year, today.month);
              }),
              child: const Text(
                'Hôm nay',
                style: TextStyle(fontSize: 12, color: AppTheme.primaryColor),
              ),
            ),
            const SizedBox(height: 2),
            SizedBox(
              width: double.infinity,
              height: 36,
              child: FilledButton(
                onPressed: () => Navigator.pop(context, selected),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text(
                  'Xác nhận',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
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
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppTheme.ink,
            ),
          ),
        ),
        IconButton(
          tooltip: 'Đóng',
          visualDensity: VisualDensity.compact,
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close, size: 20, color: AppTheme.ink),
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
          visualDensity: VisualDensity.compact,
          onPressed: canGoPrev ? () => _changeMonth(-1) : null,
          icon: const Icon(Icons.chevron_left, size: 20),
        ),
        Text(
          'Tháng ${visibleMonth.month} năm ${visibleMonth.year}',
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
        IconButton(
          tooltip: 'Tháng sau',
          visualDensity: VisualDensity.compact,
          onPressed: canGoNext ? () => _changeMonth(1) : null,
          icon: const Icon(Icons.chevron_right, size: 20),
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
        height: 32,
        margin: const EdgeInsets.all(1.5),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryColor : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          '${day.day}',
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            color: isSelected
                ? Colors.white
                : enabled
                ? const Color(0xFF1F2937)
                : const Color(0xFFB4B8BE),
          ),
        ),
      ),
    );
  }
}
