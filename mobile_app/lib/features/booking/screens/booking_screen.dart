import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/models/booking_model.dart';
import 'package:flutter_application_1/models/court_model.dart';

// ============================================================
// CÁC KIỂU CALLBACK THANH TOÁN
// ============================================================

typedef BookingPaymentUpdate = void Function(
  Booking booking, {
  required String paymentStatus,
  required String paymentMethod,
  String? transactionId,
  DateTime? paidAt,
  String? paymentProof,
});

typedef CreateOnlinePaymentCallback = Future<OnlinePaymentRequest?> Function(
  Booking booking,
  String provider,
);

typedef VerifyOnlinePaymentCallback =
    Future<OnlinePaymentVerification?> Function(
  Booking booking,
  String transactionId,
);

// Kết quả tạo giao dịch do backend trả về.
class OnlinePaymentRequest {
  final String transactionId;
  final String checkoutUrl;

  const OnlinePaymentRequest({
    required this.transactionId,
    required this.checkoutUrl,
  });
}

// Kết quả xác minh giao dịch do backend trả về.
class OnlinePaymentVerification {
  final bool isSuccess;
  final String transactionId;
  final DateTime paidAt;
  final String proofReference;
  final String message;

  const OnlinePaymentVerification({
    required this.isSuccess,
    required this.transactionId,
    required this.paidAt,
    required this.proofReference,
    required this.message,
  });
}

// ============================================================
// MÀN HÌNH ĐẶT SÂN
// ============================================================

class BookingScreen extends StatefulWidget {
  final Court court;
  final ValueChanged<Booking> onBooked;
  final BookingPaymentUpdate? onPaymentUpdate;
  final CreateOnlinePaymentCallback? onCreatePayment;
  final VerifyOnlinePaymentCallback? onVerifyPayment;

  // Callback báo AppShell chuyển về Trang chủ khi hoàn tất.
  final VoidCallback? onPaymentCompleted;

  const BookingScreen({
    super.key,
    required this.court,
    required this.onBooked,
    this.onPaymentUpdate,
    this.onCreatePayment,
    this.onVerifyPayment,
    this.onPaymentCompleted,
  });

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  DateTime _ngayChon = DateUtils.dateOnly(DateTime.now());
  String _gioBatDau = '08:00';
  int _thoiLuong = 60;
  bool _dangTaoDatSan = false;

  final List<String> _danhSachGio = const [
    '06:00',
    '07:00',
    '08:00',
    '09:00',
    '10:00',
    '11:00',
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
    '18:00',
    '19:00',
    '20:00',
    '21:00',
  ];

  final List<int> _danhSachThoiLuong = const [30, 60, 90, 120];

  int get _tongTien =>
      (widget.court.pricePerHour * _thoiLuong / 60).round();

  String _dinhDangNgay(DateTime ngay) {
    final ngayText = ngay.day.toString().padLeft(2, '0');
    final thangText = ngay.month.toString().padLeft(2, '0');
    return '$ngayText/$thangText/${ngay.year}';
  }

  String _dinhDangThoiLuong(int phut) {
    if (phut < 60) return '$phut phút';
    final gio = phut ~/ 60;
    final phutConLai = phut % 60;
    if (phutConLai == 0) return '$gio giờ';
    return '$gio giờ $phutConLai phút';
  }

  // Chọn ngày đặt sân.
  Future<void> _chonNgay() async {
    final homNay = DateUtils.dateOnly(DateTime.now());

    final ngayDuocChon = await showDatePicker(
      context: context,
      initialDate: _ngayChon,
      firstDate: homNay,
      lastDate: homNay.add(const Duration(days: 90)),
      helpText: 'Chọn ngày chơi',
      cancelText: 'Hủy',
      confirmText: 'Xác nhận',
    );

    if (!mounted || ngayDuocChon == null) return;

    setState(() {
      _ngayChon = DateUtils.dateOnly(ngayDuocChon);
    });
  }

