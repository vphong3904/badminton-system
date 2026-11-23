import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

/// Hộp chọn giờ dạng bánh xe cuộn (24 giờ). Trả về TimeOfDay hoặc null.
/// Phút chỉ có 00 và 30 vì backend chỉ nhận khung giờ theo mốc 30 phút
/// (chọn phút lẻ sẽ bị từ chối nên không tìm được sân).
Future<TimeOfDay?> showTimePickerSheet(
  BuildContext context, {
  TimeOfDay? initial,
}) {
  return showModalBottomSheet<TimeOfDay>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    // Tắt kéo-để-đóng: cử chỉ vuốt dọc của sheet đang tranh với bánh xe cuộn
    // nên bánh xe bị "đứng", không kéo được. Vẫn đóng bằng nút X / chạm nền.
    enableDrag: false,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _TimePickerSheet(initial: _snapToHalfHour(initial ?? TimeOfDay.now())),
  );
}

/// Làm tròn xuống mốc 30 phút gần nhất (07:13 -> 07:00, 07:45 -> 07:30).
TimeOfDay _snapToHalfHour(TimeOfDay t) =>
    TimeOfDay(hour: t.hour, minute: t.minute >= 30 ? 30 : 0);

class _TimePickerSheet extends StatefulWidget {
  final TimeOfDay initial;
  const _TimePickerSheet({required this.initial});

  @override
  State<_TimePickerSheet> createState() => _TimePickerSheetState();
}

class _TimePickerSheetState extends State<_TimePickerSheet> {
  static const double _itemExtent = 36;
  static const int _minuteStep = 30;

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
    _minuteController = FixedExtentScrollController(
      initialItem: minute ~/ _minuteStep,
    );
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
    required int step,
    required int current,
    required ValueChanged<int> onChanged,
    bool loop = true,
  }) {
    final items = List.generate(count, (i) {
      final value = i * step;
      final isCurrent = value == current;

      return Center(
        child: Text(
          value.toString().padLeft(2, '0'),
          style: TextStyle(
            fontSize: isCurrent ? 22 : 17,
            fontWeight: isCurrent ? FontWeight.w500 : FontWeight.w400,
            color: isCurrent
                ? const Color(0xFF1F2937)
                : const Color(0xFFA9ADB3),
          ),
        ),
      );
    });

    return ListWheelScrollView.useDelegate(
      controller: controller,
      itemExtent: _itemExtent,
      diameterRatio: 4,
      perspective: 0.001,
      physics: const FixedExtentScrollPhysics(),
      onSelectedItemChanged: (index) => onChanged((index % count) * step),
      // loop = false: chỉ hiện 1 lần (vd phút 00, 30), không lặp vòng.
      childDelegate: loop
          ? ListWheelChildLoopingListDelegate(children: items)
          : ListWheelChildListDelegate(children: items),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 8),
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
            ),
            const SizedBox(height: 6),
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
                        width: 24,
                        child: Center(
                          child: Text(
                            ':',
                            style: TextStyle(
                              fontSize: 22,
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
                          step: 1,
                          current: hour,
                          onChanged: (v) => setState(() => hour = v),
                        ),
                      ),
                      const SizedBox(width: 24),
                      Expanded(
                        child: _wheel(
                          controller: _minuteController,
                          count: 60 ~/ _minuteStep,
                          step: _minuteStep,
                          loop: false,
                          current: minute,
                          onChanged: (v) => setState(() => minute = v),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 36,
              child: FilledButton(
                onPressed: () => Navigator.pop(
                  context,
                  TimeOfDay(hour: hour, minute: minute),
                ),
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

  Widget _highlight() => Container(
    height: _itemExtent,
    decoration: BoxDecoration(
      color: AppTheme.mintSoft,
      borderRadius: BorderRadius.circular(8),
    ),
  );
}
