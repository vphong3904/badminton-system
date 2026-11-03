import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// ======================================================
// THEME
// ======================================================

import 'package:flutter_application_1/core/network/auth_api.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';

// ======================================================
// MODELS
// ======================================================

import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/models/court_model.dart';

// ======================================================
// HOME
// ======================================================

import 'package:flutter_application_1/core/network/api_client.dart';
import 'package:flutter_application_1/features/home/data/venue_api.dart';
import 'package:flutter_application_1/features/home/screens/home_screen.dart';

// ======================================================
// BOOKING
// ======================================================

import 'package:flutter_application_1/features/booking/data/booking_api.dart';
import 'package:flutter_application_1/features/favorites/favorites_store.dart';
import 'package:flutter_application_1/features/booking/screens/booking_screen.dart';

// ======================================================
// SEARCH
// ======================================================

import 'package:flutter_application_1/features/search/screens/search_screen.dart';

// ======================================================
// HISTORY
// ======================================================

import 'package:flutter_application_1/features/history/screens/booking_history_screen.dart';

// ======================================================
// PROFILE
// ======================================================

import 'package:flutter_application_1/features/profile/screens/profile_screen.dart';

// ======================================================
// OWNER / ADMIN
// ======================================================

import 'package:flutter_application_1/features/owner/screens/role_dashboard_screen.dart';

// ======================================================
// COURT DETAIL
// ======================================================

import 'package:flutter_application_1/features/court/screens/court_detail_screen.dart';

// ======================================================
// BOTTOM NAVIGATION
// ======================================================

import 'package:flutter_application_1/shared/app_bottom_bar.dart';

// ======================================================
// MAIN
// ======================================================

import 'package:flutter_application_1/core/theme/app_theme.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/models/court_model.dart';
import 'package:flutter_application_1/features/home/data/sample_data.dart';

import 'package:flutter_application_1/features/home/screens/home_screen.dart';
import 'package:flutter_application_1/features/search/screens/search_screen.dart';
import 'package:flutter_application_1/features/booking/screens/booking_screen.dart';
import 'package:flutter_application_1/features/history/screens/booking_history_screen.dart';
import 'package:flutter_application_1/features/profile/screens/profile_screen.dart';
import 'package:flutter_application_1/features/court/screens/court_detail_screen.dart';
import 'package:flutter_application_1/features/owner/screens/role_dashboard_screen.dart';

import 'package:flutter_application_1/shared/app_bottom_bar.dart';

// ============================================================
// KHỞI ĐỘNG ỨNG DỤNG
// ============================================================

void main() {
  WidgetsFlutterBinding.ensureInitialized();
<<<<<<< HEAD

  runApp(const BadmintonApp());
}

// ======================================================
// BADMINTON APP
// ======================================================

=======
  runApp(const BadmintonApp());
}

>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
class BadmintonApp extends StatelessWidget {
  const BadmintonApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Badminton Booking',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const AppShell(),
    );
  }
}

