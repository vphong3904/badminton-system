import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../core/utils/location_service.dart';
import '../../../core/utils/text_utils.dart';
import '../../home/data/venue_api.dart';
import '../widgets/availability_sheet.dart';
import '../../../models/availability_filter.dart';
import '../../../models/court_model.dart';
import '../../../shared/venue_tile.dart';

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

  // Chống lọc lại mỗi phím gõ: đợi 300ms sau phím cuối.
  Timer? _debounce;
  // Chuỗi đã bỏ dấu của từng sân, tính 1 lần (key = id sân) thay vì mỗi lần lọc.
  final Map<String, String> _haystack = {};

  String _searchText(Court court) => _haystack.putIfAbsent(
    court.id,
    () => removeDiacritics('${court.name} ${court.address}'.toLowerCase()),
  );

  void _onKeywordChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() => keyword = value);
    });
    // Cập nhật nút xoá (x) ngay mà không lọc lại.
    setState(() {});
  }

  AvailabilityFilter availability = const AvailabilityFilter();

  // KẾT QUẢ TÌM THEO BỘ LỌC (gọi backend `GET /khach/co-so`)
  // Khi có bộ lọc (ngày/giờ, tỉnh/quận, khoảng giá) các tiêu chí được gửi lên cùng lúc
  // và backend kết hợp (AND). Có lọc giá → backend xếp giá rẻ → đắt trước; sau đó
  // có GPS → gần → xa, không có → sao cao → thấp.
  List<Court>? _remote;
  bool _searching = false;
  String? _searchError;
  int _searchSeq = 0; // bỏ kết quả của lần gọi cũ khi người dùng đổi bộ lọc liên tục

  Future<void> _runSearch() async {
    final filter = availability;
    if (filter.isEmpty) {
      _searchSeq++;
      setState(() {
        _remote = null;
        _searching = false;
        _searchError = null;
      });
      return;
    }

    final seq = ++_searchSeq;
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final found = await VenueApi.searchVenues(
        filter,
        location: _gpsOn ? _me : null,
      );
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _remote = found;
        _searching = false;
      });
    } on ApiException catch (error) {
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _remote = null;
        _searching = false;
        _searchError = error.message;
      });
    } catch (_) {
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _remote = null;
        _searching = false;
        _searchError = 'Không tìm được sân. Vui lòng thử lại.';
      });
    }
  }

  // VỊ TRÍ GPS
  // Một nút bật/tắt duy nhất:
  //  - Bật : hiện khoảng cách GPS và xếp sân từ gần tới xa.
  //  - Tắt : không khoảng cách, xếp theo đánh giá sao cao tới thấp.
  // Vị trí được nhớ lại sau lần lấy đầu tiên nên bật/tắt lại không xin quyền nữa.
  UserLocation? _me;
  bool _locating = false;
  bool _gpsOn = false;

  void _showMessage(String text, {SnackBarAction? action}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text), action: action));
  }

  /// Bật/tắt GPS. Chỉ xin quyền + lấy vị trí ở lần bật đầu tiên.
  Future<void> _toggleGps() async {
    if (_locating) return;

    // Tắt, hoặc bật lại khi đã có vị trí: không cần hỏi quyền nữa.
    if (_gpsOn) {
      setState(() => _gpsOn = false);
      _runSearch();
      return;
    }
    if (_me != null) {
      setState(() => _gpsOn = true);
      _runSearch();
      return;
    }

    setState(() => _locating = true);
    try {
      final me = await LocationService.getCurrentLocation();
      if (!mounted) return;
      setState(() {
        _me = me;
        _gpsOn = true;
      });
      _runSearch();
      if (!widget.courts.any((c) => _isBadmintonCourt(c) && c.hasLocation)) {
        _showMessage('Chưa có sân nào cung cấp vị trí để tính khoảng cách.');
      }
    } on LocationException catch (error) {
      _showMessage(
        error.message,
        action: error.openAppSettings
            ? SnackBarAction(
                label: 'Cài đặt',
                onPressed: LocationService.openAppSettings,
              )
            : error.openLocationSettings
            ? SnackBarAction(
                label: 'Bật GPS',
                onPressed: LocationService.openLocationSettings,
              )
            : null,
      );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  // KIỂM TRA MÔN THỂ THAO

  bool _isBadmintonCourt(Court court) {
    final sport = removeDiacritics(court.sport.trim().toLowerCase());

    return sport == 'cau long';
  }

  // MỞ BỘ LỌC

  Future<void> _openAvailability() async {
    final result = await showAvailabilitySheet(context, initial: availability);

    if (!mounted || result == null) {
      return;
    }

    setState(() {
      availability = result;
    });
    _runSearch();
  }

  // LỌC DANH SÁCH SÂN

  List<Court> _getResults() {
    final normalizedKeyword = removeDiacritics(keyword.trim().toLowerCase());

    // Có bộ lọc: nguồn là kết quả backend (đã lọc khu vực/giờ/giá + sắp xếp).
    // Không có bộ lọc: danh sách đã tải sẵn.
    final filtering = !availability.isEmpty;
    final source = filtering ? (_remote ?? const <Court>[]) : widget.courts;

    final list = source.where((court) {
      // Chỉ sân cầu lông.
      if (!_isBadmintonCourt(court)) {
        return false;
      }

      // Luôn ẩn sân ngưng hoạt động (không còn nút bật/tắt).
      if (!court.isActive) {
        return false;
      }

      return normalizedKeyword.isEmpty ||
          _searchText(court).contains(normalizedKeyword);
    }).toList();

    // Đã có bộ lọc: giữ nguyên thứ tự backend (giá rẻ → đắt nếu lọc giá, rồi gần → xa / sao cao → thấp).
    if (filtering) return list;

    final me = _me;
    if (!_gpsOn || me == null) {
      // Không GPS: đánh giá sao cao → thấp (sort ổn định nên hoà giữ thứ tự gốc).
      list.sort((a, b) => b.rating.compareTo(a.rating));
      return list;
    }

    // Có GPS: gắn khoảng cách đường chim bay rồi xếp gần → xa.
    final withDistance = <Court>[];
    final without = <Court>[];
    for (final court in list) {
      if (court.hasLocation) {
        withDistance.add(
          court.copyWith(
            distanceMeters: haversineMeters(
              me.latitude,
              me.longitude,
              court.latitude!,
              court.longitude!,
            ),
          ),
        );
      } else {
        without.add(court);
      }
    }
    withDistance.sort(
      (a, b) => a.distanceMeters!.compareTo(b.distanceMeters!),
    );
    without.sort((a, b) => b.rating.compareTo(a.rating));
    return [...withDistance, ...without];
  }

  // XÓA TỪ KHÓA

  void _clearSearch() {
    _debounce?.cancel();
    _searchController.clear();

    setState(() {
      keyword = '';
    });
  }

  // XÓA BỘ LỌC

  void _clearAvailability() {
    setState(() {
      availability = const AvailabilityFilter();
    });
    _runSearch();
  }

  Widget _gpsChip({
    required IconData icon,
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Material(
      color: selected ? AppTheme.primaryColor : AppTheme.mintSoft,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: _locating ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 16,
                color: selected ? Colors.white : AppTheme.primaryColor,
              ),
              const SizedBox(width: 5),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : AppTheme.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // BUILD

  @override
  Widget build(BuildContext context) {
    final results = _getResults();

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      children: [
        const Text(
          'Tìm Sân',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppTheme.ink,
          ),
        ),

        const SizedBox(height: 10),

        // THANH TÌM KIẾM VÀ NÚT LỌC
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _searchController,
                textInputAction: TextInputAction.search,
                maxLength: 100,
                onChanged: _onKeywordChanged,
                decoration: InputDecoration(
                  isDense: true,
                  counterText: '',
                  hintText: 'Tìm theo tên sân hoặc khu vực',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Xóa từ khóa',
                          icon: const Icon(Icons.close),
                          onPressed: _clearSearch,
                        ),
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 11,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(13),
                    borderSide: BorderSide.none,
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(13),
                    borderSide: const BorderSide(color: AppTheme.fieldBorder),
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
                  width: 44,
                  height: 44,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      const Icon(
                        Icons.tune_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                      if (!availability.isEmpty)
                        Positioned(
                          top: 9,
                          right: 9,
                          child: Container(
                            width: 9,
                            height: 9,
                            decoration: const BoxDecoration(
                              color: Colors.white,
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

        // HIỂN THỊ BỘ LỌC ĐANG ÁP DỤNG
        if (!availability.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 0, 0, 0),
              decoration: BoxDecoration(
                color: AppTheme.mintSoft,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      availability.summary,
                      style: const TextStyle(color: AppTheme.ink, fontSize: 13),
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

        const SizedBox(height: 10),

        // NÚT GPS (bật/tắt): hiện khoảng cách + xếp từ gần tới xa
        Row(
          children: [
            _gpsChip(
              icon: Icons.near_me_rounded,
              label: 'Sân gần tôi',
              selected: _gpsOn,
              onTap: _toggleGps,
            ),
            if (_locating) ...[
              const SizedBox(width: 10),
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ],
          ],
        ),

        const SizedBox(height: 10),

        // TIÊU ĐỀ KẾT QUẢ
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Danh sách sân cầu lông',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
            ),
            Text(
              _searching ? '' : '${results.length} sân',
              style: const TextStyle(
                color: AppTheme.hintGrey,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),

        const SizedBox(height: 8),

        // DANH SÁCH KẾT QUẢ
        if (_searching)
          const Padding(
            padding: EdgeInsets.all(28),
            child: Center(
              child: CircularProgressIndicator(color: AppTheme.primaryColor),
            ),
          )
        else if (_searchError != null)
          Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              children: [
                const Icon(Icons.cloud_off, size: 44, color: AppTheme.hintGrey),
                const SizedBox(height: 10),
                Text(_searchError!, textAlign: TextAlign.center),
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: _runSearch,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.primaryColor,
                  ),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Thử lại'),
                ),
              ],
            ),
          )
        else if (results.isEmpty)
          const Padding(
            padding: EdgeInsets.all(28),
            child: Column(
              children: [
                Icon(Icons.search_off, size: 44, color: AppTheme.hintGrey),
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
                  style: TextStyle(color: AppTheme.hintGrey),
                ),
              ],
            ),
          )
        else
          ...results.map(
            (court) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: VenueTile(
                court: court,
                onOpen: () => widget.onBook(court),
              ),
            ),
          ),
      ],
    );
  }
}
