import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/data/vn_locations.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/features/search/widgets/date_picker_sheet.dart';
import 'package:flutter_application_1/features/search/widgets/time_picker_sheet.dart';
import 'package:flutter_application_1/models/availability_filter.dart';

/// Bottom sheet "Tìm kiếm lịch trống".
/// Trả về bộ lọc mới khi bấm "Áp dụng" (có thể rỗng nếu đã "Xoá lọc"),
/// hoặc null nếu người dùng đóng sheet.
Future<AvailabilityFilter?> showAvailabilitySheet(
  BuildContext context, {
  AvailabilityFilter initial = const AvailabilityFilter(),
}) {
  return showModalBottomSheet<AvailabilityFilter>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.92,
      child: _AvailabilitySheet(initial: initial),
    ),
  );
}

class _AvailabilitySheet extends StatefulWidget {
  final AvailabilityFilter initial;
  const _AvailabilitySheet({required this.initial});

  @override
  State<_AvailabilitySheet> createState() => _AvailabilitySheetState();
}

class _AvailabilitySheetState extends State<_AvailabilitySheet> {
  DateTime? date;
  TimeOfDay? start;
  TimeOfDay? end;
  String? province;
  String? district;

  @override
  void initState() {
    super.initState();
    date = widget.initial.date;
    start = widget.initial.start;
    end = widget.initial.end;
    province = widget.initial.province;
    district = widget.initial.district;
  }

  String _timeText(TimeOfDay? t) => t == null ? '' : formatHm(t.hour, t.minute);

  Future<void> _pickDate() async {
    final value = await showDatePickerSheet(context, initial: date);
    if (value != null) setState(() => date = value);
  }

  Future<void> _pickStart() async {
    final value = await showTimePickerSheet(context, initial: start);
    if (value != null) setState(() => start = value);
  }

  Future<void> _pickEnd() async {
    final fallback = start == null
        ? null
        : TimeOfDay(hour: (start!.hour + 1) % 24, minute: start!.minute);
    final value = await showTimePickerSheet(context, initial: end ?? fallback);
    if (value != null) setState(() => end = value);
  }

  Future<void> _pickProvince() async {
    final value = await _showOptions(
      title: 'Tỉnh/Thành phố',
      options: vnLocations.keys.toList(),
      selected: province,
    );
    if (value == null) return;

    setState(() {
      final next = value.isEmpty ? null : value;
      if (next != province) district = null; // đổi tỉnh thì bỏ quận cũ
      province = next;
    });
  }

  Future<void> _pickDistrict() async {
    final value = await _showOptions(
      title: 'Quận/Huyện',
      options: vnLocations[province] ?? const [],
      selected: district,
    );
    if (value == null) return;

    setState(() => district = value.isEmpty ? null : value);
  }

  /// Trả về chuỗi rỗng nếu chọn "Tất cả", null nếu đóng mà không chọn.
  Future<String?> _showOptions({
    required String title,
    required List<String> options,
    String? selected,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) => FractionallySizedBox(
        heightFactor: 0.7,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 18, 12, 8),
              child: Row(
                children: [
                  const SizedBox(width: 40),
                  Expanded(
                    child: Text(
                      title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Đóng',
                    onPressed: () => Navigator.pop(sheetContext),
                    icon: const Icon(Icons.close, color: AppTheme.sheetBlue),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                children: [
                  ListTile(
                    title: const Text('Tất cả'),
                    trailing: selected == null
                        ? const Icon(Icons.check, color: AppTheme.sheetBlue)
                        : null,
                    onTap: () => Navigator.pop(sheetContext, ''),
                  ),
                  ...options.map(
                    (option) => ListTile(
                      title: Text(option),
                      trailing: option == selected
                          ? const Icon(Icons.check, color: AppTheme.sheetBlue)
                          : null,
                      onTap: () => Navigator.pop(sheetContext, option),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _clear() {
    setState(() {
      date = null;
      start = null;
      end = null;
      province = null;
      district = null;
    });
  }

  void _apply() {
    if (start != null && end != null) {
      final s = start!.hour * 60 + start!.minute;
      final e = end!.hour * 60 + end!.minute;

      if (e <= s) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Giờ kết thúc phải sau giờ bắt đầu.')),
        );
        return;
      }
    }

    Navigator.pop(
      context,
      AvailabilityFilter(
        date: date,
        start: start,
        end: end,
        province: province,
        district: district,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
      child: Column(
        children: [
          Row(
            children: [
              const SizedBox(width: 48),
              const Expanded(
                child: Text(
                  'Tìm kiếm lịch trống',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w500),
                ),
              ),
              IconButton(
                tooltip: 'Đóng',
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close, size: 30),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Divider(height: 1),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.only(top: 28),
              child: Column(
                children: [
                  _SelectField(
                    placeholder: 'Chọn ngày',
                    value: date == null ? '' : formatDate(date!),
                    onTap: _pickDate,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _SelectField(
                          placeholder: 'Bắt đầu',
                          value: _timeText(start),
                          onTap: _pickStart,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _SelectField(
                          placeholder: 'Kết thúc',
                          value: _timeText(end),
                          onTap: _pickEnd,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _SelectField(
                    placeholder: 'Tỉnh/Thành phố',
                    value: province ?? '',
                    onTap: _pickProvince,
                  ),
                  const SizedBox(height: 16),
                  _SelectField(
                    placeholder: 'Quận/Huyện',
                    value: district ?? '',
                    enabled: province != null,
                    onTap: _pickDistrict,
                  ),
                  if (province == null)
                    const Padding(
                      padding: EdgeInsets.only(top: 8, left: 6),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Chọn Tỉnh/Thành phố trước để chọn Quận/Huyện.',
                          style: TextStyle(
                            color: AppTheme.hintGrey,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16, top: 8),
              child: Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 56,
                      child: FilledButton(
                        onPressed: _clear,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFE8F2FC),
                          foregroundColor: AppTheme.sheetBlue,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: const Text(
                          'Xoá lọc',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: SizedBox(
                      height: 56,
                      child: FilledButton(
                        onPressed: _apply,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppTheme.sheetBlue,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: const Text(
                          'Áp dụng',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Ô chọn giá trị (hiển thị placeholder khi chưa chọn) kèm mũi tên xổ xuống.
class _SelectField extends StatelessWidget {
  final String placeholder;
  final String value;
  final VoidCallback onTap;
  final bool enabled;

  const _SelectField({
    required this.placeholder,
    required this.value,
    required this.onTap,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final hasValue = value.isNotEmpty;

    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: enabled ? onTap : null,
        child: Container(
          height: 58,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppTheme.fieldBorder, width: 1.4),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  hasValue ? value : placeholder,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 17,
                    color: hasValue
                        ? const Color(0xFF1F2328)
                        : AppTheme.hintGrey,
                  ),
                ),
              ),
              const Icon(Icons.keyboard_arrow_down, size: 28),
            ],
          ),
        ),
      ),
    );
  }
}
