import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';

const green = Color(0xFF16845B);

class FilterScreen extends StatefulWidget {
  const FilterScreen({super.key});

  @override
  State<FilterScreen> createState() => _FilterScreenState();
}

class _FilterScreenState extends State<FilterScreen> {
  RangeValues price = const RangeValues(20000, 150000);
  String area = 'Tất cả khu vực';
  DateTime date = DateTime.now();
  String time = '18:00';
  int duration = 60;

  void resetFilters() {
    setState(() {
      price = const RangeValues(20000, 150000);
      area = 'Tất cả khu vực';
      date = DateTime.now();
      duration = 60;
      time = '18:00';
    });
  }

  @override
  Widget build(BuildContext context) {
    const areas = [
      'Tất cả khu vực',
      'Quận 1',
      'Quận 3',
      'Bình Thạnh',
      'Thủ Đức',
    ];

    const times = [
      '06:00',
      '08:00',
      '10:00',
      '14:00',
      '16:00',
      '18:00',
      '19:00',
      '20:00',
    ];

    const durations = [60, 90, 120, 150, 180];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Bộ lọc chi tiết'),
        actions: [
          TextButton(onPressed: resetFilters, child: const Text('Đặt lại')),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Khu vực', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: area,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: areas
                .map(
                  (value) => DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  ),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) setState(() => area = value);
            },
          ),
          const SizedBox(height: 20),
          const Text(
            'Ngày đặt sân',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          OutlinedButton.icon(
            onPressed: () async {
              final selectedDate = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 180)),
              );

              if (selectedDate != null && mounted) {
                setState(() => date = selectedDate);
              }
            },
            icon: const Icon(Icons.calendar_month),
            label: Text('${date.day}/${date.month}/${date.year}'),
          ),
          const SizedBox(height: 14),
          const Text(
            'Giờ bắt đầu',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          DropdownButtonFormField<String>(
            initialValue: time,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: times
                .map(
                  (value) => DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  ),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) setState(() => time = value);
            },
          ),
          const SizedBox(height: 14),
          const Text(
            'Thời lượng thuê',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: durations
                .map(
                  (value) => ChoiceChip(
                    label: Text('$value phút'),
                    selected: duration == value,
                    onSelected: (_) {
                      setState(() => duration = value);
                    },
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 14),
          Text(
            'Khoảng giá: ${formatMoney(price.start.round())} – '
            '${formatMoney(price.end.round())} / giờ',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          RangeSlider(
            values: price,
            min: 20000,
            max: 150000,
            divisions: 13,
            onChanged: (value) => setState(() => price = value),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              Navigator.pop(context, {
                'area': area,
                'date': date,
                'time': time,
                'duration': duration,
                'min': price.start,
                'max': price.end,
              });
            },
            child: const Text('Áp dụng bộ lọc'),
          ),
        ],
      ),
    );
  }
}
