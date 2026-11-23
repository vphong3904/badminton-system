import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/data/vn_locations.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import 'date_picker_sheet.dart';
import 'time_picker_sheet.dart';
import '../../../models/availability_filter.dart';

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
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _AvailabilitySheet(initial: initial),
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

  /// Lỗi hiển thị ngay dưới từng ô (null = hợp lệ). Ô lỗi viền đỏ.
  String? _dateError;
  String? _startError;
  String? _endError;

  /// Khoảng giá/giờ (VNĐ). Phải nhập cả hai ô mới được tìm theo giá.
  final _minPriceCtl = TextEditingController();
  final _maxPriceCtl = TextEditingController();

  @override
  void dispose() {
    _minPriceCtl.dispose();
    _maxPriceCtl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _minPriceCtl.text = widget.initial.minPrice?.toString() ?? '';
    _maxPriceCtl.text = widget.initial.maxPrice?.toString() ?? '';
    date = widget.initial.date;
    start = widget.initial.start;
    end = widget.initial.end;
    province = widget.initial.province;
    district = widget.initial.district;
  }

  String _timeText(TimeOfDay? t) => t == null ? '' : formatHm(t.hour, t.minute);

  Future<void> _pickDate() async {
    final value = await showDatePickerSheet(context, initial: date);
    if (value != null) {
      setState(() {
        date = value;
        _dateError = null;
      });
    }
  }

  Future<void> _pickStart() async {
    final value = await showTimePickerSheet(context, initial: start);
    if (value != null) {
      setState(() {
        start = value;
        _startError = null;
        _endError = null; // đổi giờ bắt đầu thì kiểm tra lại giờ kết thúc
      });
    }
  }

  Future<void> _pickEnd() async {
    final fallback = start == null
        ? null
        : TimeOfDay(hour: (start!.hour + 1) % 24, minute: start!.minute);
    final value = await showTimePickerSheet(context, initial: end ?? fallback);
    if (value != null) {
      setState(() {
        end = value;
        _endError = null;
      });
    }
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
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => FractionallySizedBox(
        heightFactor: 0.45,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 8, 2),
              child: Row(
                children: [
                  const SizedBox(width: 40),
                  Expanded(
                    child: Text(
                      title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.ink,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Đóng',
                    visualDensity: VisualDensity.compact,
                    onPressed: () => Navigator.pop(sheetContext),
                    icon: const Icon(
                      Icons.close,
                      size: 20,
                      color: AppTheme.ink,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                children: [
                  ListTile(
                    dense: true,
                    title: const Text('Tất cả', style: TextStyle(fontSize: 13)),
                    trailing: selected == null
                        ? const Icon(
                            Icons.check,
                            size: 20,
                            color: AppTheme.primaryColor,
                          )
                        : null,
                    onTap: () => Navigator.pop(sheetContext, ''),
                  ),
                  ...options.map(
                    (option) => ListTile(
                      dense: true,
                      title: Text(option, style: const TextStyle(fontSize: 13)),
                      trailing: option == selected
                          ? const Icon(
                              Icons.check,
                              size: 20,
                              color: AppTheme.primaryColor,
                            )
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
      _dateError = null;
      _startError = null;
      _endError = null;
      _minPriceCtl.clear();
      _maxPriceCtl.clear();
    });
  }

  void _warn(String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  void _apply() {
    // Ngày + giờ bắt đầu + giờ kết thúc đi chung: chọn 1 thì phải chọn đủ 3.
    // Ô nào thiếu thì viền đỏ + báo ngay dưới ô đó (báo hết các ô thiếu một lượt).
    final picked = [date != null, start != null, end != null];
    final partial = picked.any((p) => p) && !picked.every((p) => p);
    String? endOrderError;
    if (!partial && start != null && end != null) {
      final s = start!.hour * 60 + start!.minute;
      final e = end!.hour * 60 + end!.minute;
      if (e <= s) {
        endOrderError = 'Giờ kết thúc cần sau giờ bắt đầu';
      }
    }

    setState(() {
      _dateError = partial && date == null ? 'Vui lòng chọn ngày' : null;
      _startError = partial && start == null ? 'Vui lòng chọn giờ bắt đầu' : null;
      _endError = partial && end == null
          ? 'Vui lòng chọn giờ kết thúc'
          : endOrderError;
    });
    if (partial || endOrderError != null) return;

    // Khoảng giá: nhập đủ tối thiểu + tối đa, tối đa >= tối thiểu.
    final minText = _minPriceCtl.text.trim();
    final maxText = _maxPriceCtl.text.trim();
    int? minPrice;
    int? maxPrice;
    if (minText.isNotEmpty || maxText.isNotEmpty) {
      if (minText.isEmpty) return _warn('Bạn nhập thêm giá tối thiểu nhé.');
      if (maxText.isEmpty) return _warn('Bạn nhập thêm giá tối đa nhé.');
      minPrice = int.tryParse(minText);
      maxPrice = int.tryParse(maxText);
      if (minPrice == null || maxPrice == null) {
        return _warn('Giá chỉ gồm chữ số.');
      }
      if (maxPrice < minPrice) {
        return _warn('Giá tối đa cần lớn hơn hoặc bằng giá tối thiểu.');
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
        minPrice: minPrice,
        maxPrice: maxPrice,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Đẩy sheet lên trên bàn phím (nhập giá) và chỉ cho phần giữa cuộn,
    // header + 2 nút luôn nằm gọn → không tràn đáy.
    return AnimatedPadding(
      duration: const Duration(milliseconds: 150),
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              const SizedBox(width: 40),
              const Expanded(
                child: Text(
                  'Tìm kiếm lịch trống',
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
          const Divider(height: 1),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.only(top: 10),
              child: Column(
                children: [
                  _SelectField(
                    placeholder: 'Chọn ngày',
                    value: date == null ? '' : formatDate(date!),
                    errorText: _dateError,
                    onTap: _pickDate,
                  ),
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _SelectField(
                          placeholder: 'Bắt đầu',
                          value: _timeText(start),
                          errorText: _startError,
                          onTap: _pickStart,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: _SelectField(
                          placeholder: 'Kết thúc',
                          value: _timeText(end),
                          errorText: _endError,
                          onTap: _pickEnd,
                        ),
                      ),
                    ],
                  ),
                  const Padding(
                    padding: EdgeInsets.only(top: 4, left: 4),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Ngày, giờ bắt đầu và giờ kết thúc cần chọn cùng nhau.',
                        style: TextStyle(color: AppTheme.hintGrey, fontSize: 11),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  _SelectField(
                    placeholder: 'Tỉnh/Thành phố',
                    value: province ?? '',
                    onTap: _pickProvince,
                  ),
                  const SizedBox(height: 6),
                  _SelectField(
                    placeholder: 'Quận/Huyện',
                    value: district ?? '',
                    enabled: province != null,
                    onTap: _pickDistrict,
                  ),
                  if (province == null)
                    const Padding(
                      padding: EdgeInsets.only(top: 6, left: 4),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Chọn Tỉnh/Thành phố trước để chọn Quận/Huyện.',
                          style: TextStyle(
                            color: AppTheme.hintGrey,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _PriceField(
                          controller: _minPriceCtl,
                          placeholder: 'Giá tối thiểu (đ/giờ)',
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: _PriceField(
                          controller: _maxPriceCtl,
                          placeholder: 'Giá tối đa (đ/giờ)',
                        ),
                      ),
                    ],
                  ),
                  const Padding(
                    padding: EdgeInsets.only(top: 4, left: 4, bottom: 4),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Nhập cả giá tối thiểu và tối đa để lọc theo khoảng giá.',
                        style: TextStyle(color: AppTheme.hintGrey, fontSize: 11),
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
              padding: const EdgeInsets.only(bottom: 8, top: 8),
              child: Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 34,
                      child: FilledButton(
                        onPressed: _clear,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppTheme.mintSoft,
                          foregroundColor: AppTheme.primaryColor,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text(
                          'Xoá lọc',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: SizedBox(
                      height: 34,
                      child: FilledButton(
                        onPressed: _apply,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text(
                          'Áp dụng',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
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
      ),
    );
  }
}

/// Ô chọn giá trị (hiển thị placeholder khi chưa chọn) kèm mũi tên xổ xuống.
/// Có [errorText] thì viền đỏ và hiện dòng báo lỗi ngay dưới ô.
class _SelectField extends StatelessWidget {
  final String placeholder;
  final String value;
  final VoidCallback onTap;
  final bool enabled;
  final String? errorText;

  const _SelectField({
    required this.placeholder,
    required this.value,
    required this.onTap,
    this.enabled = true,
    this.errorText,
  });

  @override
  Widget build(BuildContext context) {
    final hasValue = value.isNotEmpty;
    final hasError = errorText != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Opacity(
          opacity: enabled ? 1 : 0.5,
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: enabled ? onTap : null,
            child: Container(
              height: 34,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                color: hasError ? AppTheme.dangerSoft : null,
                border: Border.all(
                  color: hasError ? AppTheme.danger : AppTheme.fieldBorder,
                  width: hasError ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      hasValue ? value : placeholder,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: hasValue ? AppTheme.ink : AppTheme.hintGrey,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.keyboard_arrow_down,
                    size: 18,
                    color: hasError ? AppTheme.danger : AppTheme.hintGrey,
                  ),
                ],
              ),
            ),
          ),
        ),
        if (hasError)
          Padding(
            padding: const EdgeInsets.only(top: 3, left: 4),
            child: Text(
              errorText!,
              style: const TextStyle(
                color: AppTheme.danger,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}

/// Ô nhập giá (chỉ chữ số).
class _PriceField extends StatelessWidget {
  final TextEditingController controller;
  final String placeholder;

  const _PriceField({required this.controller, required this.placeholder});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 34,
      child: TextField(
        controller: controller,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(9),
        ],
        style: const TextStyle(fontSize: 12, color: AppTheme.ink),
        decoration: InputDecoration(
          hintText: placeholder,
          hintStyle: const TextStyle(fontSize: 12, color: AppTheme.hintGrey),
          contentPadding: const EdgeInsets.symmetric(horizontal: 10),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppTheme.fieldBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppTheme.primaryColor),
          ),
        ),
      ),
    );
  }
}
