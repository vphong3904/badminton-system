import 'package:flutter/material.dart';

import '../models/court.dart';
import '../models/booking.dart';
import '../data/sample_data.dart';
import '../utils/formatters.dart';

const green = Color(0xFF16845B);

class FeaturePage extends StatelessWidget {
  final String title;
  final IconData icon;
  final String description;
  final List<String> items;

  const FeaturePage({
    super.key,
    required this.title,
    required this.icon,
    required this.description,
    this.items = const [],
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFFE1F4E9),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              children: [
                Icon(icon, size: 48, color: green),
                const SizedBox(height: 10),
                Text(
                  description,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ...items.map(
            (item) => Card(
              color: Colors.white,
              child: ListTile(
                leading: const Icon(Icons.check_circle_outline, color: green),
                title: Text(item),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// Đăng nhập và đăng ký demo.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool isLogin = true;
  bool obscure = true;

  final name = TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();

  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(isLogin ? 'Đăng nhập' : 'Tạo tài khoản')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Icon(Icons.sports_tennis, size: 70, color: green),
          const SizedBox(height: 12),
          Text(
            isLogin ? 'Chào mừng bạn trở lại!' : 'Tham gia Badminton Booking',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 22),
          if (!isLogin)
            TextField(
              controller: name,
              decoration: const InputDecoration(
                labelText: 'Họ và tên',
                prefixIcon: Icon(Icons.person_outline),
                border: OutlineInputBorder(),
              ),
            ),
          if (!isLogin) const SizedBox(height: 12),
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email hoặc số điện thoại',
              prefixIcon: Icon(Icons.mail_outline),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: password,
            obscureText: obscure,
            decoration: InputDecoration(
              labelText: 'Mật khẩu',
              prefixIcon: const Icon(Icons.lock_outline),
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(obscure ? Icons.visibility : Icons.visibility_off),
                onPressed: () {
                  setState(() => obscure = !obscure);
                },
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const FeaturePage(
                      title: 'Quên mật khẩu',
                      icon: Icons.lock_reset,
                      description:
                          'Nhập email để nhận hướng dẫn đặt lại mật khẩu.',
                    ),
                  ),
                );
              },
              child: const Text('Quên mật khẩu?'),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    'Đây là giao diện demo. Cần backend để xác thực '
                    '${isLogin ? "đăng nhập" : "đăng ký"}.',
                  ),
                ),
              );
            },
            child: Text(isLogin ? 'Đăng nhập' : 'Đăng ký'),
          ),
          TextButton(
            onPressed: () => setState(() => isLogin = !isLogin),
            child: Text(
              isLogin
                  ? 'Chưa có tài khoản? Đăng ký'
                  : 'Đã có tài khoản? Đăng nhập',
            ),
          ),
        ],
      ),
    );
  }
}

// Bộ lọc chi tiết.
class FilterScreen extends StatefulWidget {
  const FilterScreen({super.key});

  @override
  State<FilterScreen> createState() => _FilterScreenState();
}

class _FilterScreenState extends State<FilterScreen> {
  RangeValues price = const RangeValues(20000, 150000);
  String area = 'Tất cả khu vực';
  DateTime date = DateTime.now();
  String time = '18:00';
  int duration = 60;

  void resetFilters() {
    setState(() {
      price = const RangeValues(20000, 150000);
      area = 'Tất cả khu vực';
      date = DateTime.now();
      duration = 60;
      time = '18:00';
    });
  }

