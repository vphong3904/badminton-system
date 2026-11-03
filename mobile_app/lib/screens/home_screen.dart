import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:flutter_application_1/models/court_model.dart';

// ======================================================
// KẾT QUẢ ĐĂNG NHẬP
// ======================================================

class AuthResult {
  final String email;

  const AuthResult({required this.email});
}

// ======================================================
// HÀM HIỂN THỊ ĐĂNG NHẬP / ĐĂNG KÝ
// Đặt cùng file với HomeScreen.
// ======================================================

Future<AuthResult?> showAuthBottomSheet({
  required BuildContext context,
  required Map<String, String> accounts,
  bool initialRegister = false,
}) {
  return showModalBottomSheet<AuthResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) {
      return _AuthSheet(accounts: accounts, initialRegister: initialRegister);
    },
  );
}

// ======================================================
// HOME SCREEN
// ======================================================

typedef AuthenticateCallback = Future<bool> Function(bool initialRegister);

class HomeScreen extends StatefulWidget {
  final List<Court> courts;

  final VoidCallback onOpenSearch;
  final ValueChanged<Court> onBook;

  final String? loggedInEmail;
  final AuthenticateCallback onAuthenticate;
  final VoidCallback onLogout;

  const HomeScreen({
    super.key,
    required this.courts,
    required this.onOpenSearch,
    required this.onBook,
    required this.loggedInEmail,
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

  final Set<String> _favoriteIds = {};

  bool get _isLoggedIn => widget.loggedInEmail != null;

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

  // Định dạng giá tiền.
  String _formatMoney(int value) {
    return '${value.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (match) => '${match[1]},')}đ';
  }

  // Định dạng khoảng cách.
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
          'Vui lòng đăng nhập hoặc đăng ký để sử dụng chức năng này.',
        ),
      ),
    );

    return widget.onAuthenticate(false);
  }

  // ======================================================
  // YÊU THÍCH
  // ======================================================

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

  // ======================================================
  // ĐẶT LỊCH
  // ======================================================

  Future<void> _bookCourt(Court court) async {
    final allowed = await _requireLogin();

    if (!allowed || !mounted) {
      return;
    }

    if (!court.isActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sân hiện không hoạt động. Vui lòng chọn sân khác.'),
        ),
      );
      return;
    }

    widget.onBook(court);
  }

  // ======================================================
  // XEM CHI TIẾT SÂN
  // ======================================================

  void _viewCourt(Court court) {
    // Người dùng được xem chi tiết sân mà không cần đăng nhập.
    widget.onBook(court);
  }

  // ======================================================
  // CHIA SẺ THÔNG TIN SÂN
  // ======================================================

  Future<void> _shareCourt(Court court) async {
    final text =
        '${court.name}\n'
        '${court.address}\n'
        'Giá: ${_formatMoney(court.pricePerHour)}/giờ\n'
        'Giờ hoạt động: ${court.hoursLabel}';

    await Clipboard.setData(ClipboardData(text: text));

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Đã sao chép thông tin sân.')));
  }

  // ======================================================
  // BUILD HOME
  // ======================================================

  @override
  Widget build(BuildContext context) {
    // Chỉ hiển thị sân cầu lông đang hoạt động.
    final activeCourts = widget.courts.where((court) {
      return court.isActive && court.sport.trim().toLowerCase() == 'cầu lông';
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: _buildHeader()),

          SliverToBoxAdapter(child: _buildSearchBar()),

          SliverToBoxAdapter(child: _buildQuickSearch()),

          SliverToBoxAdapter(child: _buildSportBanner()),

          SliverToBoxAdapter(child: _buildSectionTitle(activeCourts.length)),

          if (activeCourts.isEmpty)
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
                    child: _buildCourtCard(court, index),
                  );
                }, childCount: activeCourts.length),
              ),
            ),
        ],
      ),
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

          // CHƯA ĐĂNG NHẬP
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
                    child: Text(
                      widget.loggedInEmail!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),

                  TextButton(
                    onPressed: widget.onLogout,
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

                  Icon(Icons.qr_code_scanner, color: green, size: 25),
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
    const items = ['Sân gần tôi', 'Sân giá tốt', 'Đánh giá cao'];

    return SizedBox(
      height: 62,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 13, 16, 5),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) {
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
  // GIỚI THIỆU DANH MỤC SÂN CẦU LÔNG
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
          // ẢNH MINH HỌA SÂN
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

              // ĐÁNH GIÁ
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

              // NHÃN LOẠI SÂN
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

          // THÔNG TIN SÂN
          Padding(
            padding: const EdgeInsets.fromLTRB(13, 13, 13, 10),
            child: Row(
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
                        maxLines: 1,
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

          // BỐN NÚT CHỨC NĂNG
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
// FORM ĐĂNG NHẬP / ĐĂNG KÝ
// Nằm trực tiếp trong home_screen.dart.
// ======================================================

class _AuthSheet extends StatefulWidget {
  final Map<String, String> accounts;
  final bool initialRegister;

  const _AuthSheet({required this.accounts, this.initialRegister = false});

  @override
  State<_AuthSheet> createState() => _AuthSheetState();
}

class _AuthSheetState extends State<_AuthSheet> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  final TextEditingController _emailController = TextEditingController();

  final TextEditingController _passwordController = TextEditingController();

  final TextEditingController _confirmController = TextEditingController();

  late bool _isRegister;

  bool _hidePassword = true;
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
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  // XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ
  void _submit() {
    final formState = _formKey.currentState;

    if (formState == null || !formState.validate()) {
      return;
    }

    final email = _emailController.text.trim().toLowerCase();
    final password = _passwordController.text;

    if (_isRegister) {
      if (widget.accounts.containsKey(email)) {
        setState(() {
          _errorMessage = 'Email này đã được đăng ký.';
        });
        return;
      }

      widget.accounts[email] = password;
    } else {
      final savedPassword = widget.accounts[email];

      if (savedPassword == null || savedPassword != password) {
        setState(() {
          _errorMessage = 'Email hoặc mật khẩu không chính xác.';
        });
        return;
      }
    }

    Navigator.of(context).pop(AuthResult(email: email));
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final screenHeight = MediaQuery.of(context).size.height;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        constraints: BoxConstraints(maxHeight: screenHeight * 0.9),
        padding: const EdgeInsets.fromLTRB(22, 12, 22, 24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 42,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),

                const SizedBox(height: 20),

                const Icon(Icons.sports_tennis, color: green, size: 48),

                const SizedBox(height: 10),

                Text(
                  _isRegister ? 'ĐĂNG KÝ TÀI KHOẢN' : 'ĐĂNG NHẬP',
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.bold,
                    color: darkGreen,
                  ),
                ),

                const SizedBox(height: 8),

                Text(
                  _isRegister
                      ? 'Tạo tài khoản để đặt lịch sân cầu lông.'
                      : 'Đăng nhập để tiếp tục sử dụng dịch vụ.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey, fontSize: 13),
                ),

                const SizedBox(height: 22),

                // EMAIL
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    labelText: 'Email',
                    prefixIcon: const Icon(Icons.email_outlined),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
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

                // MẬT KHẨU
                TextFormField(
                  controller: _passwordController,
                  obscureText: _hidePassword,
                  decoration: InputDecoration(
                    labelText: 'Mật khẩu',
                    prefixIcon: const Icon(Icons.lock_outline),
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
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.length < 6) {
                      return 'Mật khẩu phải có ít nhất 6 ký tự.';
                    }

                    return null;
                  },
                ),

                // XÁC NHẬN MẬT KHẨU
                if (_isRegister) ...[
                  const SizedBox(height: 14),

                  TextFormField(
                    controller: _confirmController,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: 'Xác nhận mật khẩu',
                      prefixIcon: const Icon(Icons.lock_reset),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
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
                    style: const TextStyle(color: Colors.red, fontSize: 12),
                  ),
                ],

                const SizedBox(height: 20),

                // NÚT XÁC NHẬN
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: green,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      _isRegister ? 'ĐĂNG KÝ' : 'ĐĂNG NHẬP',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                // CHUYỂN ĐỔI ĐĂNG NHẬP / ĐĂNG KÝ
                TextButton(
                  onPressed: () {
                    setState(() {
                      _isRegister = !_isRegister;
                      _errorMessage = null;
                      _confirmController.clear();
                    });
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
