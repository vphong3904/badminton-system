import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

<<<<<<< HEAD
import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/core/network/auth_api.dart';
import 'package:flutter_application_1/models/court_model.dart';
import 'package:flutter_application_1/shared/venue_card.dart';
=======
import 'package:flutter_application_1/models/court_model.dart';
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

// ======================================================
// MODEL TÀI KHOẢN KHÁCH HÀNG DEMO
// ======================================================

class CustomerAccount {
  final String email;
  final String password;
  final String fullName;
  final String phone;

  const CustomerAccount({
    required this.email,
    required this.password,
    required this.fullName,
    required this.phone,
  });
}

// ======================================================
// KẾT QUẢ ĐĂNG NHẬP
// ======================================================

class AuthResult {
  final String email;
  final String fullName;
  final String phone;

  const AuthResult({
    required this.email,
    required this.fullName,
    required this.phone,
  });
}

// ======================================================
// MỞ TRANG ĐĂNG NHẬP / ĐĂNG KÝ
// ======================================================

<<<<<<< HEAD
/// Đăng nhập / đăng ký qua API backend (token lưu trong [ApiClient]).
/// Tham số [accounts] là của bản demo cũ và không còn được dùng.
=======
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
Future<AuthResult?> showAuthPage({
  required BuildContext context,
  required Map<String, CustomerAccount> accounts,
  bool initialRegister = false,
}) {
  return Navigator.of(context).push<AuthResult>(
    MaterialPageRoute<AuthResult>(
      fullscreenDialog: true,
      builder: (_) =>
          _AuthPage(accounts: accounts, initialRegister: initialRegister),
    ),
  );
}

typedef AuthenticateCallback = Future<bool> Function(bool initialRegister);

// ======================================================
// HOME SCREEN
// ======================================================

class HomeScreen extends StatefulWidget {
  final List<Court> courts;

<<<<<<< HEAD
  /// Đang tải danh sách cơ sở từ API.
  final bool loading;

  /// Thông báo lỗi khi tải danh sách thất bại (null nếu không lỗi).
  final String? errorMessage;

  /// Tải lại danh sách (nút "Thử lại" và kéo để làm mới).
  final Future<void> Function() onRefresh;

=======
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
  final VoidCallback onOpenSearch;
  final ValueChanged<Court> onBook;

  final String? loggedInEmail;
  final String? loggedInName;
  final String? loggedInPhone;

  final AuthenticateCallback onAuthenticate;
  final VoidCallback onLogout;

  const HomeScreen({
    super.key,
    required this.courts,
<<<<<<< HEAD
    required this.loading,
    required this.errorMessage,
    required this.onRefresh,
=======
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
    required this.onOpenSearch,
    required this.onBook,
    required this.loggedInEmail,
    required this.loggedInName,
    required this.loggedInPhone,
    required this.onAuthenticate,
    required this.onLogout,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const Color green = Color(0xFF07834D);
  static const Color darkGreen = Color(0xFF075532);
  static const Color gold = Color(0xFFE9B526);

<<<<<<< HEAD
=======
  final Set<String> _favoriteIds = {};
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

  bool get _isLoggedIn =>
      widget.loggedInEmail != null && widget.loggedInEmail!.isNotEmpty;

  bool _isBadminton(Court court) {
    final sport = court.sport.trim().toLowerCase();

    return sport == 'cầu lông' || sport == 'cau long';
  }

  // ======================================================
  // NGÀY HIỆN TẠI
  // ======================================================

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

  // ======================================================
  // ĐỊNH DẠNG GIÁ TIỀN
  // ======================================================
  String _formatMoney(int value) {
    final formatted = value.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );

    return '$formatted\u0111';
  }

  // ======================================================
  // ĐỊNH DẠNG KHOẢNG CÁCH
  // ======================================================

  String _formatDistance(double? meters) {
    if (meters == null) {
      return 'Chưa có thông tin khoảng cách';
    }

    if (meters < 1000) {
      return '${meters.toStringAsFixed(0)} m';
    }

    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  // ======================================================
  // KIỂM TRA ĐĂNG NHẬP
  // ======================================================

  Future<bool> _requireLogin() async {
    if (_isLoggedIn) {
      return true;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Bạn cần đăng nhập hoặc đăng ký để sử dụng chức năng này.',
        ),
      ),
    );

    return widget.onAuthenticate(false);
  }

