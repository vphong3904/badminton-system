import 'package:flutter/material.dart';

import '../models/booking.dart';
import '../models/court.dart';
import '../utils/formatters.dart';
import '../widgets/status_badge.dart';

class RoleDashboardScreen extends StatelessWidget {
  final String role;
  final List<Court> courts;
  final List<Booking> bookings;
  final ValueChanged<String> onRoleChanged;
  final ValueChanged<Court> onAddCourt;
  final ValueChanged<Court> onToggleCourt;
  final ValueChanged<Booking> onCancelBooking;

  const RoleDashboardScreen({
    super.key,
    required this.role,
    required this.courts,
    required this.bookings,
    required this.onRoleChanged,
    required this.onAddCourt,
    required this.onToggleCourt,
    required this.onCancelBooking,
  });

  bool get isAdmin => role == 'Admin';

  @override
  Widget build(BuildContext context) {
    final revenue = bookings
        .where((booking) => booking.status != 'Đã hủy')
        .fold<int>(0, (sum, booking) => sum + booking.totalPrice);

    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                isAdmin ? 'Quản trị hệ thống' : 'Quản lý sân',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            PopupMenuButton<String>(
              tooltip: 'Đổi vai trò demo',
              onSelected: onRoleChanged,
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'Khách hàng',
                  child: Text('Chế độ khách hàng'),
                ),
                PopupMenuItem(
                  value: 'Quản lý sân',
                  child: Text('Chế độ quản lý sân'),
                ),
                PopupMenuItem(value: 'Admin', child: Text('Chế độ Admin')),
              ],
              child: const CircleAvatar(child: Icon(Icons.swap_horiz)),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          isAdmin
              ? 'Tổng quan nền tảng đặt sân'
              : 'Theo dõi hoạt động sân và lịch đặt',
        ),
        const SizedBox(height: 18),

        // Các số liệu tổng quan.
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 1.55,
          children: [
            _metric('Tổng số sân', '${courts.length}', Icons.sports_tennis),
            _metric(
              'Sân hoạt động',
              '${courts.where((court) => court.isActive).length}',
              Icons.check_circle_outline,
            ),
            _metric(
              'Lịch đặt demo',
              '${bookings.length}',
              Icons.calendar_month,
            ),
            _metric(
              'Doanh thu dự kiến',
              formatMoney(revenue),
              Icons.payments_outlined,
            ),
          ],
        ),

        const SizedBox(height: 24),

        // Danh sách sân.
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              isAdmin ? 'Quản lý đơn vị sân' : 'Danh sách sân',
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
            ),
            IconButton(
              tooltip: 'Thêm sân',
              onPressed: () => _showAddCourt(context),
              icon: const Icon(Icons.add_circle, color: Color(0xFF16845B)),
            ),
          ],
        ),

        ...courts.map(
          (court) => Card(
            color: Colors.white,
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: Color(0xFFDDF1E5),
                child: Icon(Icons.sports_tennis, color: Color(0xFF16845B)),
              ),
              title: Text(court.name),
              subtitle: Text(
                '${court.address}\n'
                '${formatMoney(court.pricePerHour)}/giờ • '
                '${court.isActive ? "Đang hoạt động" : "Tạm ngưng"}',
              ),
              isThreeLine: true,
              trailing: Switch(
                value: court.isActive,
                onChanged: (_) => onToggleCourt(court),
              ),
            ),
          ),
        ),

        const SizedBox(height: 20),

        // Lịch đặt gần đây.
        Text(
          isAdmin ? 'Giám sát đặt sân toàn hệ thống' : 'Lịch đặt gần đây',
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
        ),

        if (bookings.isEmpty)
          const Padding(
            padding: EdgeInsets.all(18),
            child: Text('Chưa có lịch đặt nào.', textAlign: TextAlign.center),
          ),

        ...bookings.map(
          (booking) => Card(
            color: Colors.white,
            child: ListTile(
              title: Text(booking.court.name),
              subtitle: Text(
                '${formatDate(booking.date)} • ${booking.timeSlot}\n'
                '${formatMoney(booking.totalPrice)}\n'
                'Thanh toán: ${booking.paymentStatus}',
              ),
              isThreeLine: true,
              trailing: PopupMenuButton<String>(
                tooltip: 'Thao tác đặt sân',
                onSelected: (value) {
                  if (value == 'cancel') {
                    onCancelBooking(booking);
                  }
                },
                itemBuilder: (_) => [
                  if (booking.status != 'Đã hủy')
                    const PopupMenuItem(
                      value: 'cancel',
                      child: Text('Đánh dấu đã hủy'),
                    ),
                ],
                child: StatusBadge(status: booking.status),
              ),
            ),
          ),
        ),

        const SizedBox(height: 16),

        const Text(
          'Dữ liệu demo trong bộ nhớ thiết bị; '
          'số liệu không phải doanh thu thực tế.',
          style: TextStyle(color: Colors.grey, fontSize: 11),
        ),
      ],
    );
  }

  Widget _metric(String title, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icon, color: const Color(0xFF16845B)),
          Text(
            value,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
          ),
          Text(title, style: const TextStyle(color: Colors.grey, fontSize: 12)),
        ],
      ),
    );
  }

  Future<void> _showAddCourt(BuildContext context) async {
    final nameController = TextEditingController();
    final addressController = TextEditingController();
    final priceController = TextEditingController(text: '70000');
    final formKey = GlobalKey<FormState>();

    try {
      final result = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(isAdmin ? 'Thêm sân vào hệ thống' : 'Thêm sân mới'),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(
                    controller: nameController,
                    decoration: const InputDecoration(labelText: 'Tên sân'),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Nhập tên sân';
                      }
                      return null;
                    },
                  ),
                  TextFormField(
                    controller: addressController,
                    decoration: const InputDecoration(labelText: 'Địa chỉ'),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Nhập địa chỉ';
                      }
                      return null;
                    },
                  ),
                  TextFormField(
                    controller: priceController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Giá mỗi giờ (VNĐ)',
                    ),
                    validator: (value) {
                      final price = int.tryParse(value ?? '');

                      if (price == null || price <= 0) {
                        return 'Nhập giá hợp lệ lớn hơn 0';
                      }

                      return null;
                    },
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(dialogContext, false);
              },
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () {
                if (formKey.currentState!.validate()) {
                  Navigator.pop(dialogContext, true);
                }
              },
              child: const Text('Thêm'),
            ),
          ],
        ),
      );

      if (result != true) {
        return;
      }

      final newCourt = Court(
        id: 'C${DateTime.now().millisecondsSinceEpoch}',
        name: nameController.text.trim(),
        address: addressController.text.trim(),
        pricePerHour: int.parse(priceController.text.trim()),
        rating: 0,
        numberOfCourts: 1,
      );

      onAddCourt(newCourt);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã thêm sân vào dữ liệu demo.')),
        );
      }
    } finally {
      nameController.dispose();
      addressController.dispose();
      priceController.dispose();
    }
  }
}