  @override
  Widget build(BuildContext context) {
    const areas = [
      'Tất cả khu vực',
      'Quận 1',
      'Quận 3',
      'Bình Thạnh',
      'Thủ Đức',
    ];

    const times = [
      '06:00',
      '08:00',
      '10:00',
      '14:00',
      '16:00',
      '18:00',
      '19:00',
      '20:00',
    ];

    const durations = [60, 90, 120, 150, 180];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Bộ lọc chi tiết'),
        actions: [
          TextButton(onPressed: resetFilters, child: const Text('Đặt lại')),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Khu vực', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: area,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: areas
                .map(
                  (value) => DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  ),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) setState(() => area = value);
            },
          ),
          const SizedBox(height: 20),
          const Text(
            'Ngày đặt sân',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          OutlinedButton.icon(
            onPressed: () async {
              final selectedDate = await showDatePicker(
                context: context,
                initialDate: date,
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 180)),
              );

              if (selectedDate != null && mounted) {
                setState(() => date = selectedDate);
              }
            },
            icon: const Icon(Icons.calendar_month),
            label: Text('${date.day}/${date.month}/${date.year}'),
          ),
          const SizedBox(height: 14),
          const Text(
            'Giờ bắt đầu',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          DropdownButtonFormField<String>(
            initialValue: time,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: times
                .map(
                  (value) => DropdownMenuItem<String>(
                    value: value,
                    child: Text(value),
                  ),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) setState(() => time = value);
            },
          ),
          const SizedBox(height: 14),
          const Text(
            'Thời lượng thuê',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: durations
                .map(
                  (value) => ChoiceChip(
                    label: Text('$value phút'),
                    selected: duration == value,
                    onSelected: (_) {
                      setState(() => duration = value);
                    },
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 14),
          Text(
            'Khoảng giá: ${formatMoney(price.start.round())} – '
            '${formatMoney(price.end.round())} / giờ',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          RangeSlider(
            values: price,
            min: 20000,
            max: 150000,
            divisions: 13,
            onChanged: (value) => setState(() => price = value),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              Navigator.pop(context, {
                'area': area,
                'date': date,
                'time': time,
                'duration': duration,
                'min': price.start,
                'max': price.end,
              });
            },
            child: const Text('Áp dụng bộ lọc'),
          ),
        ],
      ),
    );
  }
}

// Danh sách sân yêu thích demo.
class FavoritesScreen extends StatefulWidget {
  final List<Court> courts;

  const FavoritesScreen({super.key, this.courts = sampleCourts});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  late Set<String> saved;

  @override
  void initState() {
    super.initState();
    saved = widget.courts.take(2).map((court) => court.id).toSet();
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.courts
        .where((court) => saved.contains(court.id))
        .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Sân yêu thích')),
      body: items.isEmpty
          ? const Center(
              child: Text(
                '♡\nBạn chưa có sân yêu thích',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: items
                  .map(
                    (court) => Card(
                      color: Colors.white,
                      child: ListTile(
                        leading: const CircleAvatar(
                          child: Icon(Icons.sports_tennis),
                        ),
                        title: Text(court.name),
                        subtitle: Text(
                          '${court.address}\n'
                          '${formatMoney(court.pricePerHour)}/giờ',
                        ),
                        isThreeLine: true,
                        trailing: IconButton(
                          icon: const Icon(Icons.favorite, color: Colors.red),
                          onPressed: () {
                            setState(() => saved.remove(court.id));
                          },
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
    );
  }
}

// Thông báo demo.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final Set<int> read = {};

  final List<Map<String, Object>> notices = const [
    {
      'title': 'Đặt sân thành công',
      'message': 'Lịch đặt sân của bạn đã được ghi nhận.',
      'icon': Icons.check_circle,
    },
    {
      'title': 'Nhắc lịch chơi',
      'message': 'Bạn có lịch chơi lúc 19:00 hôm nay.',
      'icon': Icons.alarm,
    },
    {
      'title': 'Ưu đãi cuối tuần',
      'message': 'Khám phá các sân có giá tốt gần bạn.',
      'icon': Icons.local_offer,
    },
    {
      'title': 'Thanh toán đang chờ',
      'message': 'Vui lòng hoàn tất thanh toán trong thời gian giữ sân.',
      'icon': Icons.payment,
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thông báo'),
        actions: [
          TextButton(
            onPressed: () {
              setState(() {
                read.addAll(
                  List<int>.generate(notices.length, (index) => index),
                );
              });
            },
            child: const Text('Đọc tất cả'),
          ),
        ],
      ),
      body: ListView(
        children: List.generate(notices.length, (index) {
          final notice = notices[index];
          final isRead = read.contains(index);

          return ListTile(
            leading: CircleAvatar(
              backgroundColor: isRead
                  ? Colors.grey.shade200
                  : const Color(0xFFDDF3E5),
              child: Icon(notice['icon'] as IconData, color: green),
            ),
            title: Text(
              notice['title'] as String,
              style: TextStyle(
                fontWeight: isRead ? FontWeight.normal : FontWeight.bold,
              ),
            ),
            subtitle: Text(notice['message'] as String),
            trailing: isRead
                ? null
                : const CircleAvatar(radius: 4, backgroundColor: green),
            onTap: () {
              setState(() => read.add(index));
            },
          );
        }),
      ),
    );
  }
}

// Chỉnh sửa hồ sơ demo.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final name = TextEditingController(text: 'Người dùng demo');
  final phone = TextEditingController(text: '09xx xxx xxx');
  final email = TextEditingController(text: 'user@example.com');

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chỉnh sửa hồ sơ')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Center(
            child: CircleAvatar(
              radius: 42,
              child: Icon(Icons.person, size: 44),
            ),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: name,
            decoration: const InputDecoration(
              labelText: 'Họ và tên',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Số điện thoại',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Demo: cần backend để lưu hồ sơ.'),
                ),
              );
              Navigator.pop(context);
            },
            child: const Text('Lưu thay đổi'),
          ),
        ],
      ),
    );
  }
}