  // ======================================================
  // XÁC NHẬN ĐĂNG XUẤT
  // ======================================================

  Future<void> _confirmLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Xác nhận đăng xuất'),
          content: const Text('Bạn có chắc chắn muốn đăng xuất?'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Hủy'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext, true);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('Đăng xuất'),
            ),
          ],
        );
      },
    );

    if (confirmed == true && mounted) {
      widget.onLogout();
    }
  }

  // ======================================================
  // THÊM / XÓA YÊU THÍCH
  // ======================================================

<<<<<<< HEAD
=======
  Future<void> _toggleFavorite(Court court) async {
    final allowed = await _requireLogin();

    if (!allowed || !mounted) {
      return;
    }

    setState(() {
      if (_favoriteIds.contains(court.id)) {
        _favoriteIds.remove(court.id);
      } else {
        _favoriteIds.add(court.id);
      }
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _favoriteIds.contains(court.id)
              ? 'Đã thêm sân vào danh sách yêu thích.'
              : 'Đã xóa sân khỏi danh sách yêu thích.',
        ),
      ),
    );
  }
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

  // ======================================================
  // ĐẶT LỊCH SÂN
  // ======================================================

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

  // ======================================================
  // XEM CHI TIẾT SÂN
  // ======================================================

  void _viewCourt(Court court) {
    widget.onBook(court);
  }

  // ======================================================
  // CHIA SẺ THÔNG TIN SÂN
  // ======================================================

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

  // ======================================================
  // BUILD HOME
  // ======================================================

  @override
  Widget build(BuildContext context) {
    final activeCourts = widget.courts.where((court) {
      return court.isActive && _isBadminton(court);
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),
<<<<<<< HEAD
      body: RefreshIndicator(
        onRefresh: widget.onRefresh,
        edgeOffset: 40,
        child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
=======
      body: CustomScrollView(
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
        slivers: [
          SliverToBoxAdapter(child: _buildHeader()),

          SliverToBoxAdapter(child: _buildSearchBar()),

          SliverToBoxAdapter(child: _buildQuickSearch()),

          SliverToBoxAdapter(child: _buildSportBanner()),

          SliverToBoxAdapter(child: _buildSectionTitle(activeCourts.length)),

<<<<<<< HEAD
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
=======
          if (activeCourts.isEmpty)
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
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
<<<<<<< HEAD
                    child: VenueCard(
                      court: court,
                      onOpen: () => widget.onBook(court),
                    ),
=======
                    child: _buildCourtCard(court, index),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
                  );
                }, childCount: activeCourts.length),
              ),
            ),
        ],
      ),
<<<<<<< HEAD
      ),
