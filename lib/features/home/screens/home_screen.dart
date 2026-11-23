import 'package:flutter/material.dart';
import '../../../shared/app_message_box.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/geo_utils.dart';
import '../../../core/utils/location_service.dart';

import '../../auth/data/auth_callbacks.dart';
import '../../notifications/data/notification_store.dart';
import '../../../models/court_model.dart';
import '../../../shared/venue_card.dart';

// HOME SCREEN

class HomeScreen extends StatefulWidget {
  final List<Court> courts;

  /// Đang tải danh sách cơ sở từ API.
  final bool loading;

  /// Thông báo lỗi khi tải danh sách thất bại (null nếu không lỗi).
  final String? errorMessage;

  /// Tải lại danh sách (nút "Thử lại" và kéo để làm mới).
  final Future<void> Function() onRefresh;

  final VoidCallback onOpenSearch;
  final ValueChanged<Court> onBook;

  final String? loggedInEmail;
  final String? loggedInName;
  final String? loggedInPhone;

  final AuthenticateCallback onAuthenticate;
  final VoidCallback onLogout;

  /// Bấm chuông: mở màn Thông báo (AppShell yêu cầu đăng nhập nếu cần).
  final VoidCallback onOpenNotifications;

  const HomeScreen({
    super.key,
    required this.courts,
    required this.loading,
    required this.errorMessage,
    required this.onRefresh,
    required this.onOpenSearch,
    required this.onBook,
    required this.loggedInEmail,
    required this.loggedInName,
    required this.loggedInPhone,
    required this.onAuthenticate,
    required this.onLogout,
    required this.onOpenNotifications,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const Color green = Color(0xFF2FA672);
  static const Color darkGreen = Color(0xFF1F2937);
  static const Color gold = Color(0xFF2FA672);


  // SÂN GẦN TÔI (định vị)

  /// Vị trí người dùng sau khi bấm nút định vị; null = chưa bật chế độ "gần tôi".
  UserLocation? _userLocation;
  bool _locating = false;

  bool get _nearbyActive => _userLocation != null;

  /// Gắn khoảng cách (đường chim bay) vào từng sân có toạ độ rồi xếp từ gần tới xa.
  /// Sân chưa có toạ độ xếp cuối, không hiện khoảng cách.
  List<Court> _sortByDistance(List<Court> courts, UserLocation me) {
    final withDistance = <Court>[];
    final without = <Court>[];
    for (final court in courts) {
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
    withDistance.sort((a, b) => a.distanceMeters!.compareTo(b.distanceMeters!));
    return [...withDistance, ...without];
  }

  void _showMessage(String text, {SnackBarAction? action}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text), action: action));
  }

  /// Nút định vị: xin quyền → lấy vị trí → sắp xếp sân theo khoảng cách.
  Future<void> _findNearby() async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      final me = await LocationService.getCurrentLocation();
      if (!mounted) return;

      final badminton = widget.courts
          .where((court) => court.isActive && _isBadminton(court))
          .toList();
      final located = badminton.where((court) => court.hasLocation).length;
      if (located == 0) {
        _showMessage('Chưa có sân nào cung cấp vị trí để tính khoảng cách.');
        return;
      }

      setState(() => _userLocation = me);
      final missing = badminton.length - located;
      _showMessage(
        missing == 0
            ? 'Đã sắp xếp $located sân từ gần tới xa.'
            : 'Đã sắp xếp $located sân từ gần tới xa. $missing sân chưa có vị trí nên xếp cuối.',
      );
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

  void _clearNearby() => setState(() => _userLocation = null);

  bool get _isLoggedIn =>
      widget.loggedInEmail != null && widget.loggedInEmail!.isNotEmpty;

  bool _isBadminton(Court court) {
    final sport = court.sport.trim().toLowerCase();

    return sport == 'cầu lông' || sport == 'cau long';
  }

  // NGÀY HIỆN TẠI

  String get _currentDate {
    final now = DateTime.now();

    const weekdays = [
      'Thứ hai',
      'Thứ ba',
      'Thứ tư',
      'Thứ năm',
      'Thứ sáu',
      'Thứ bảy',
      'Chủ nhật',
    ];

    return '${weekdays[now.weekday - 1]}, '
        '${now.day.toString().padLeft(2, '0')}/'
        '${now.month.toString().padLeft(2, '0')}/'
        '${now.year}';
  }

  // ĐỊNH DẠNG GIÁ TIỀN
  String _formatMoney(int value) {
    final formatted = value.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );

