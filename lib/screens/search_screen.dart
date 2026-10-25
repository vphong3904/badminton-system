import 'package:flutter/material.dart';

import '../models/court.dart';
import '../widgets/court_card.dart';
import 'extra_screens.dart';

class SearchScreen extends StatefulWidget {
  final List<Court> courts;
  final ValueChanged<Court> onBook;

  const SearchScreen({super.key, required this.courts, required this.onBook});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();

  String keyword = '';
  bool onlyActive = true;
  double maxPrice = 150000;

  // Chuẩn hóa tiếng Việt để tìm kiếm không dấu.
  String normalize(String value) {
    var result = value.toLowerCase().trim();

    const groups = <String, String>{
      'a': 'áàảãạăắằẳẵặâấầẩẫậ',
      'e': 'éèẻẽẹêếềểễệ',
      'i': 'íìỉĩị',
      'o': 'óòỏõọôốồổỗộơớờởỡợ',
      'u': 'úùủũụưứừửữự',
      'y': 'ýỳỷỹỵ',
      'd': 'đ',
    };

    for (final entry in groups.entries) {
      for (final character in entry.value.split('')) {
        result = result.replaceAll(character, entry.key);
      }
    }

    return result;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final normalizedKeyword = normalize(keyword);

    final results = widget.courts.where((court) {
      final name = normalize(court.name);
      final address = normalize(court.address);

      final matchesKeyword =
          normalizedKeyword.isEmpty ||
          name.contains(normalizedKeyword) ||
          address.contains(normalizedKeyword);

      final matchesPrice = court.pricePerHour <= maxPrice;
      final matchesActive = !onlyActive || court.isActive;

      return matchesKeyword && matchesPrice && matchesActive;
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const Text(
          'Tìm sân cầu lông',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text('Tìm theo tên sân, khu vực và ngân sách.'),
        const SizedBox(height: 18),

        // Thanh tìm kiếm có nút xóa.
        TextField(
          controller: _searchController,
          onChanged: (value) {
            setState(() => keyword = value);
          },
          decoration: InputDecoration(
            hintText: 'Nhập tên sân hoặc khu vực',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: keyword.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Xóa từ khóa',
                    icon: const Icon(Icons.close),
                    onPressed: () {
                      _searchController.clear();
                      setState(() => keyword = '');
                    },
                  ),
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
          ),
        ),
        const SizedBox(height: 8),

        OutlinedButton.icon(
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute<void>(builder: (_) => const FilterScreen()),
            );
          },
          icon: const Icon(Icons.tune),
          label: const Text(
            'Bộ lọc chi tiết: khu vực, ngày, giờ, thời lượng, giá',
          ),
        ),

        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Chỉ hiển thị sân đang hoạt động'),
          value: onlyActive,
          onChanged: (value) {
            setState(() => onlyActive = value);
          },
        ),

        Text('Giá tối đa: ${maxPrice.round()} đ/giờ'),
        Slider(
          value: maxPrice,
          min: 50000,
          max: 150000,
          divisions: 10,
          label: '${maxPrice.round()} đ',
          onChanged: (value) {
            setState(() => maxPrice = value);
          },
        ),

        Text(
          '${results.length} sân phù hợp',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 10),

        if (results.isEmpty)
          const Padding(
            padding: EdgeInsets.all(28),
            child: Column(
              children: [
                Icon(Icons.search_off, size: 48, color: Colors.grey),
                SizedBox(height: 10),
                Text(
                  'Không tìm thấy sân phù hợp.',
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: 6),
                Text(
                  'Thử tên sân không dấu, tăng giá tối đa '
                  'hoặc tắt bộ lọc sân đang hoạt động.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ),
          )
        else
          ...results.map(
            (court) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: CourtCard(
                court: court,
                onBook: () => widget.onBook(court),
              ),
            ),
          ),
      ],
    );
  }
}
