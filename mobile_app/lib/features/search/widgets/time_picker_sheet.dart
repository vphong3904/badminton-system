import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';

/// Hộp chọn giờ dạng bánh xe cuộn (24 giờ). Trả về TimeOfDay hoặc null.
Future<TimeOfDay?> showTimePickerSheet(
  BuildContext context, {
  TimeOfDay? initial,
}) {
  return showModalBottomSheet<TimeOfDay>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => _TimePickerSheet(initial: initial ?? TimeOfDay.now()),
  );
}

class _TimePickerSheet extends StatefulWidget {
  final TimeOfDay initial;
  const _TimePickerSheet({required this.initial});

  @override
  State<_TimePickerSheet> createState() => _TimePickerSheetState();
}

class _TimePickerSheetState extends State<_TimePickerSheet> {
  static const double _itemExtent = 68;

  late final FixedExtentScrollController _hourController;
  late final FixedExtentScrollController _minuteController;
  late int hour;
  late int minute;

  @override
  void initState() {
    super.initState();
    hour = widget.initial.hour;
    minute = widget.initial.minute;
    _hourController = FixedExtentScrollController(initialItem: hour);
    _minuteController = FixedExtentScrollController(initialItem: minute);
  }

  @override
  void dispose() {
    _hourController.dispose();
    _minuteController.dispose();
    super.dispose();
  }

  Widget _wheel({
    required FixedExtentScrollController controller,
    required int count,
    required int current,
    required ValueChanged<int> onChanged,
  }) {
    return ListWheelScrollView.useDelegate(
      controller: controller,
      itemExtent: _itemExtent,
      diameterRatio: 4,
      perspective: 0.001,
      physics: const FixedExtentScrollPhysics(),
      onSelectedItemChanged: (index) => onChanged(index % count),
      childDelegate: ListWheelChildLoopingListDelegate(
        children: List.generate(count, (i) {
          final isCurrent = i == current;

          return Center(
            child: Text(
              i.toString().padLeft(2, '0'),
              style: TextStyle(
                fontSize: isCurrent ? 46 : 38,
                fontWeight: isCurrent ? FontWeight.w500 : FontWeight.w400,
                color: isCurrent
                    ? const Color(0xFF1F2328)
                    : const Color(0xFFA9ADB3),
              ),
            ),
          );
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 18, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const SizedBox(width: 40),
                const Expanded(
                  child: Text(
                    'Chọn thời gian',
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
            ),
            const SizedBox(height: 24),
            SizedBox(
              height: _itemExtent * 3,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Dải nền làm nổi bật giá trị đang chọn.
                  Row(
                    children: [
                      Expanded(child: _highlight()),
                      const SizedBox(
                        width: 48,
                        child: Center(
                          child: Text(
                            ':',
                            style: TextStyle(
                              fontSize: 46,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                      Expanded(child: _highlight()),
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: _wheel(
                          controller: _hourController,
                          count: 24,
                          current: hour,
                          onChanged: (v) => setState(() => hour = v),
                        ),
                      ),
                      const SizedBox(width: 48),
                      Expanded(
                        child: _wheel(
                          controller: _minuteController,
                          count: 60,
                          current: minute,
                          onChanged: (v) => setState(() => minute = v),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton(
                onPressed: () => Navigator.pop(
                  context,
                  TimeOfDay(hour: hour, minute: minute),
                ),
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

  Widget _highlight() => Container(
    height: _itemExtent,
    decoration: BoxDecoration(
      color: const Color(0xFFEFEFEF),
      borderRadius: BorderRadius.circular(14),
    ),
  );
}