// Thanh toán mô phỏng.
class PaymentScreen extends StatefulWidget {
  final Booking? booking;

  const PaymentScreen({super.key, this.booking});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  @override
  Widget build(BuildContext context) {
    final booking = widget.booking;

    return Scaffold(
      appBar: AppBar(title: const Text('Thanh toán đặt sân')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  const Text(
                    'QUÉT MÃ QR ĐỂ THANH TOÁN',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    width: 190,
                    height: 190,
                    decoration: BoxDecoration(
                      border: Border.all(color: green, width: 2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.qr_code_2, size: 160),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    formatMoney(booking?.totalPrice ?? 90000),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: green,
                    ),
                  ),
                  const Text(
                    'Ngân hàng / mã QR minh họa',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          _line('Mã giao dịch', booking?.id ?? 'DEMO-BOOKING-001'),
          _line('Sân', booking?.court.name ?? 'Sân đã chọn'),
          _line('Trạng thái', 'Chờ thanh toán'),
          const SizedBox(height: 16),
          const Text(
            'Lưu ý: Đây là màn hình mô phỏng. Không chuyển tiền thật; '
            'xác minh giao dịch cần backend/cổng thanh toán.',
            style: TextStyle(color: Colors.deepOrange),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () {
              showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Chưa kết nối ngân hàng'),
                  content: const Text(
                    'Ứng dụng chưa thể tự xác nhận thanh toán. '
                    'Khi tích hợp backend, trạng thái sẽ được cập nhật '
                    'từ kết quả xác minh.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      child: const Text('Đã hiểu'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('Tôi đã thanh toán – kiểm tra'),
          ),
        ],
      ),
    );
  }

  Widget _line(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: const TextStyle(color: Colors.grey)),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

// Lịch sử thanh toán demo.
class TransactionHistoryScreen extends StatelessWidget {
  const TransactionHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const FeaturePage(
      title: 'Lịch sử thanh toán',
      icon: Icons.receipt_long,
      description: 'Theo dõi các giao dịch và trạng thái hoàn tiền.',
      items: [
        'Giao dịch DEMO-001 • Chờ thanh toán',
        'Giao dịch DEMO-002 • Đã thanh toán',
        'Không có dữ liệu ngân hàng thật trong bản demo',
      ],
    );
  }
}

// Đăng ký chủ sân demo.
class OwnerRegistrationScreen extends StatefulWidget {
  const OwnerRegistrationScreen({super.key});

  @override
  State<OwnerRegistrationScreen> createState() =>
      _OwnerRegistrationScreenState();
}

class _OwnerRegistrationScreenState extends State<OwnerRegistrationScreen> {
  final facility = TextEditingController();
  final address = TextEditingController();
  final phone = TextEditingController();

  @override
  void dispose() {
    facility.dispose();
    address.dispose();
    phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Đăng ký chủ sân')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Thông tin cơ sở',
            style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: facility,
            decoration: const InputDecoration(
              labelText: 'Tên cơ sở sân',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: address,
            decoration: const InputDecoration(
              labelText: 'Địa chỉ cơ sở',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Số điện thoại liên hệ',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Hồ sơ sẽ ở trạng thái chờ duyệt. '
            'Bản demo chưa gửi dữ liệu lên máy chủ.',
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () {
              if (facility.text.trim().isEmpty ||
                  address.text.trim().isEmpty ||
                  phone.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Vui lòng nhập đầy đủ thông tin.'),
                  ),
                );
                return;
              }

              showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Đã tạo yêu cầu demo'),
                  content: const Text(
                    'Trong bản có backend, yêu cầu sẽ được gửi '
                    'Admin phê duyệt.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () {
                        Navigator.pop(dialogContext);
                        Navigator.pop(context);
                      },
                      child: const Text('Đóng'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('Gửi hồ sơ xét duyệt'),
          ),
        ],
      ),
    );
  }
}