    return '$formatted\u0111';
  }

  // ĐỊNH DẠNG KHOẢNG CÁCH

  String _formatDistance(double? meters) {
    if (meters == null) {
      return 'Chưa có thông tin khoảng cách';
    }

    if (meters < 1000) {
      return '${meters.toStringAsFixed(0)} m';
    }

    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  // KIỂM TRA ĐĂNG NHẬP

  Future<bool> _requireLogin() async {
    if (_isLoggedIn) {
      return true;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Bạn hãy đăng nhập hoặc đăng ký tài khoản để sử dụng chức năng này nhé.',
        ),
      ),
    );

    return widget.onAuthenticate(false);
  }

  // XÁC NHẬN ĐĂNG XUẤT

  Future<void> _confirmLogout() async {
    final confirmed = await showConfirmBox(
      context,
      title: 'Bạn muốn đăng xuất?',
      message: 'Bạn sẽ cần đăng nhập lại để đặt sân và xem lịch đặt của mình.',
      confirmLabel: 'Đăng xuất',
      cancelLabel: 'Ở lại',
      danger: true,
    );

    if (confirmed && mounted) {
      widget.onLogout();
    }
  }

  // THÊM / XÓA YÊU THÍCH


  // ĐẶT LỊCH SÂN

  Future<void> _bookCourt(Court court) async {
    final allowed = await _requireLogin();

    if (!allowed || !mounted) {
      return;
    }

    if (!court.isActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sân hiện không hoạt động.')),
      );
      return;
    }

    widget.onBook(court);
  }

  // XEM CHI TIẾT SÂN

  void _viewCourt(Court court) {
    widget.onBook(court);
  }

  // CHIA SẺ THÔNG TIN SÂN

  Future<void> _shareCourt(Court court) async {
    final information =
        '${court.name}\n'
        '${court.address}\n'
        'Giá: ${_formatMoney(court.pricePerHour)}/giờ\n'
        'Giờ hoạt động: ${court.hoursLabel}';

    await Clipboard.setData(ClipboardData(text: information));

    if (!mounted) return;

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Đã sao chép thông tin sân.')));
  }

  // BUILD HOME

  @override
  Widget build(BuildContext context) {
    var activeCourts = widget.courts.where((court) {
      return court.isActive && _isBadminton(court);
    }).toList();
    final me = _userLocation;
    if (me != null) activeCourts = _sortByDistance(activeCourts, me);

    return Scaffold(
      backgroundColor: const Color(0xFFF1F9F4),
      body: RefreshIndicator(
        onRefresh: widget.onRefresh,
        edgeOffset: 40,
        child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(child: _buildHeader()),

          SliverToBoxAdapter(child: _buildSearchBar()),

          SliverToBoxAdapter(child: _buildQuickSearch()),

          SliverToBoxAdapter(child: _buildSportBanner()),

          SliverToBoxAdapter(child: _buildSectionTitle(activeCourts.length)),

          if (widget.loading && activeCourts.isEmpty)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator(color: green)),
              ),
            )
          else if (widget.errorMessage != null && activeCourts.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(30),
                child: Column(
                  children: [
                    const Icon(Icons.cloud_off, size: 48, color: Colors.grey),
                    const SizedBox(height: 12),
                    Text(
                      widget.errorMessage!,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 14),
                    FilledButton.icon(
                      onPressed: widget.onRefresh,
                      style: FilledButton.styleFrom(backgroundColor: green),
                      icon: const Icon(Icons.refresh),
                      label: const Text('Thử lại'),
                    ),
                  ],
                ),
              ),
            )
          else if (activeCourts.isEmpty)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(30),
                child: Center(
                  child: Text(
                    'Hiện chưa có sân cầu lông đang hoạt động.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 25),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate((context, index) {
                  final court = activeCourts[index];

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 18),
                    child: VenueCard(
                      court: court,
                      onOpen: () => widget.onBook(court),
                    ),
                  );
                }, childCount: activeCourts.length),
              ),
            ),
        ],
      ),
      ),
    );
  }

  // HEADER

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 40, 18, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFDDF1E5), Color(0xFFF1F9F4)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.sports_tennis, color: green, size: 37),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'BADMINTON BOOKING',
                      style: TextStyle(
                        color: AppTheme.ink,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _currentDate,
                      style: const TextStyle(
                        color: AppTheme.hintGrey,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              ListenableBuilder(
                listenable: NotificationStore.instance,
                builder: (context, _) {
                  final unread = _isLoggedIn ? NotificationStore.instance.unread : 0;
                  return IconButton(
                    tooltip: 'Thông báo',
                    onPressed: widget.onOpenNotifications,
                    icon: Badge(
                      isLabelVisible: unread > 0,
                      label: Text(unread > 99 ? '99+' : '$unread'),
                      child: const Icon(
                        Icons.notifications_none,
                        color: AppTheme.ink,
                        size: 27,
                      ),
                    ),
                  );
                },
              ),
            ],
          ),

          const SizedBox(height: 18),

          if (!_isLoggedIn)
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      widget.onAuthenticate(false);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(11),
                      ),
                    ),
                    child: const Text(
                      'ĐĂNG NHẬP',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      widget.onAuthenticate(true);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primaryColor,
                      side: const BorderSide(color: AppTheme.primaryColor, width: 1.5),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(11),
                      ),
                    ),
                    child: const Text(
                      'ĐĂNG KÝ',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: Colors.white,
                    child: Icon(Icons.person, color: green),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.loggedInName?.trim().isNotEmpty == true
                              ? widget.loggedInName!
                              : 'Khách hàng',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppTheme.ink,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          widget.loggedInEmail ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppTheme.hintGrey,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: _confirmLogout,
                    child: const Text(
                      'Đăng xuất',
                      style: TextStyle(color: AppTheme.primaryColor),
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 13),

          const Text(
            'Tìm sân cầu lông phù hợp – Đặt lịch nhanh chóng!',
            style: TextStyle(color: AppTheme.ink, fontSize: 14),
          ),
        ],
      ),
    );
  }

  // THANH TÌM KIẾM
  // ĐÃ BỎ HUY HIỆU QR

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 5),
      child: Material(
        color: Colors.white,
        elevation: 3,
        borderRadius: BorderRadius.circular(15),
        child: InkWell(
          onTap: widget.onOpenSearch,
          borderRadius: BorderRadius.circular(15),
          child: SizedBox(
            height: 58,
            child: Padding(
              padding: const EdgeInsets.only(left: 15, right: 6),
              child: Row(
                children: [
                  const Icon(Icons.search, color: green, size: 28),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Tìm kiếm sân cầu lông...',
                      style: TextStyle(color: Colors.grey, fontSize: 15),
                    ),
                  ),
                  _buildLocateButton(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // NÚT ĐỊNH VỊ: bấm → xin quyền vị trí → xếp sân từ gần tới xa

  Widget _buildLocateButton() {
    return Tooltip(
      message: _nearbyActive ? 'Cập nhật lại vị trí' : 'Tìm sân gần tôi',
      child: Material(
        color: _nearbyActive ? green : const Color(0xFFDDF1E5),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: _locating ? null : _findNearby,
          child: SizedBox(
            width: 46,
            height: 46,
            child: Center(
              child: _locating
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: green,
                      ),
                    )
                  : Icon(
                      Icons.my_location,
                      color: _nearbyActive ? Colors.white : green,
                      size: 24,
                    ),
            ),
          ),
        ),
      ),
    );
  }

  // TÌM KIẾM NHANH

  Widget _buildQuickSearch() {
    const items = ['Sân gần tôi'];

    return SizedBox(
      height: 62,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 13, 16, 5),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, index) {
          return const SizedBox(width: 9);
        },
        itemBuilder: (context, index) {
          return InkWell(
            onTap: () {
              _findNearby(); // "Sân gần tôi" = cùng chức năng nút định vị
            },
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 15),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFDDF1E5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                items[index],
                style: const TextStyle(
                  color: darkGreen,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // GIỚI THIỆU SÂN CẦU LÔNG

  Widget _buildSportBanner() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 5),
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: const Color(0xFFDDF1E5),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Row(
          children: [
            CircleAvatar(
              radius: 25,
              backgroundColor: Colors.white,
              child: Icon(Icons.sports_tennis, size: 30, color: green),
            ),
            SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'SÂN CẦU LÔNG',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                      color: darkGreen,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Tìm kiếm và đặt lịch sân cầu lông trực tuyến.',
                    style: TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios, size: 16, color: green),
          ],
        ),
      ),
    );
  }

  // TIÊU ĐỀ DANH SÁCH SÂN

  Widget _buildSectionTitle(int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(17, 17, 17, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Sân cầu lông gần bạn',
                  style: TextStyle(
                    color: darkGreen,
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (_nearbyActive)
                  GestureDetector(
                    onTap: _clearNearby,
                    child: const Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text(
                        'Từ gần tới xa (đường chim bay) · Bấm để tắt',
                        style: TextStyle(color: Colors.black54, fontSize: 11.5),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Text(
            '$count sân',
            style: const TextStyle(color: green, fontWeight: FontWeight.w600),
          ),
          const SizedBox(width: 5),
          TextButton(
            onPressed: widget.onOpenSearch,
            child: const Text('Xem tất cả', style: TextStyle(color: green)),
          ),
        ],
      ),
    );
  }

  // NÚT CHỨC NĂNG

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 5),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
