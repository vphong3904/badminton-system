import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// THEME

import 'features/auth/data/auth_api.dart';
import 'features/auth/screens/auth_flow.dart';
import 'models/auth_model.dart';
import 'core/theme/app_theme.dart';

// MODELS

import 'models/booking_model.dart';
import 'models/court_model.dart';

// HOME

import 'core/network/api_client.dart';
import 'core/config/app_config.dart';
import 'core/router/app_events.dart';
import 'features/home/data/venue_api.dart';
import 'features/home/screens/home_screen.dart';

// BOOKING

import 'features/booking/data/booking_api.dart';
import 'features/favorites/favorites_store.dart';
import 'features/notifications/data/notification_store.dart';
import 'features/notifications/screens/notifications_screen.dart';
import 'features/booking/screens/booking_screen.dart';

// SEARCH

import 'features/search/screens/search_screen.dart';

// HISTORY

import 'features/history/screens/booking_history_screen.dart';

// PROFILE

import 'features/auth/screens/profile_screen.dart';

// OWNER / ADMIN

import 'features/owner/screens/role_dashboard_screen.dart';

// COURT DETAIL

import 'features/venue_detail/screens/venue_detail_screen.dart';

// BOTTOM NAVIGATION

import 'shared/app_bottom_bar.dart';

// MAIN

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Khôi phục token đã lưu: thoát app mở lại vẫn còn đăng nhập.
  await AuthApi.restoreSession();

  runApp(const BadmintonApp());
}

// BADMINTON APP

class BadmintonApp extends StatelessWidget {
  const BadmintonApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const AppShell(),
    );
  }
}