// Quản lý sân demo.
class OwnerManagementScreen extends StatelessWidget {
  const OwnerManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Quản lý sân của tôi')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(child: _stat('Lượt đặt hôm nay', '12')),
              const SizedBox(width: 10),
              Expanded(child: _stat('Doanh thu demo', '1,2tr')),
            ],
          ),
          const SizedBox(height: 18),
          const Text(
            'Quản lý cơ sở',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          ...sampleCourts.map(
            (court) => Card(
              color: Colors.white,
              child: ListTile(
                leading: const Icon(Icons.sports_tennis, color: green),
                title: Text(court.name),
                subtitle: Text(
                  '${court.numberOfCourts} sân • '
                  '${formatMoney(court.pricePerHour)}/giờ',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => FeaturePage(
                        title: court.name,
                        icon: Icons.edit,
                        description:
                            'Quản lý thông tin, giá và trạng thái sân.',
                        items: const [
                          'Cập nhật thông tin cơ sở',
                          'Thiết lập giờ hoạt động',
                          'Xem lịch sân',
                          'Quản lý giá thuê',
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const FeaturePage(
                    title: 'Lịch sân',
                    icon: Icons.calendar_month,
                    description: 'Theo dõi các khung giờ đã đặt và còn trống.',
                    items: [
                      '06:00 – 08:00 • Còn trống',
                      '18:00 – 19:00 • Đã đặt',
                      '19:00 – 20:00 • Chờ xác nhận',
                    ],
                  ),
                ),
              );
            },
            icon: const Icon(Icons.calendar_month),
            label: const Text('Xem lịch sân'),
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Card(
      color: const Color(0xFFE1F4E9),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: green,
              ),
            ),
            Text(label, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

// Chi tiết đặt sân.
class BookingDetailScreen extends StatelessWidget {
  final Booking booking;

  const BookingDetailScreen({super.key, required this.booking});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chi tiết đặt sân')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    booking.court.name,
                    style: const TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(booking.court.address),
                  const Divider(height: 28),
                  _row('Mã đặt sân', booking.id),
                  _row('Ngày chơi', formatDate(booking.date)),
                  _row('Giờ bắt đầu', booking.timeSlot),
                  _row('Thời lượng', '${booking.durationMinutes} phút'),
                  _row('Tổng tiền', formatMoney(booking.totalPrice)),
                  _row('Trạng thái đặt sân', booking.status),
                  _row(
                    'Thanh toán',
                    booking.status == 'Đã xác nhận'
                        ? 'Đã thanh toán'
                        : 'Chờ thanh toán',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          if (booking.status.toLowerCase().contains('chờ'))
            FilledButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PaymentScreen(booking: booking),
                  ),
                );
              },
              child: const Text('Tiếp tục thanh toán'),
            ),
          OutlinedButton(
            onPressed: () {
              showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Hủy đặt sân?'),
                  content: const Text(
                    'Bản demo chưa áp dụng chính sách hủy '
                    'và hoàn tiền thực tế.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      child: const Text('Đóng'),
                    ),
                  ],
                ),
              );
            },
            child: const Text('Yêu cầu hủy đặt sân'),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: const TextStyle(color: Colors.grey)),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