  // Tạo lượt đặt sân và chuyển sang màn hình thanh toán.
  Future<void> _xacNhanDatSan() async {
    if (_dangTaoDatSan) return;

    setState(() {
      _dangTaoDatSan = true;
    });

    try {
      final datSanMoi = Booking(
        id: 'BK${DateTime.now().millisecondsSinceEpoch}',
        court: widget.court,
        date: _ngayChon,
        timeSlot: _gioBatDau,
        durationMinutes: _thoiLuong,
        totalPrice: _tongTien,
        status: 'Chờ xác nhận',
        paymentStatus: 'Chờ thanh toán',
        paymentMethod: 'Thanh toán trực tuyến',
      );

      // Lưu lịch đặt với trạng thái chờ thanh toán.
      widget.onBooked(datSanMoi);

      if (!mounted) return;

      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => OnlinePaymentScreen(
            booking: datSanMoi,
            onPaymentUpdate: widget.onPaymentUpdate,
            onCreatePayment: widget.onCreatePayment,
            onVerifyPayment: widget.onVerifyPayment,
            onPaymentCompleted: widget.onPaymentCompleted,
          ),
        ),
      );
    } catch (loi) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Không thể tạo lịch đặt: $loi'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _dangTaoDatSan = false;
        });
      }
    }
  }

  Widget _tieuDeMuc(String tieuDe, IconData bieuTuong) {
    return Row(
      children: [
        Icon(bieuTuong, color: const Color(0xFF16845B)),
        const SizedBox(width: 9),
        Text(
          tieuDe,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }

  Widget _dongThongTin(String nhan, String giaTri) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          nhan,
          style: TextStyle(color: Colors.grey.shade700),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            giaTri,
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }

  Widget _theThongTinSan() {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: const Color(0xFFE5F3EB),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.sports_tennis,
              color: Color(0xFF16845B),
              size: 28,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.court.name,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  widget.court.address,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '${formatMoney(widget.court.pricePerHour)}/giờ',
                  style: const TextStyle(
                    color: Color(0xFF16845B),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chonGio() {
    return Wrap(
      spacing: 9,
      runSpacing: 9,
      children: _danhSachGio.map((gio) {
        final dangChon = _gioBatDau == gio;

        return ChoiceChip(
          label: Text(gio),
          selected: dangChon,
          onSelected: (_) {
            setState(() {
              _gioBatDau = gio;
            });
          },
          selectedColor: const Color(0xFF16845B),
          backgroundColor: Colors.white,
          labelStyle: TextStyle(
            color: dangChon ? Colors.white : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        );
      }).toList(),
    );
  }

  Widget _chonThoiLuong() {
    return Wrap(
      spacing: 9,
      runSpacing: 9,
      children: _danhSachThoiLuong.map((phut) {
        final dangChon = _thoiLuong == phut;

        return ChoiceChip(
          label: Text(_dinhDangThoiLuong(phut)),
          selected: dangChon,
          onSelected: (_) {
            setState(() {
              _thoiLuong = phut;
            });
          },
          selectedColor: const Color(0xFF16845B),
          backgroundColor: Colors.white,
          labelStyle: TextStyle(
            color: dangChon ? Colors.white : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        );
      }).toList(),
    );
  }

  Widget _theTongKet() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F8F4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD6EADF)),
      ),
      child: Column(
        children: [
          _dongThongTin('Tên sân', widget.court.name),
          const SizedBox(height: 12),
          _dongThongTin('Ngày chơi', _dinhDangNgay(_ngayChon)),
          const SizedBox(height: 12),
          _dongThongTin('Giờ bắt đầu', _gioBatDau),
          const SizedBox(height: 12),
          _dongThongTin(
            'Thời lượng',
            _dinhDangThoiLuong(_thoiLuong),
          ),
          const Divider(height: 26),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Tổng tiền',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                formatMoney(_tongTien),
                style: const TextStyle(
                  color: Color(0xFF16845B),
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),
      appBar: AppBar(
        title: const Text('Đặt sân'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF10583F),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _tieuDeMuc('Thông tin sân', Icons.sports_tennis),
              const SizedBox(height: 12),
              _theThongTinSan(),
              const SizedBox(height: 24),

              _tieuDeMuc('Chọn ngày chơi', Icons.calendar_month),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _chonNgay,
                  icon: const Icon(Icons.calendar_today),
                  label: Text(_dinhDangNgay(_ngayChon)),
                ),
              ),
              const SizedBox(height: 24),

              _tieuDeMuc('Chọn giờ bắt đầu', Icons.access_time),
              const SizedBox(height: 12),
              _chonGio(),
              const SizedBox(height: 24),

              _tieuDeMuc('Chọn thời lượng', Icons.timelapse),
              const SizedBox(height: 12),
              _chonThoiLuong(),
              const SizedBox(height: 24),

              _tieuDeMuc('Thông tin thanh toán', Icons.receipt_long),
              const SizedBox(height: 12),
              _theTongKet(),
              const SizedBox(height: 16),

              Container(
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF8E7),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, color: Colors.orange),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Lịch đặt sẽ ở trạng thái chờ thanh toán. '
                        'Chỉ chuyển sang đã xác nhận sau khi hệ thống '
                        'kiểm tra giao dịch thành công.',
                        style: TextStyle(fontSize: 12, height: 1.5),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _dangTaoDatSan ? null : _xacNhanDatSan,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF16845B),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _dangTaoDatSan
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          'Tiếp tục thanh toán',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

// ============================================================
// MÀN HÌNH THANH TOÁN TRỰC TUYẾN
// ============================================================

class OnlinePaymentScreen extends StatefulWidget {
  final Booking booking;
  final BookingPaymentUpdate? onPaymentUpdate;
  final CreateOnlinePaymentCallback? onCreatePayment;
  final VerifyOnlinePaymentCallback? onVerifyPayment;
  final VoidCallback? onPaymentCompleted;

  const OnlinePaymentScreen({
    super.key,
    required this.booking,
    this.onPaymentUpdate,
    this.onCreatePayment,
    this.onVerifyPayment,
    this.onPaymentCompleted,
  });

  @override
  State<OnlinePaymentScreen> createState() =>
      _OnlinePaymentScreenState();
}

class _OnlinePaymentScreenState extends State<OnlinePaymentScreen> {
  String _congThanhToan = 'VNPay';
  bool _dangXuLy = false;
  bool _daThanhToan = false;

  OnlinePaymentRequest? _yeuCauThanhToan;
  OnlinePaymentVerification? _ketQuaXacMinh;
  String? _thongBaoLoi;

  final List<Map<String, String>> _danhSachCong = const [
    {
      'ma': 'VNPay',
      'moTa': 'Thanh toán qua cổng VNPay',
    },
    {
      'ma': 'MoMo',
      'moTa': 'Thanh toán bằng ví MoMo',
    },
    {
      'ma': 'ZaloPay',
      'moTa': 'Thanh toán bằng ví ZaloPay',
    },
  ];

  String _dinhDangThoiGian(DateTime thoiGian) {
    final ngay = thoiGian.day.toString().padLeft(2, '0');
    final thang = thoiGian.month.toString().padLeft(2, '0');
    final gio = thoiGian.hour.toString().padLeft(2, '0');
    final phut = thoiGian.minute.toString().padLeft(2, '0');
    return '$ngay/$thang/${thoiGian.year} $gio:$phut';
  }

  // Tạo giao dịch với backend rồi mở trang thanh toán của cổng.
  Future<void> _taoGiaoDich() async {
    if (_dangXuLy || _daThanhToan) return;

    if (widget.onCreatePayment == null) {
      setState(() {
        _thongBaoLoi =
            'Chưa kết nối API tạo thanh toán. Cần tích hợp backend '
            'với cổng thanh toán trước khi sử dụng chức năng này.';
      });
      return;
    }

    setState(() {
      _dangXuLy = true;
      _thongBaoLoi = null;
    });

    try {
      final yeuCau = await widget.onCreatePayment!(
        widget.booking,
        _congThanhToan,
      );

      if (!mounted) return;

      if (yeuCau == null) {
        setState(() {
          _thongBaoLoi = 'Không thể tạo giao dịch. Vui lòng thử lại.';
        });
        return;
      }

      final diaChi = Uri.tryParse(yeuCau.checkoutUrl);

      if (diaChi == null ||
          !diaChi.hasScheme ||
          (diaChi.scheme != 'https' && diaChi.scheme != 'http')) {
        setState(() {
          _thongBaoLoi = 'Đường dẫn thanh toán không hợp lệ.';
        });
        return;
      }

      setState(() {
        _yeuCauThanhToan = yeuCau;
      });

      final daMo = await launchUrl(
        diaChi,
        mode: LaunchMode.externalApplication,
      );

      if (!mounted) return;

      if (!daMo) {
        setState(() {
          _thongBaoLoi = 'Không thể mở trang thanh toán trên thiết bị.';
        });
      }
    } catch (loi) {
      if (!mounted) return;
      setState(() {
        _thongBaoLoi = 'Lỗi tạo giao dịch: $loi';
      });
    } finally {
      if (mounted) {
        setState(() {
          _dangXuLy = false;
        });
      }
    }
  }

  // Xác minh giao dịch với backend; không cho người dùng tự xác nhận.
  Future<void> _kiemTraThanhToan() async {
    if (_dangXuLy || _daThanhToan) return;

    final yeuCau = _yeuCauThanhToan;

    if (yeuCau == null) {
      setState(() {
        _thongBaoLoi = 'Bạn cần tạo giao dịch thanh toán trước.';
      });
      return;
    }

    if (widget.onVerifyPayment == null) {
      setState(() {
        _thongBaoLoi =
            'Chưa cấu hình API xác minh giao dịch. '
            'Ứng dụng không thể tự đánh dấu đã thanh toán.';
      });
      return;
    }

    setState(() {
      _dangXuLy = true;
      _thongBaoLoi = null;
    });

    try {
      final ketQua = await widget.onVerifyPayment!(
        widget.booking,
        yeuCau.transactionId,
      );

      if (!mounted) return;

      if (ketQua == null || !ketQua.isSuccess) {
        setState(() {
          _thongBaoLoi = ketQua?.message.isNotEmpty == true
              ? ketQua!.message
              : 'Giao dịch chưa thành công hoặc chưa được xác minh.';
        });
        return;
      }

      widget.onPaymentUpdate?.call(
        widget.booking,
        paymentStatus: 'Đã thanh toán',
        paymentMethod: _congThanhToan,
        transactionId: ketQua.transactionId,
        paidAt: ketQua.paidAt,
        paymentProof: ketQua.proofReference,
      );

      setState(() {
        _ketQuaXacMinh = ketQua;
        _daThanhToan = true;
        _thongBaoLoi = null;
      });
    } catch (loi) {
      if (!mounted) return;
      setState(() {
        _thongBaoLoi = 'Lỗi xác minh giao dịch: $loi';
      });
    } finally {
      if (mounted) {
        setState(() {
          _dangXuLy = false;
        });
      }
    }
  }

  // Trở về đúng màn hình gốc AppShell, không trở lại Chi tiết sân.
  void _veTrangChu() {
    widget.onPaymentCompleted?.call();

    Navigator.of(context).popUntil(
      (route) => route.isFirst,
    );
  }

  Widget _dongThongTin(String nhan, String giaTri) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          nhan,
          style: TextStyle(
            color: Colors.grey.shade600,
            fontSize: 13,
          ),
        ),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            giaTri,
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
      ],
    );
  }

  Widget _theThongTinDatSan() {
    final datSan = widget.booking;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          _dongThongTin('Mã đặt sân', datSan.id),
          const Divider(height: 24),
          _dongThongTin('Tên sân', datSan.court.name),
          const SizedBox(height: 13),
          _dongThongTin(
            'Ngày chơi',
            '${datSan.date.day.toString().padLeft(2, '0')}/'
                '${datSan.date.month.toString().padLeft(2, '0')}/'
                '${datSan.date.year}',
          ),
          const SizedBox(height: 13),
          _dongThongTin('Giờ bắt đầu', datSan.timeSlot),
          const SizedBox(height: 13),
          _dongThongTin(
            'Thời lượng',
            '${datSan.durationMinutes} phút',
          ),
          const Divider(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Số tiền cần thanh toán',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                formatMoney(datSan.totalPrice),
                style: const TextStyle(
                  color: Color(0xFF16845B),
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chonCongThanhToan() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 8,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: RadioGroup<String>(
        groupValue: _congThanhToan,
        onChanged: (String? giaTri) {
          if (giaTri == null || _yeuCauThanhToan != null) return;
          setState(() {
            _congThanhToan = giaTri;
          });
        },
        child: Column(
          children: _danhSachCong.map((cong) {
            return RadioListTile<String>(
              value: cong['ma']!,
              contentPadding: EdgeInsets.zero,
              activeColor: const Color(0xFF16845B),
              title: Text(
                cong['ma']!,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                cong['moTa']!,
                style: const TextStyle(fontSize: 12),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _hienThiThongBaoLoi() {
    if (_thongBaoLoi == null) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 15),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: Colors.red.shade700),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              _thongBaoLoi!,
              style: TextStyle(
                color: Colors.red.shade800,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bienLaiThanhToan() {
    final ketQua = _ketQuaXacMinh;
    if (ketQua == null) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF8F2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFB9DEC7)),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.check_circle,
            color: Color(0xFF16845B),
            size: 55,
          ),
          const SizedBox(height: 10),
          const Text(
            'THANH TOÁN THÀNH CÔNG',
            style: TextStyle(
              color: Color(0xFF16845B),
              fontSize: 17,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Giao dịch đã được hệ thống xác minh.',
            style: TextStyle(fontSize: 12),
          ),
          const Divider(height: 28),
          _dongThongTin('Mã đặt sân', widget.booking.id),
          const SizedBox(height: 12),
          _dongThongTin('Mã giao dịch', ketQua.transactionId),
          const SizedBox(height: 12),
          _dongThongTin('Cổng thanh toán', _congThanhToan),
          const SizedBox(height: 12),
          _dongThongTin(
            'Thời gian',
            _dinhDangThoiGian(ketQua.paidAt),
          ),
          const SizedBox(height: 12),
          _dongThongTin('Mã biên lai', ketQua.proofReference),
          const Divider(height: 28),
          _dongThongTin(
            'Tổng thanh toán',
            formatMoney(widget.booking.totalPrice),
          ),
          const SizedBox(height: 16),
          const Text(
            'Vui lòng lưu thông tin giao dịch để đối chiếu khi cần.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7F5),
      appBar: AppBar(
        title: const Text('Thanh toán trực tuyến'),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF10583F),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!_daThanhToan)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE9F5EE),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.lock_outline, color: Color(0xFF16845B)),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Thanh toán qua cổng thanh toán trực tuyến.',
                          style: TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 20),
              const Text(
                'Thông tin đặt sân',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              _theThongTinDatSan(),

              if (!_daThanhToan) ...[
                const SizedBox(height: 24),
                const Text(
                  'Chọn phương thức thanh toán',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                _chonCongThanhToan(),
                _hienThiThongBaoLoi(),
                const SizedBox(height: 20),

                if (_yeuCauThanhToan == null)
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: _dangXuLy ? null : _taoGiaoDich,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16845B),
                        foregroundColor: Colors.white,
                      ),
                      child: _dangXuLy
                          ? const CircularProgressIndicator(
                              color: Colors.white,
                            )
                          : const Text(
                              'Tạo giao dịch và thanh toán',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                    ),
                  )
                else ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'Mã giao dịch: ${_yeuCauThanhToan!.transactionId}\n'
                      'Sau khi thanh toán trên cổng $_congThanhToan, '
                      'hãy quay lại ứng dụng để kiểm tra giao dịch.',
                      style: const TextStyle(fontSize: 13, height: 1.5),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed:
                          _dangXuLy ? null : _kiemTraThanhToan,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF16845B),
                        foregroundColor: Colors.white,
                      ),
                      child: _dangXuLy
                          ? const CircularProgressIndicator(
                              color: Colors.white,
                            )
                          : const Text(
                              'Kiểm tra kết quả thanh toán',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ],
              ],

              if (_daThanhToan) ...[
                _bienLaiThanhToan(),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: _veTrangChu,
                    icon: const Icon(Icons.home_outlined),
                    label: const Text(
                      'Hoàn tất – về Trang chủ',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF16845B),
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}