// APP SHELL
// QUẢN LÝ DỮ LIỆU VÀ ĐIỀU HƯỚNG TOÀN ỨNG DỤNG

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  // 1. VAI TRÒ NGƯỜI DÙNG

  String role = 'Khách hàng';

  bool get isCustomer => role == 'Khách hàng';

  // 2. TAB HIỆN TẠI

  int tab = 0;

  // Các tab khách hàng:
  // 0: Trang chủ
  // 1: Tìm kiếm
  // 2: Lịch đặt
  // 3: Tài khoản

  // 3. DỮ LIỆU SÂN VÀ LỊCH ĐẶT

  // Danh sách cơ sở tải từ backend (Court.id = maCoSo).
  List<Court> courts = <Court>[];

  bool loadingCourts = true;

  String? courtsError;

  late List<Booking> bookings;

  // 4. TÀI KHOẢN ĐANG ĐĂNG NHẬP

  String? loggedInEmail;

  String? loggedInName;

  String? loggedInPhone;

  bool get isLoggedIn => loggedInEmail != null && loggedInEmail!.isNotEmpty;

  // 5. KHỞI TẠO ỨNG DỤNG

  @override
  void initState() {
    super.initState();

    // Khởi tạo danh sách lịch đặt trống.
    bookings = <Booking>[];

    // Khi bấm tim lúc chưa đăng nhập thì mở màn đăng nhập.
    FavoritesStore.instance.ensureLogin = () => authenticate(false);

    // Token hết hạn (401) ở bất kỳ API nào: đăng xuất và mời đăng nhập lại.
    ApiClient.onUnauthorized = _handleSessionExpired;

    // Gửi ảnh chuyển khoản xong → chuyển sang tab Lịch đặt (đơn chờ chủ sân duyệt).
    AppEvents.openBookingHistory.addListener(_onOpenBookingHistory);

    // Có thông báo mới khi đang mở app: hiện banner và tải lại lịch đặt (trạng thái đơn có thể đã đổi).
    NotificationStore.instance.onNewArrived = _onNewNotification;

    // Đã có phiên lưu trên máy (thoát app mở lại): vào thẳng trạng thái đã đăng nhập.
    final saved = AuthApi.current;
    if (saved != null) {
      loggedInEmail = saved.email;
      loggedInName = saved.fullName;
      loggedInPhone = saved.phone;
    }

    // Tải danh sách cơ sở từ API.
    loadCourts();
  }

  /// Sau khi khôi phục phiên: làm mới hồ sơ (token hết hạn → 401 → tự đăng xuất)
  /// rồi tải lịch đặt, yêu thích, thông báo như lúc vừa đăng nhập.
  Future<void> _afterRestoreSession() async {
    if (!isLoggedIn || !ApiClient.hasToken) return;
    await refreshProfile();
    if (!mounted || !isLoggedIn) return;
    loadMyBookings();
    FavoritesStore.instance.load();
    NotificationStore.instance.start();
  }

  void _onOpenBookingHistory() {
    if (!mounted || !isLoggedIn) return;
    setState(() => tab = 2);
    loadMyBookings();
  }

  @override
  void dispose() {
    AppEvents.openBookingHistory.removeListener(_onOpenBookingHistory);
    if (ApiClient.onUnauthorized == _handleSessionExpired) {
      ApiClient.onUnauthorized = null;
    }
    NotificationStore.instance.onNewArrived = null;
    NotificationStore.instance.stop();
    super.dispose();
  }

  // THÔNG BÁO

  void _onNewNotification(int count) {
    if (!mounted) return;
    loadMyBookings();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('Bạn có $count thông báo mới.'),
          action: SnackBarAction(label: 'Xem', onPressed: openNotifications),
        ),
      );
  }

  /// Mở màn Thông báo (yêu cầu đăng nhập). Chạm thông báo về đơn → chuyển sang tab Lịch đặt.
  Future<void> openNotifications() async {
    if (!isLoggedIn) {
      final ok = await authenticate(false);
      if (!ok || !mounted) return;
    }
    await Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => NotificationsScreen(
          onOpenBooking: () {
            setState(() => tab = 2);
            loadMyBookings();
          },
          // Thông báo đánh giá (venue): mở chi tiết cơ sở, không có trong danh sách thì về trang chủ.
          onOpenVenue: (maCoSo) {
            final index = courts.indexWhere((item) => item.apiId == maCoSo);
            if (index >= 0) {
              openCourt(courts[index]);
            } else {
              setState(() => tab = 0);
            }
          },
        ),
      ),
    );
    NotificationStore.instance.refresh();
  }

  bool _sessionExpiring = false;
  bool _restoreHandled = false;

  /// Phiên đăng nhập hết hạn: xoá trạng thái người dùng và mở màn đăng nhập.
  void _handleSessionExpired() {
    if (_sessionExpiring || !isLoggedIn) return;
    _sessionExpiring = true;
    Future<void>.microtask(() async {
      if (!mounted) {
        _sessionExpiring = false;
        return;
      }
      AuthApi.signOut();
      FavoritesStore.instance.clear();
      NotificationStore.instance.clear();
      setState(() {
        loggedInEmail = null;
        loggedInName = null;
        loggedInPhone = null;
        bookings = <Booking>[];
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'),
          ),
        );
      _sessionExpiring = false;
      await authenticate(false);
    });
  }

  // TẢI DANH SÁCH CƠ SỞ TỪ API

  Future<void> loadCourts({bool force = false}) async {
    setState(() {
      loadingCourts = true;
      courtsError = null;
    });

    try {
      final venues = await VenueApi.fetchVenues(force: force);

      if (!mounted) return;

      setState(() {
        courts = venues;
        loadingCourts = false;
      });

      _printInitialData();

      if (!_restoreHandled) {
        _restoreHandled = true;
        _afterRestoreSession();
      }
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

  // HIỂN THỊ DỮ LIỆU TRÊN TERMINAL

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

  // TẢI LỊCH ĐẶT CỦA KHÁCH TỪ API

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

  // TẢI HỒ SƠ TÀI KHOẢN TỪ API

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

  // 6. ĐĂNG NHẬP VÀ ĐĂNG KÝ

  Future<bool> authenticate(bool initialRegister) async {
    final AuthResult? result = await showAuthPage(
      context: context,
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
        backgroundColor: const Color(0xFF2FA672),
      ),
    );

    // Đăng nhập xong thì tải lịch đặt và sân yêu thích của tài khoản này.
    loadMyBookings();
    FavoritesStore.instance.load();
    NotificationStore.instance.start();

    return true;
  }

  // 7. ĐĂNG XUẤT

  void logout() {
    // Xóa token đăng nhập để các API khách hàng không dùng lại phiên cũ.
    AuthApi.signOut();
    FavoritesStore.instance.clear();
    NotificationStore.instance.clear();

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

  // 8. KIỂM TRA ĐĂNG NHẬP TRƯỚC KHI ĐẶT SÂN

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

  // 9. THÊM LỊCH ĐẶT SÂN

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

  // 10. CẬP NHẬT THANH TOÁN

  void updatePayment(
    Booking booking, {
    required String paymentStatus,
    required String paymentMethod,
    String? transactionId,
    DateTime? paidAt,
  }) {
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
      return;
    }

    setState(() {
      bookings[index] = current.copyWith(
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
        transactionId: transactionId,
        paidAt: paidAt,

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

  // 11. HỦY LỊCH ĐẶT

  void cancelBooking(Booking booking) {
    final index = bookings.indexWhere((item) => item.id == booking.id);

    if (index == -1) {
      return;
    }

    final current = bookings[index];

    if (current.status == 'Đã hủy') {
      return;
    }

    setState(() {
      bookings[index] = current.copyWith(status: 'Đã hủy');
    });

    debugPrint('Đã hủy lịch đặt: ${booking.id}');
  }

  // 12. THAY ĐỔI VAI TRÒ

  void changeRole(String value) {
    setState(() {
      role = value;
      tab = 0;
    });
  }

  // 13. MỞ CHI TIẾT SÂN

  void openCourt(Court court) {
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => VenueDetailScreen(
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

  // 15. BẬT / TẮT TRẠNG THÁI SÂN

  void toggleCourt(Court court) {
    final index = courts.indexWhere((item) => item.id == court.id);

    if (index == -1) {
      return;
    }

    setState(() {
      courts[index] = court.copyWith(isActive: !court.isActive);
    });
  }

  // 16. THÊM SÂN MỚI
  // CHỈ CHẤP NHẬN SÂN CẦU LÔNG

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

  // 17. TAB KHÁCH HÀNG (4 MÀN CHÍNH)

  List<Widget> _buildCustomerPages() {
    return [
      // TAB 0: TRANG CHỦ
      HomeScreen(
        courts: courts,
        loading: loadingCourts,
        errorMessage: courtsError,
        onRefresh: () => loadCourts(force: true),

        loggedInEmail: loggedInEmail,
        loggedInName: loggedInName,
        loggedInPhone: loggedInPhone,

        onAuthenticate: authenticate,
        onLogout: logout,
        onOpenNotifications: openNotifications,

        onOpenSearch: () {
          setState(() {
            tab = 1;
          });
        },

        onBook: openCourt,
      ),

      // TAB 1: TÌM KIẾM
      SafeArea(
        child: SearchScreen(courts: courts, onBook: openCourt),
      ),

      // TAB 2: LỊCH ĐẶT
      // BookingHistoryScreen đã tự có Scaffold và AppBar.
      SafeArea(
        child: BookingHistoryScreen(
          bookings: bookings,
          onCancelBooking: cancelBooking,
          onPaymentUpdate: updatePayment,
          onRefresh: loadMyBookings,
        ),
      ),

      // TAB 3: TÀI KHOẢN
      SafeArea(
        child: ProfileScreen(
          role: role,
          courts: courts,
          onBook: openCourt,
          onOpenHistory: () {
            setState(() => tab = 2);
            loadMyBookings();
          },
          onOpenNotifications: openNotifications,
          pendingPaymentCount: bookings
              .where((b) => !b.isCancelled && b.paymentStatus == 'Chờ thanh toán')
              .length,

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

  // 18. TAB QUẢN LÝ SÂN / ADMIN

  List<Widget> _buildManagementPages() {
    return [
      // TAB 0: TỔNG QUAN
      RoleDashboardScreen(
        role: role,
        courts: courts,
        bookings: bookings,

        onRoleChanged: changeRole,
        onAddCourt: addCourt,
        onToggleCourt: toggleCourt,
        onCancelBooking: cancelBooking,
      ),

      // TAB 1: LỊCH SỬ ĐẶT SÂN
      BookingHistoryScreen(
        bookings: bookings,
        onCancelBooking: cancelBooking,
        onPaymentUpdate: updatePayment,
      ),

      // TAB 2: TÀI KHOẢN
      ProfileScreen(role: role),
    ];
  }

  // 19. THANH ĐIỀU HƯỚNG ADMIN / QUẢN LÝ

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

  // 20. BUILD

  @override
  Widget build(BuildContext context) {
    // Xây dựng danh sách màn hình.
    final List<Widget> pages = isCustomer
        ? _buildCustomerPages()
        : _buildManagementPages();

    // Đảm bảo tab hợp lệ.
    final safeTab = tab.clamp(0, pages.length - 1).toInt();

    final isHomeTab = isCustomer && safeTab == 0;

    // STATUS BAR

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: isHomeTab
          ? SystemUiOverlayStyle.light.copyWith(
              statusBarColor: Colors.transparent,
            )
          : SystemUiOverlayStyle.dark.copyWith(
              statusBarColor: Colors.transparent,
            ),

      // Back của Android: đang ở tab khác Trang chủ thì về Trang chủ trước,
      // đang ở Trang chủ thì mới thoát app.
      child: PopScope(
        canPop: safeTab == 0,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) setState(() => tab = 0);
        },
        child: Scaffold(
        // BODY
        body: isCustomer
            ? IndexedStack(index: safeTab, children: pages)
            : SafeArea(
                child: IndexedStack(index: safeTab, children: pages),
              ),

        // BOTTOM NAVIGATION
        bottomNavigationBar: isCustomer
            ? AppBottomBar(
                currentIndex: safeTab,

                onTap: (value) async {
                  // CHƯA ĐĂNG NHẬP MÀ BẤM LỊCH ĐẶT / TÀI KHOẢN

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

                  // CHUYỂN TAB BÌNH THƯỜNG

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
        ),
      ),
    );
  }
}
