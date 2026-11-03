import 'package:flutter/material.dart';

import 'package:flutter_application_1/core/theme/app_theme.dart';
import 'package:flutter_application_1/core/utils/text_utils.dart';
import 'package:flutter_application_1/features/search/widgets/availability_sheet.dart';
import 'package:flutter_application_1/models/availability_filter.dart';
import 'package:flutter_application_1/models/court_model.dart';
import 'package:flutter_application_1/shared/venue_card.dart';

/// Trang Tìm Sân.
/// Chỉ hỗ trợ tìm kiếm sân cầu lông.
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

  AvailabilityFilter availability = const AvailabilityFilter();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ======================================================
  // KIỂM TRA MÔN THỂ THAO
  // ======================================================

  bool _isBadmintonCourt(Court court) {
    final sport = removeDiacritics(court.sport.trim().toLowerCase());

    return sport == 'cau long';
  }

  // ======================================================
  // MỞ BỘ LỌC
  // ======================================================

  Future<void> _openAvailability() async {
    final result = await showAvailabilitySheet(context, initial: availability);

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      availability = result;
    });
  }

  // ======================================================
  // KIỂM TRA KHU VỰC VÀ GIỜ MỞ CỬA
  // ======================================================

  bool _matchesAvailability(Court court) {
    if (availability.province != null &&
        court.province != availability.province) {
      return false;
    }

    if (availability.district != null &&
        court.district != availability.district) {
      return false;
    }

    final start = availability.startMinutes;
    final end = availability.endMinutes;

    if (start != null && end == null) {
      return court.isOpenDuring(start, start);
    }

    if (start == null && end != null) {
      return court.isOpenDuring(court.openMinutes, end);
    }

    if (start != null && end != null) {
      return court.isOpenDuring(start, end);
    }

    // Chưa có backend để kiểm tra lịch đặt sân thực tế.
    return true;
  }

  // ======================================================
  // LỌC DANH SÁCH SÂN
  // ======================================================

  List<Court> _getResults() {
    final normalizedKeyword = removeDiacritics(keyword.trim().toLowerCase());

    return widget.courts.where((court) {
      // Chỉ sân cầu lông.
      if (!_isBadmintonCourt(court)) {
        return false;
      }

      final normalizedName = removeDiacritics(court.name.toLowerCase());

      final normalizedAddress = removeDiacritics(court.address.toLowerCase());

      final matchesKeyword =
          normalizedKeyword.isEmpty ||
          normalizedName.contains(normalizedKeyword) ||
          normalizedAddress.contains(normalizedKeyword);

      final matchesActive = !onlyActive || court.isActive;

      final matchesTime = _matchesAvailability(court);

      return matchesKeyword && matchesActive && matchesTime;
    }).toList();
  }

  // ======================================================
  // XÓA TỪ KHÓA
  // ======================================================

  void _clearSearch() {
    _searchController.clear();

    setState(() {
      keyword = '';
    });
  }

  // ======================================================
  // XÓA BỘ LỌC
  // ======================================================

  void _clearAvailability() {
    setState(() {
      availability = const AvailabilityFilter();
    });
  }

  // ======================================================
  // BUILD
  // ======================================================

  @override
  Widget build(BuildContext context) {
    final results = _getResults();

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        const Text(
          'Tìm Sân',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 5),

        const Text(
          'Tìm sân cầu lông phù hợp với lịch chơi của bạn.',
          style: TextStyle(color: Colors.black54, fontSize: 14),
        ),

        const SizedBox(height: 18),

        // =================================================
        // THANH TÌM KIẾM VÀ NÚT LỌC
        // =================================================
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _searchController,
                textInputAction: TextInputAction.search,
                onChanged: (value) {
                  setState(() {
                    keyword = value;
                  });
                },
                decoration: InputDecoration(
                  hintText: 'Tìm kiếm sân',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: keyword.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Xóa từ khóa',
                          icon: const Icon(Icons.close),
                          onPressed: _clearSearch,
                        ),
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 14,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(13),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(13),
                    borderSide: const BorderSide(color: Color(0xFFE5E8E6)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(13),
                    borderSide: const BorderSide(
                      color: AppTheme.primaryColor,
                      width: 1.5,
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(width: 10),

            // NÚT LỌC SÂN.
            Material(
              color: AppTheme.primaryColor,
              borderRadius: BorderRadius.circular(13),
              child: InkWell(
                borderRadius: BorderRadius.circular(13),
                onTap: _openAvailability,
                child: SizedBox(
                  width: 52,
                  height: 52,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      const Icon(
                        Icons.tune_rounded,
                        color: Colors.white,
                        size: 25,
                      ),
                      if (!availability.isEmpty)
                        Positioned(
                          top: 9,
                          right: 9,
                          child: Container(
                            width: 9,
                            height: 9,
                            decoration: const BoxDecoration(
                              color: Colors.orangeAccent,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),

        // =================================================
        // HIỂN THỊ BỘ LỌC ĐANG ÁP DỤNG
        // =================================================
        if (!availability.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F2FC),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      availability.summary,
                      style: const TextStyle(color: AppTheme.sheetBlue),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Xóa bộ lọc',
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: _clearAvailability,
                  ),
                ],
              ),
            ),
          ),

        const SizedBox(height: 12),

        // =================================================
        // CHỈ HIỂN THỊ SÂN ĐANG HOẠT ĐỘNG
        // =================================================
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Chỉ hiển thị sân đang hoạt động'),
          value: onlyActive,
          onChanged: (value) {
            setState(() {
              onlyActive = value;
            });
          },
        ),

        const SizedBox(height: 8),

        // =================================================
        // TIÊU ĐỀ KẾT QUẢ
        // =================================================
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Danh sách sân cầu lông',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
            Text(
              '${results.length} sân',
              style: const TextStyle(
                color: Colors.black54,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),

        const SizedBox(height: 12),

        // =================================================
        // DANH SÁCH KẾT QUẢ
        // =================================================
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
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                SizedBox(height: 6),
                Text(
                  'Thử nhập tên sân hoặc khu vực khác, '
                  'hoặc xóa bộ lọc đang áp dụng.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ),
          )
        else
          ...results.map(
            (court) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: VenueCard(
                court: court,
                onOpen: () => widget.onBook(court),
              ),
            ),
          ),
      ],
    );
  }
}