<<<<<<< HEAD
// ======================================================
// APP SHELL
// QUẢN LÝ DỮ LIỆU VÀ ĐIỀU HƯỚNG TOÀN ỨNG DỤNG
// ======================================================
=======
// ============================================================
// ĐIỀU HƯỚNG CHÍNH CỦA ỨNG DỤNG
// ============================================================
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
<<<<<<< HEAD
  // ====================================================
  // 1. VAI TRÒ NGƯỜI DÙNG
  // ====================================================

  String role = 'Khách hàng';

  bool get isCustomer => role == 'Khách hàng';

  // ====================================================
  // 2. TAB HIỆN TẠI
  // ====================================================

  int tab = 0;

  // Các tab khách hàng:
  // 0: Trang chủ
  // 1: Tìm kiếm
  // 2: Lịch đặt
  // 3: Tài khoản

  // ====================================================
  // 3. DỮ LIỆU SÂN VÀ LỊCH ĐẶT
  // ====================================================

  // Danh sách cơ sở tải từ backend (Court.id = maCoSo).
  List<Court> courts = <Court>[];

  bool loadingCourts = true;

  String? courtsError;

  late List<Booking> bookings;

  // ====================================================
  // 4. TÀI KHOẢN KHÁCH HÀNG DEMO
  // ====================================================

  final Map<String, CustomerAccount> demoAccounts = {};

  String? loggedInEmail;

  String? loggedInName;

  String? loggedInPhone;

  bool get isLoggedIn => loggedInEmail != null && loggedInEmail!.isNotEmpty;

  // ====================================================
  // 5. KHỞI TẠO ỨNG DỤNG
  // ====================================================

  @override
  void initState() {
    super.initState();

    // Khởi tạo danh sách lịch đặt trống.
    bookings = <Booking>[];

    // Khi bấm tim lúc chưa đăng nhập thì mở màn đăng nhập.
    FavoritesStore.instance.ensureLogin = () => authenticate(false);

    // Tải danh sách cơ sở từ API.
    loadCourts();
  }

  // ====================================================
  // TẢI DANH SÁCH CƠ SỞ TỪ API
  // ====================================================

  Future<void> loadCourts() async {
    setState(() {
      loadingCourts = true;
      courtsError = null;
    });

    try {
      final venues = await VenueApi.fetchVenues();

      if (!mounted) return;

      setState(() {
        courts = venues;
        loadingCourts = false;
      });

      _printInitialData();
    } on ApiException catch (error) {
      if (!mounted) return;

      setState(() {
        loadingCourts = false;
        courtsError = error.message;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        loadingCourts = false;
        courtsError = 'Không tải được danh sách sân. Vui lòng thử lại.';
      });
    }
  }

  // ====================================================
  // HIỂN THỊ DỮ LIỆU TRÊN TERMINAL
  // ====================================================

  void _printInitialData() {
    debugPrint('======================================');
    debugPrint('BADMINTON BOOKING');
    debugPrint('KHỞI TẠO DỮ LIỆU');
    debugPrint('======================================');

    debugPrint('Tổng số sân: ${courts.length}');

    for (final court in courts) {
      debugPrint(
        '${court.id} | '
        '${court.name} | '
        '${court.pricePerHour}đ/giờ | '
        'Môn: ${court.sport} | '
        'Hoạt động: ${court.isActive}',
      );
    }

    debugPrint('======================================');
  }

  // ====================================================
  // TẢI LỊCH ĐẶT CỦA KHÁCH TỪ API
  // ====================================================

  Future<void> loadMyBookings() async {
    if (!isLoggedIn || !ApiClient.hasToken) return;

    try {
      final list = await BookingApi.fetchMyBookings(courts);

      if (!mounted) return;

      setState(() {
        bookings = list;
      });
    } on ApiException catch (error) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } catch (_) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Không tải được lịch đặt sân.')),
      );
    }
  }

  // ====================================================
  // TẢI HỒ SƠ TÀI KHOẢN TỪ API
  // ====================================================

  /// Lấy hồ sơ mới nhất (khi [fetch] = true) rồi cập nhật thông tin hiển thị.
  Future<void> refreshProfile({bool fetch = true}) async {
    if (!isLoggedIn || !ApiClient.hasToken) return;

    try {
      if (fetch) await AuthApi.fetchProfile();
    } catch (_) {
      // Giữ thông tin hiện có nếu không tải được.
    }

    final session = AuthApi.current;
    if (!mounted || session == null) return;

    setState(() {
      loggedInEmail = session.email;
      loggedInName = session.fullName;
      loggedInPhone = session.phone;
    });
  }

  // ====================================================
  // 6. ĐĂNG NHẬP VÀ ĐĂNG KÝ
  // ====================================================

  Future<bool> authenticate(bool initialRegister) async {
    final AuthResult? result = await showAuthPage(
      context: context,
      accounts: demoAccounts,
      initialRegister: initialRegister,
    );

    // Người dùng đóng trang đăng nhập hoặc đăng ký.
    if (!mounted || result == null) {
      return false;
    }

    // Cập nhật người dùng đang đăng nhập.
    setState(() {
      loggedInEmail = result.email;
      loggedInName = result.fullName;
      loggedInPhone = result.phone;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Xin chào ${result.fullName}! '
          'Bạn đã đăng nhập thành công.',
        ),
        backgroundColor: const Color(0xFF07834D),
      ),
    );

    // Đăng nhập xong thì tải lịch đặt và sân yêu thích của tài khoản này.
    loadMyBookings();
    FavoritesStore.instance.load();

    return true;
  }

  // ====================================================
  // 7. ĐĂNG XUẤT
  // ====================================================

  void logout() {
    // Xóa token đăng nhập để các API khách hàng không dùng lại phiên cũ.
    AuthApi.signOut();
    FavoritesStore.instance.clear();

    setState(() {
      loggedInEmail = null;
      loggedInName = null;
      loggedInPhone = null;
      bookings = <Booking>[];
      tab = 0;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Bạn đã đăng xuất tài khoản.')),
    );
  }

  // ====================================================
  // 8. KIỂM TRA ĐĂNG NHẬP TRƯỚC KHI ĐẶT SÂN
  // ====================================================

  Future<bool> checkLoginBeforeBooking() async {
    // Admin và quản lý không sử dụng tài khoản khách hàng.
    if (!isCustomer) {
      return true;
    }

    // Đã đăng nhập.
    if (isLoggedIn) {
      return true;
    }

    // Chưa đăng nhập thì mở trang đăng nhập.
    final success = await authenticate(false);

    if (!mounted) {
      return false;
    }

    return success;
  }

  // ====================================================
  // 9. THÊM LỊCH ĐẶT SÂN
  // ====================================================

  void addBooking(Booking booking) {
    if (!mounted) return;

    setState(() {
      bookings.insert(0, booking);
    });

    debugPrint('======================================');
    debugPrint('ĐÃ TẠO LỊCH ĐẶT');
    debugPrint('Mã đặt sân: ${booking.id}');
    debugPrint('Sân: ${booking.court.name}');
    debugPrint('Tổng tiền: ${booking.totalPrice}');
    debugPrint('Thanh toán: ${booking.paymentStatus}');
    debugPrint('======================================');
  }

  // ====================================================
  // 10. CẬP NHẬT THANH TOÁN
  // ====================================================
=======
  // Tab khách hàng:
  // 0 = Trang chủ, 1 = Tìm kiếm, 2 = Lịch đặt, 3 = Tài khoản.
  int tab = 0;

  // Tab dành cho chủ sân/Admin.
  int managementTab = 0;

  String role = 'Khách hàng';

  late List<Court> courts;
  late List<Booking> bookings;

  // Tài khoản demo lưu trong bộ nhớ khi ứng dụng đang chạy.
  final Map<String, CustomerAccount> demoAccounts = {};

  String? loggedInEmail;
  String? loggedInName;
  String? loggedInPhone;

  bool get isLoggedIn =>
      loggedInEmail != null && loggedInEmail!.isNotEmpty;

  bool get isCustomer => role == 'Khách hàng';

  @override
  void initState() {
    super.initState();
    courts = List<Court>.of(sampleCourts);
    bookings = <Booking>[];
  }

  // ==========================================================
  // ĐĂNG NHẬP / ĐĂNG KÝ
  // ==========================================================

  Future<bool> authenticate(bool initialRegister) async {
    final ketQua = await showAuthPage(
      context: context,
      accounts: demoAccounts,
      initialRegister: initialRegister,
    );

    if (!mounted || ketQua == null) {
      return false;
    }

    setState(() {
      loggedInEmail = ketQua.email;
      loggedInName = ketQua.fullName;
      loggedInPhone = ketQua.phone;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Xin chào ${ketQua.fullName}!'),
        backgroundColor: const Color(0xFF16845B),
      ),
    );

    return true;
  }

  void logout() {
    setState(() {
      loggedInEmail = null;
      loggedInName = null;
      loggedInPhone = null;
      tab = 0;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Bạn đã đăng xuất thành công.'),
      ),
    );
  }

  Future<bool> checkLoginBeforeBooking() async {
    if (isLoggedIn) return true;
    return authenticate(false);
  }

  // ==========================================================
  // QUẢN LÝ LỊCH ĐẶT
  // ==========================================================

  void addBooking(Booking booking) {
    if (!mounted) return;

    setState(() {
      bookings.insert(0, booking);
    });
  }

  void cancelBooking(Booking booking) {
    final viTri = bookings.indexWhere(
      (item) => item.id == booking.id,
    );

    if (viTri == -1) return;

    final datSan = bookings[viTri];

    if (datSan.isCancelled) return;

    // Không tự xác nhận hoàn tiền cho giao dịch đã thanh toán.
    if (datSan.isPaid) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Lịch đặt đã thanh toán. Vui lòng gửi yêu cầu hủy để xử lý hoàn tiền.',
          ),
        ),
      );
      return;
    }

    setState(() {
      bookings[viTri] = datSan.copyWith(
        status: 'Đã hủy',
      );
    });
  }

  // ==========================================================
  // CẬP NHẬT TRẠNG THÁI THANH TOÁN
  // ==========================================================
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f

  void updatePayment(
    Booking booking, {
    required String paymentStatus,
    required String paymentMethod,
    String? transactionId,
    DateTime? paidAt,
    String? paymentProof,
  }) {
<<<<<<< HEAD
    final index = bookings.indexWhere((item) => item.id == booking.id);

    if (index == -1) {
      debugPrint('Không tìm thấy lịch đặt: ${booking.id}');
      return;
    }

    final current = bookings[index];

    // Không cập nhật giao dịch đã hủy.
    if (current.status == 'Đã hủy') {
      return;
    }

    // Không ghi nhận thanh toán lặp.
    if (current.paymentStatus == 'Đã thanh toán') {
=======
    final viTri = bookings.indexWhere(
      (item) => item.id == booking.id,
    );

    if (viTri == -1) return;

    final datSanHienTai = bookings[viTri];

    if (datSanHienTai.isCancelled || datSanHienTai.isPaid) {
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
      return;
    }

    setState(() {
<<<<<<< HEAD
      bookings[index] = current.copyWith(
=======
      bookings[viTri] = datSanHienTai.copyWith(
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
        transactionId: transactionId,
        paidAt: paidAt,
        paymentProof: paymentProof,
<<<<<<< HEAD

        // Chỉ xác nhận lịch khi có kết quả thanh toán thành công.
        status: paymentStatus == 'Đã thanh toán'
            ? 'Đã xác nhận'
            : current.status,
      );
    });

    debugPrint('======================================');
    debugPrint('CẬP NHẬT THANH TOÁN');
    debugPrint('Mã đặt sân: ${booking.id}');
    debugPrint('Trạng thái: $paymentStatus');
    debugPrint('Phương thức: $paymentMethod');
    debugPrint('Mã giao dịch: $transactionId');
    debugPrint('======================================');
  }

  // ====================================================
  // 11. HỦY LỊCH ĐẶT
  // ====================================================

  void cancelBooking(Booking booking) {
    final index = bookings.indexWhere((item) => item.id == booking.id);

    if (index == -1) {
      return;
    }

    final current = bookings[index];

    if (current.status == 'Đã hủy') {
=======
        status: paymentStatus == 'Đã thanh toán'
            ? 'Đã xác nhận'
            : datSanHienTai.status,
      );
    });
  }

  // ==========================================================
  // QUẢN LÝ SÂN
  // ==========================================================

  // RoleDashboardScreen yêu cầu ValueChanged<Court>.
  // Vì vậy hàm nhận cả đối tượng sân, không nhận mã sân String.
  void toggleCourt(Court court) {
    final viTri = courts.indexWhere(
      (item) => item.id == court.id,
    );

    if (viTri == -1) return;

    setState(() {
      final sanHienTai = courts[viTri];
      courts[viTri] = sanHienTai.copyWith(
        isActive: !sanHienTai.isActive,
      );
    });
  }

  void addCourt(Court court) {
    final daTonTai = courts.any(
      (item) => item.id == court.id,
    );

    if (daTonTai) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mã sân đã tồn tại.')),
      );
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
      return;
    }

    setState(() {
<<<<<<< HEAD
      bookings[index] = current.copyWith(status: 'Đã hủy');
    });

    debugPrint('Đã hủy lịch đặt: ${booking.id}');
  }

  // ====================================================
  // 12. THAY ĐỔI VAI TRÒ
  // ====================================================

  void changeRole(String value) {
    setState(() {
      role = value;
      tab = 0;
    });
  }

  // ====================================================
  // 13. MỞ CHI TIẾT SÂN
  // ====================================================

  void openCourt(Court court) {
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => CourtDetailScreen(
          court: court,

          // Callback khi khách bấm Đặt lịch trong chi tiết sân.
          onBook: () async {
            if (!court.isActive) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Sân hiện không hoạt động. '
                    'Vui lòng chọn sân khác.',
                  ),
                ),
              );

              return;
            }

            // Kiểm tra đăng nhập.
            final allowed = await checkLoginBeforeBooking();

            if (!allowed || !mounted) {
              return;
            }

            // Mở màn hình đặt sân.
            await Navigator.push<void>(
              context,
              MaterialPageRoute<void>(
                builder: (_) => BookingScreen(
                  court: court,

                  // Callback tạo lịch đặt.
                  onBooked: addBooking,

                  // Callback cập nhật kết quả thanh toán.
                  onPaymentUpdate: updatePayment,
                ),
              ),
            );

            // Quay lại sau khi đặt/thanh toán: cập nhật lịch đặt từ máy chủ.
            if (mounted) loadMyBookings();
          },
        ),
      ),
    );
  }

  // ====================================================
  // 15. BẬT / TẮT TRẠNG THÁI SÂN
  // ====================================================

  void toggleCourt(Court court) {
    final index = courts.indexWhere((item) => item.id == court.id);

    if (index == -1) {
      return;
    }

    setState(() {
      courts[index] = court.copyWith(isActive: !court.isActive);
    });
  }

  // ====================================================
  // 16. THÊM SÂN MỚI
  // CHỈ CHẤP NHẬN SÂN CẦU LÔNG
  // ====================================================

  void addCourt(Court court) {
    final sport = court.sport.trim().toLowerCase();

    if (sport != 'cầu lông' && sport != 'cau long') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ứng dụng chỉ hỗ trợ quản lý sân cầu lông.'),
        ),
      );

      return;
    }

    final exists = courts.any((item) => item.id == court.id);

    if (exists) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Mã sân này đã tồn tại.')));

      return;
    }

    setState(() {
      courts.add(court);
    });

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Đã thêm sân cầu lông.')));
  }

  // ====================================================
  // 17. TAB KHÁCH HÀNG (4 MÀN CHÍNH)
  // ====================================================

  List<Widget> _buildCustomerPages() {
    return [
      // --------------------------------------------------
      // TAB 0: TRANG CHỦ
      // --------------------------------------------------
      HomeScreen(
        courts: courts,
        loading: loadingCourts,
        errorMessage: courtsError,
        onRefresh: loadCourts,

        loggedInEmail: loggedInEmail,
        loggedInName: loggedInName,
        loggedInPhone: loggedInPhone,

        onAuthenticate: authenticate,
        onLogout: logout,

        onOpenSearch: () {
          setState(() {
            tab = 1;
          });
        },

        onBook: openCourt,
      ),

      // --------------------------------------------------
      // TAB 1: TÌM KIẾM
      // --------------------------------------------------
      SafeArea(
        child: SearchScreen(courts: courts, onBook: openCourt),
      ),

      // --------------------------------------------------
      // TAB 2: LỊCH ĐẶT
      // BookingHistoryScreen đã tự có Scaffold và AppBar.
      // --------------------------------------------------
      SafeArea(
        child: BookingHistoryScreen(
          bookings: bookings,
          onCancelBooking: cancelBooking,
          onPaymentUpdate: updatePayment,
          onRefresh: loadMyBookings,
        ),
      ),

      // --------------------------------------------------
      // TAB 3: TÀI KHOẢN
      // --------------------------------------------------
      SafeArea(
        child: ProfileScreen(
          role: role,
          courts: courts,
          onBook: openCourt,

          // Truyền thông tin khách hàng.
          isLoggedIn: isLoggedIn,
          displayName: loggedInName,
          email: loggedInEmail,
          phone: loggedInPhone,

          onAuthenticate: authenticate,
          onLogout: logout,
          onProfileChanged: () => refreshProfile(fetch: false),
        ),
      ),
    ];
  }

  // ====================================================
  // 18. TAB QUẢN LÝ SÂN / ADMIN
  // ====================================================

  List<Widget> _buildManagementPages() {
    return [
      // --------------------------------------------------
      // TAB 0: TỔNG QUAN
      // --------------------------------------------------
      RoleDashboardScreen(
        role: role,
        courts: courts,
        bookings: bookings,

        onRoleChanged: changeRole,
        onAddCourt: addCourt,
        onToggleCourt: toggleCourt,
        onCancelBooking: cancelBooking,
      ),

      // --------------------------------------------------
      // TAB 1: LỊCH SỬ ĐẶT SÂN
      // --------------------------------------------------
      BookingHistoryScreen(
        bookings: bookings,
        onCancelBooking: cancelBooking,
        onPaymentUpdate: updatePayment,
      ),

      // --------------------------------------------------
      // TAB 2: TÀI KHOẢN
      // --------------------------------------------------
      ProfileScreen(role: role),
    ];
  }

  // ====================================================
  // 19. THANH ĐIỀU HƯỚNG ADMIN / QUẢN LÝ
  // ====================================================

  static const List<NavigationDestination> managementDestinations = [
    NavigationDestination(
      icon: Icon(Icons.dashboard_outlined),
      selectedIcon: Icon(Icons.dashboard),
      label: 'Tổng quan',
    ),

    NavigationDestination(
      icon: Icon(Icons.calendar_month_outlined),
      selectedIcon: Icon(Icons.calendar_month),
      label: 'Đặt sân',
    ),

    NavigationDestination(
      icon: Icon(Icons.person_outline),
      selectedIcon: Icon(Icons.person),
      label: 'Tài khoản',
    ),
  ];

  // ====================================================
  // 20. BUILD
  // ====================================================

  @override
  Widget build(BuildContext context) {
    // Xây dựng danh sách màn hình.
    final List<Widget> pages = isCustomer
        ? _buildCustomerPages()
        : _buildManagementPages();

    // Đảm bảo tab hợp lệ.
    final safeTab = tab.clamp(0, pages.length - 1).toInt();

    final isHomeTab = isCustomer && safeTab == 0;

    // ==================================================
    // STATUS BAR
    // ==================================================

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: isHomeTab
          ? SystemUiOverlayStyle.light.copyWith(
              statusBarColor: Colors.transparent,
            )
          : SystemUiOverlayStyle.dark.copyWith(
              statusBarColor: Colors.transparent,
            ),

      child: Scaffold(
        // ================================================
        // BODY
        // ================================================
        body: isCustomer
            ? IndexedStack(index: safeTab, children: pages)
            : SafeArea(
                child: IndexedStack(index: safeTab, children: pages),
              ),

        // ================================================
        // BOTTOM NAVIGATION
        // ================================================
        bottomNavigationBar: isCustomer
            ? AppBottomBar(
                currentIndex: safeTab,

                onTap: (value) async {
                  // ----------------------------------------
                  // CHƯA ĐĂNG NHẬP MÀ BẤM LỊCH ĐẶT / TÀI KHOẢN
                  // ----------------------------------------

                  if ((value == 2 || value == 3) && !isLoggedIn) {
                    final success = await authenticate(false);

                    if (!mounted) return;

                    // Chỉ chuyển tab sau khi đăng nhập thành công.
                    if (success) {
                      setState(() {
                        tab = value;
                      });
                    }

                    // Nếu người dùng thoát đăng nhập,
                    // giữ nguyên tab trước đó.
                    return;
                  }

                  // ----------------------------------------
                  // CHUYỂN TAB BÌNH THƯỜNG
                  // ----------------------------------------

                  setState(() {
                    tab = value;
                  });

                  // Vào tab Lịch đặt / Tài khoản thì tải lại dữ liệu mới nhất.
                  if (value == 2) loadMyBookings();
                  if (value == 3) refreshProfile();
                },
              )
            : NavigationBar(
                selectedIndex: safeTab,

                onDestinationSelected: (value) {
                  setState(() {
                    tab = value;
                  });
                },

                destinations: managementDestinations,
              ),
=======
      courts.add(court);
    });
  }

  // ==========================================================
  // MỞ CHI TIẾT SÂN VÀ ĐẶT SÂN
  // ==========================================================

  Future<void> openCourt(Court court) async {
    if (!court.isActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Sân hiện không hoạt động. Vui lòng chọn sân khác.'),
        ),
      );
      return;
    }

    // Lưu Navigator trước khi chờ, không gọi State.context sau await.
    final dieuHuongGoc = Navigator.of(context);

    await dieuHuongGoc.push<void>(
      MaterialPageRoute<void>(
        builder: (detailContext) {
          return CourtDetailScreen(
            court: court,
            onBook: () async {
              final duocPhepDat = await checkLoginBeforeBooking();

              // Kiểm tra đúng BuildContext của màn chi tiết sân.
              if (!duocPhepDat || !detailContext.mounted) {
                return;
              }

              await Navigator.of(detailContext).push<void>(
                MaterialPageRoute<void>(
                  builder: (bookingContext) {
                    return BookingScreen(
                      court: court,
                      onBooked: addBooking,
                      onPaymentUpdate: updatePayment,
                      onPaymentCompleted: () {
                        if (!mounted) return;

                        setState(() {
                          tab = 0;
                          managementTab = 0;
                        });
                      },
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }

  // ==========================================================
  // THAY ĐỔI VAI TRÒ
  // ==========================================================

  void changeRole(String vaiTroMoi) {
    setState(() {
      role = vaiTroMoi;
      tab = 0;
      managementTab = 0;
    });
  }

  // ==========================================================
  // XỬ LÝ THANH ĐIỀU HƯỚNG KHÁCH HÀNG
  // ==========================================================

  Future<void> onCustomerTabTap(int index) async {
    // Tab Lịch đặt và Tài khoản yêu cầu đăng nhập.
    if ((index == 2 || index == 3) && !isLoggedIn) {
      final dangNhapThanhCong = await authenticate(false);

      if (!dangNhapThanhCong || !mounted) {
        return;
      }
    }

    if (!mounted) return;

    setState(() {
      tab = index;
    });
  }

  // ==========================================================
  // 4 MÀN HÌNH KHÁCH HÀNG
  // ==========================================================

  List<Widget> buildCustomerPages() {
    return [
      // 0 - TRANG CHỦ
      HomeScreen(
        courts: courts,
        onOpenSearch: () {
          setState(() {
            tab = 1;
          });
        },
        onBook: openCourt,
        loggedInEmail: loggedInEmail,
        loggedInName: loggedInName,
        loggedInPhone: loggedInPhone,
        onAuthenticate: authenticate,
        onLogout: logout,
      ),

      // 1 - TÌM KIẾM
      SearchScreen(
        courts: courts,
        onBook: openCourt,
      ),

      // 2 - LỊCH ĐẶT
      BookingHistoryScreen(
        bookings: bookings,
        onCancelBooking: cancelBooking,
        onPaymentUpdate: updatePayment,
      ),

      // 3 - TÀI KHOẢN
      ProfileScreen(
        role: role,
        isLoggedIn: isLoggedIn,
        displayName: loggedInName,
        email: loggedInEmail,
        phone: loggedInPhone,
        onAuthenticate: authenticate,
        onLogout: logout,
      ),
    ];
  }

  // ==========================================================
  // CÁC MÀN HÌNH QUẢN LÝ
  // ==========================================================

  List<Widget> buildManagementPages() {
    return [
      RoleDashboardScreen(
        role: role,
        courts: courts,
        bookings: bookings,
        onRoleChanged: changeRole,
        onAddCourt: addCourt,
        onToggleCourt: toggleCourt,
        onCancelBooking: cancelBooking,
      ),
      BookingHistoryScreen(
        bookings: bookings,
        onCancelBooking: cancelBooking,
        onPaymentUpdate: updatePayment,
      ),
      ProfileScreen(
        role: role,
      ),
    ];
  }

  // ==========================================================
  // GIAO DIỆN
  // ==========================================================

  @override
  Widget build(BuildContext context) {
    if (isCustomer) {
      final cacManHinh = buildCustomerPages();
      final tabAnToan = tab.clamp(0, cacManHinh.length - 1);

      return Scaffold(
        body: SafeArea(
          child: IndexedStack(
            index: tabAnToan,
            children: cacManHinh,
          ),
        ),
        bottomNavigationBar: AppBottomBar(
          currentIndex: tabAnToan,
          onTap: onCustomerTabTap,
        ),
      );
    }

    final cacManHinhQuanLy = buildManagementPages();
    final tabQuanLyAnToan = managementTab.clamp(
      0,
      cacManHinhQuanLy.length - 1,
    );

    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: tabQuanLyAnToan,
          children: cacManHinhQuanLy,
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tabQuanLyAnToan,
        onDestinationSelected: (index) {
          setState(() {
            managementTab = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Quản lý',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month),
            label: 'Lịch đặt',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Tài khoản',
          ),
        ],
>>>>>>> fb6c54caa1e5a5dca2e3c3881790f15485a8541f
      ),
    );
  }
}
