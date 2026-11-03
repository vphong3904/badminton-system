import 'package:flutter/material.dart';

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
  runApp(const BadmintonApp());
}

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

// ============================================================
// ĐIỀU HƯỚNG CHÍNH CỦA ỨNG DỤNG
// ============================================================

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
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

  void updatePayment(
    Booking booking, {
    required String paymentStatus,
    required String paymentMethod,
    String? transactionId,
    DateTime? paidAt,
    String? paymentProof,
  }) {
    final viTri = bookings.indexWhere(
      (item) => item.id == booking.id,
    );

    if (viTri == -1) return;

    final datSanHienTai = bookings[viTri];

    if (datSanHienTai.isCancelled || datSanHienTai.isPaid) {
      return;
    }

    setState(() {
      bookings[viTri] = datSanHienTai.copyWith(
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
        transactionId: transactionId,
        paidAt: paidAt,
        paymentProof: paymentProof,
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
      return;
    }

    setState(() {
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
      ),
    );
  }
}
