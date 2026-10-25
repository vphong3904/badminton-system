import 'package:flutter/material.dart';

import 'models/booking.dart';
import 'models/court.dart';
import 'data/sample_data.dart';

import 'screens/booking_screen.dart';
import 'screens/home_screen.dart';
import 'screens/search_screen.dart';
import 'screens/booking_history_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/role_dashboard_screen.dart';
import 'screens/court_detail_screen.dart';

void main() {
  runApp(const BadmintonApp());
}

class BadmintonApp extends StatelessWidget {
  const BadmintonApp({super.key});

  @override
  Widget build(BuildContext context) {
    const primaryColor = Color(0xFF16845B);
    const backgroundColor = Color(0xFFF5F7F5);

    return MaterialApp(
      title: 'Badminton Booking',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: primaryColor),
        scaffoldBackgroundColor: backgroundColor,
        appBarTheme: const AppBarTheme(
          backgroundColor: backgroundColor,
          foregroundColor: Color(0xFF10583F),
          centerTitle: false,
        ),
      ),
      home: const AppShell(),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  String role = 'Khách hàng';
  int tab = 0;

  late List<Court> courts;
  late List<Booking> bookings;

  bool get isCustomer => role == 'Khách hàng';

  @override
  void initState() {
    super.initState();
    courts = List<Court>.of(sampleCourts);
    bookings = <Booking>[];
  }

  void addBooking(Booking booking) {
    if (!mounted) return;

    setState(() {
      bookings.insert(0, booking);
    });
  }

  void changeRole(String value) {
    setState(() {
      role = value;
      tab = 0;
    });
  }

  void openCourt(Court court) {
    Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => CourtDetailScreen(
          court: court,
          onBook: () {
            if (!court.isActive) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Sân hiện không hoạt động. Vui lòng chọn sân khác.',
                  ),
                ),
              );
              return;
            }

            Navigator.push<void>(
              context,
              MaterialPageRoute(
                builder: (_) =>
                    BookingScreen(court: court, onBooked: addBooking),
              ),
            );
          },
        ),
      ),
    );
  }

  void toggleCourt(Court court) {
    setState(() {
      final index = courts.indexWhere((item) => item.id == court.id);

      if (index != -1) {
        courts[index] = court.copyWith(isActive: !court.isActive);
      }
    });
  }

  void cancelBooking(Booking booking) {
    final index = bookings.indexWhere((item) => item.id == booking.id);

    if (index == -1) return;
    if (bookings[index].status == 'Đã hủy') return;

    setState(() {
      bookings[index] = bookings[index].copyWith(status: 'Đã hủy');
    });
  }

  void updatePayment(
    Booking booking, {
    required String paymentStatus,
    required String paymentMethod,
  }) {
    final index = bookings.indexWhere((item) => item.id == booking.id);

    if (index == -1) return;

    final current = bookings[index];

    if (current.status == 'Đã hủy') return;
    if (current.paymentStatus == 'Đã thanh toán') return;

    setState(() {
      bookings[index] = current.copyWith(
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
        status: paymentStatus == 'Đã thanh toán'
            ? 'Đã xác nhận'
            : current.status,
      );
    });
  }

  void addCourt(Court court) {
    final exists = courts.any((item) => item.id == court.id);

    if (exists) return;

    setState(() {
      courts.add(court);
    });
  }

  @override
  Widget build(BuildContext context) {
    final List<Widget> pages;

    if (isCustomer) {
      pages = <Widget>[
        HomeScreen(
          courts: courts,
          onOpenSearch: () {
            setState(() => tab = 1);
          },
          onBook: openCourt,
        ),
        SearchScreen(courts: courts, onBook: openCourt),
        BookingHistoryScreen(
          bookings: bookings,
          onCancelBooking: cancelBooking,
          onPaymentUpdate: updatePayment,
          canConfirmVenuePayment: false,
        ),
        ProfileScreen(role: role),
      ];
    } else {
      pages = <Widget>[
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
          canConfirmVenuePayment: true,
        ),
        ProfileScreen(role: role),
      ];
    }

    final List<NavigationDestination> destinations;

    if (isCustomer) {
      destinations = const <NavigationDestination>[
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Trang chủ',
        ),
        NavigationDestination(
          icon: Icon(Icons.search),
          selectedIcon: Icon(Icons.search),
          label: 'Tìm sân',
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
      ];
    } else {
      destinations = const <NavigationDestination>[
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
    }

    final safeTab = tab.clamp(0, pages.length - 1);

    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: safeTab, children: pages),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeTab,
        onDestinationSelected: (value) {
          setState(() {
            tab = value;
          });
        },
        destinations: destinations,
      ),
    );
  }
}