=======
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
    );
  }

  // ======================================================
  // HEADER
  // ======================================================

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 40, 18, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF168C5C), Color(0xFF087044), Color(0xFF075532)],
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
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _currentDate,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Bạn chưa có thông báo mới.')),
                  );
                },
                icon: const Icon(
                  Icons.notifications_none,
                  color: Colors.white,
                  size: 27,
                ),
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
                      backgroundColor: Colors.white,
                      foregroundColor: darkGreen,
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
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white, width: 1.5),
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
                color: Colors.white.withValues(alpha: 0.15),
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
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          widget.loggedInEmail ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white70,
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
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 13),

          const Text(
            'Tìm sân cầu lông phù hợp – Đặt lịch nhanh chóng!',
            style: TextStyle(color: Colors.white, fontSize: 14),
          ),
        ],
      ),
    );
  }

  // ======================================================
  // THANH TÌM KIẾM
  // ĐÃ BỎ HUY HIỆU QR
  // ======================================================

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
          child: const SizedBox(
            height: 58,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 15),
              child: Row(
                children: [
                  Icon(Icons.search, color: green, size: 28),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Tìm kiếm sân cầu lông...',
                      style: TextStyle(color: Colors.grey, fontSize: 15),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ======================================================
  // TÌM KIẾM NHANH
  // ======================================================

  Widget _buildQuickSearch() {
    const items = ['Sân gần tôi', 'Sân giá tốt'];

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
            onTap: widget.onOpenSearch,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 15),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFDDE9E2),
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

  // ======================================================
  // GIỚI THIỆU SÂN CẦU LÔNG
  // ======================================================

  Widget _buildSportBanner() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 5),
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: const Color(0xFFE4F2E9),
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

  // ======================================================
  // TIÊU ĐỀ DANH SÁCH SÂN
  // ======================================================

  Widget _buildSectionTitle(int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(17, 17, 17, 12),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'Sân cầu lông gần bạn',
              style: TextStyle(
                color: darkGreen,
                fontSize: 19,
                fontWeight: FontWeight.bold,
              ),
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

  // ======================================================
<<<<<<< HEAD
=======
  // THẺ SÂN CẦU LÔNG
  // ======================================================

  Widget _buildCourtCard(Court court, int index) {
    final isFavorite = _favoriteIds.contains(court.id);

    const gradients = [
      [Color(0xFF102F28), Color(0xFF238466)],
      [Color(0xFF14263D), Color(0xFF426B68)],
      [Color(0xFF245448), Color(0xFF76A999)],
    ];

    final colors = gradients[index % gradients.length];

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(15),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.09),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Stack(
            children: [
              Container(
                height: 165,
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: colors,
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Icon(
                      Icons.sports_tennis,
                      color: Colors.white.withValues(alpha: 0.12),
                      size: 130,
                    ),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.sports_tennis,
                          color: Colors.white,
                          size: 42,
                        ),
                        const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 18),
                          child: Text(
                            court.name.toUpperCase(),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              Positioned(
                top: 11,
                left: 11,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.star, color: gold, size: 18),
                      const SizedBox(width: 4),
                      Text(
                        court.rating.toStringAsFixed(1),
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),

              Positioned(
                top: 11,
                right: 11,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF16C98B),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'Sân cầu lông',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ],
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(13, 13, 13, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 55,
                  height: 55,
                  decoration: const BoxDecoration(
                    color: Color(0xFFE5F3EB),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.sports_tennis,
                    color: green,
                    size: 30,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        court.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: darkGreen,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        court.address,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.black87,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          const Icon(Icons.access_time, color: green, size: 15),
                          const SizedBox(width: 4),
                          Text(
                            court.hoursLabel,
                            style: const TextStyle(
                              color: Colors.black87,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on_outlined,
                            color: green,
                            size: 15,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _formatDistance(court.distanceMeters),
                            style: const TextStyle(
                              color: Colors.black54,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${_formatMoney(court.pricePerHour)} / giờ',
                        style: const TextStyle(
                          color: Color(0xFFD49D12),
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 9),
            child: Row(
              children: [
                Expanded(
                  child: _actionButton(
                    icon: isFavorite ? Icons.favorite : Icons.favorite_border,
                    label: 'Yêu thích',
                    color: isFavorite ? Colors.red : green,
                    onTap: () {
                      _toggleFavorite(court);
                    },
                  ),
                ),
                Expanded(
                  child: _actionButton(
                    icon: Icons.visibility_outlined,
                    label: 'Xem sân',
                    color: green,
                    onTap: () {
                      _viewCourt(court);
                    },
                  ),
                ),
                Expanded(
                  child: _actionButton(
                    icon: Icons.calendar_month_outlined,
                    label: 'Đặt lịch',
                    color: const Color(0xFFD39B0C),
                    onTap: () {
                      _bookCourt(court);
                    },
                  ),
                ),
                Expanded(
                  child: _actionButton(
                    icon: Icons.share_outlined,
                    label: 'Chia sẻ',
                    color: green,
                    onTap: () {
                      _shareCourt(court);
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ======================================================
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
  // NÚT CHỨC NĂNG
  // ======================================================

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

// ======================================================
// TRANG ĐĂNG NHẬP / ĐĂNG KÝ
// Cùng nằm trong home_screen.dart
// ======================================================

class _AuthPage extends StatefulWidget {
  final Map<String, CustomerAccount> accounts;
  final bool initialRegister;

  const _AuthPage({required this.accounts, this.initialRegister = false});

  @override
  State<_AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<_AuthPage> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  final TextEditingController _nameController = TextEditingController();

  final TextEditingController _phoneController = TextEditingController();

  final TextEditingController _emailController = TextEditingController();

  final TextEditingController _passwordController = TextEditingController();

  final TextEditingController _confirmController = TextEditingController();

  late bool _isRegister;

  bool _hidePassword = true;
<<<<<<< HEAD
  bool _submitting = false;
=======
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
  String? _errorMessage;

  static const Color green = Color(0xFF07834D);
  static const Color darkGreen = Color(0xFF075532);

  @override
  void initState() {
    super.initState();
    _isRegister = widget.initialRegister;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  // ======================================================
  // CHUYỂN GIỮA TRANG ĐĂNG NHẬP VÀ ĐĂNG KÝ
  // ======================================================

  void _switchPage(bool register) {
    setState(() {
      _isRegister = register;
      _errorMessage = null;

      _passwordController.clear();
      _confirmController.clear();
    });
  }

  // ======================================================
  // XỬ LÝ ĐĂNG KÝ / ĐĂNG NHẬP
  // ======================================================

<<<<<<< HEAD
  Future<void> _submit() async {
    if (_submitting) return;

=======
  void _submit() {
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
    final formState = _formKey.currentState;

    if (formState == null || !formState.validate()) {
      return;
    }

    final email = _emailController.text.trim().toLowerCase();
    final password = _passwordController.text;

<<<<<<< HEAD
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      // Gọi API backend: đăng ký hoặc đăng nhập, nhận token JWT.
      final AuthSession session = _isRegister
          ? await AuthApi.register(
              fullName: _nameController.text,
              phone: _phoneController.text,
              email: email,
              password: password,
            )
          : await AuthApi.login(email, password);

      if (!mounted) return;

      Navigator.of(context).pop(
        AuthResult(
          email: session.email,
          fullName: session.fullName,
          phone: session.phone,
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Không thể xử lý yêu cầu. Vui lòng thử lại.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
=======
    if (_isRegister) {
      if (widget.accounts.containsKey(email)) {
        setState(() {
          _errorMessage = 'Email này đã được đăng ký.';
        });
        return;
      }

      final account = CustomerAccount(
        email: email,
        password: password,
        fullName: _nameController.text.trim(),
        phone: _phoneController.text.trim(),
      );

      widget.accounts[email] = account;

      Navigator.of(context).pop(
        AuthResult(
          email: account.email,
          fullName: account.fullName,
          phone: account.phone,
        ),
      );

      return;
    }

    final account = widget.accounts[email];

    if (account == null || account.password != password) {
      setState(() {
        _errorMessage = 'Email hoặc mật khẩu không chính xác.';
      });
      return;
    }

    Navigator.of(context).pop(
      AuthResult(
        email: account.email,
        fullName: account.fullName,
        phone: account.phone,
      ),
    );
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
  }

  // ======================================================
  // Ô NHẬP LIỆU DÙNG CHUNG
  // ======================================================

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    TextInputType keyboardType = TextInputType.text,
    bool obscureText = false,
    Widget? suffixIcon,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        suffixIcon: suffixIcon,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      validator: validator,
    );
  }

  // ======================================================
  // BUILD AUTH PAGE
  // ======================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),
      appBar: AppBar(
        title: Text(_isRegister ? 'Đăng ký tài khoản' : 'Đăng nhập'),
        backgroundColor: Colors.white,
        foregroundColor: darkGreen,
        elevation: 0,
        centerTitle: true,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(22),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 12),
                const Icon(Icons.sports_tennis, color: green, size: 64),
                const SizedBox(height: 12),
                Text(
                  _isRegister ? 'TẠO TÀI KHOẢN' : 'CHÀO MỪNG TRỞ LẠI',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: darkGreen,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _isRegister
                      ? 'Đăng ký để bắt đầu đặt sân cầu lông.'
                      : 'Đăng nhập để tiếp tục sử dụng dịch vụ.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.black54),
                ),
                const SizedBox(height: 28),

                if (_isRegister) ...[
                  _buildTextField(
                    controller: _nameController,
                    label: 'Họ và tên',
                    icon: Icons.person_outline,
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Vui lòng nhập họ và tên.';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  _buildTextField(
                    controller: _phoneController,
                    label: 'Số điện thoại',
                    icon: Icons.phone_outlined,
                    keyboardType: TextInputType.phone,
                    validator: (value) {
                      final phone = value?.trim() ?? '';

                      if (phone.isEmpty) {
                        return 'Vui lòng nhập số điện thoại.';
                      }

<<<<<<< HEAD
                      if (!AuthApi.isValidPhone(phone)) {
                        return 'Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0).';
=======
                      if (!RegExp(r'^[0-9]{9,11}$').hasMatch(phone)) {
                        return 'Số điện thoại phải có 9–11 chữ số.';
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
                      }

                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                ],

                _buildTextField(
                  controller: _emailController,
                  label: 'Email',
                  icon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                  validator: (value) {
                    final email = value?.trim() ?? '';

                    if (email.isEmpty) {
                      return 'Vui lòng nhập email.';
                    }

                    if (!RegExp(
                      r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                    ).hasMatch(email)) {
                      return 'Email không hợp lệ.';
                    }

                    return null;
                  },
                ),

                const SizedBox(height: 14),

                _buildTextField(
                  controller: _passwordController,
                  label: 'Mật khẩu',
                  icon: Icons.lock_outline,
                  obscureText: _hidePassword,
                  suffixIcon: IconButton(
                    onPressed: () {
                      setState(() {
                        _hidePassword = !_hidePassword;
                      });
                    },
                    icon: Icon(
                      _hidePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.length < 6) {
                      return 'Mật khẩu phải có ít nhất 6 ký tự.';
                    }

                    return null;
                  },
                ),

                if (_isRegister) ...[
                  const SizedBox(height: 14),
                  _buildTextField(
                    controller: _confirmController,
                    label: 'Xác nhận mật khẩu',
                    icon: Icons.lock_reset,
                    obscureText: true,
                    validator: (value) {
                      if (value != _passwordController.text) {
                        return 'Mật khẩu xác nhận không khớp.';
                      }

                      return null;
                    },
                  ),
                ],

                if (_errorMessage != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _errorMessage!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                ],

                const SizedBox(height: 24),

                SizedBox(
                  height: 52,
                  child: ElevatedButton(
<<<<<<< HEAD
                    onPressed: _submitting ? null : _submit,
=======
                    onPressed: _submit,
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
                    style: ElevatedButton.styleFrom(
                      backgroundColor: green,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
<<<<<<< HEAD
                    child: _submitting
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            _isRegister ? 'ĐĂNG KÝ' : 'ĐĂNG NHẬP',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
=======
                    child: Text(
                      _isRegister ? 'ĐĂNG KÝ' : 'ĐĂNG NHẬP',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
                  ),
                ),

                const SizedBox(height: 12),

                TextButton(
                  onPressed: () {
                    _switchPage(!_isRegister);
                  },
                  child: Text(
                    _isRegister
                        ? 'Đã có tài khoản? Đăng nhập'
                        : 'Chưa có tài khoản? Đăng ký',
                    style: const TextStyle(
                      color: green,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
