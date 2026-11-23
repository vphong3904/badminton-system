import 'package:flutter/material.dart' show DateUtils;

import '../../../core/network/api_client.dart';
import '../../../core/network/api_routes.dart';
import '../../../core/utils/time_utils.dart';
import '../../../models/booking_cluster_model.dart';
import '../../../models/invoice_model.dart';
import '../../../models/schedule_model.dart';
import '../../../models/booking_model.dart';
import '../../../models/court_model.dart';

// API

/// Gọi các API đặt sân và thanh toán của khách hàng.
class BookingApi {
  BookingApi._();

  /// Lịch tất cả sân của cơ sở trong một ngày (không cần đăng nhập).
  static Future<VenueSchedule> fetchSchedule(int venueId, DateTime date) async {
    final data = await ApiClient.get(
      '/khach/co-so/$venueId/lich-ngay',
      query: {'ngay': toApiDate(date)},
    );
    return VenueSchedule.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Tạo đơn đặt sân. Sân được giữ chỗ trong vài phút chờ thanh toán.
  static Future<CreatedBooking> createBooking({
    required int courtId,
    required DateTime date,
    required int startMinute,
    required int endMinute,
    required String name,
    required String phone,
    String? note,
  }) async {
    final trimmedNote = note?.trim() ?? '';
    final data = await ApiClient.post(
      '/khach/dat-san',
      body: {
        'maSan': courtId,
        'ngay': toApiDate(date),
        'gioBatDau': toApiTime(startMinute),
        'gioKetThuc': toApiTime(endMinute),
        'tenKhach': name.trim(),
        'soDienThoai': phone,
        if (trimmedNote.isNotEmpty) 'ghiChu': trimmedNote,
      },
    );
    return CreatedBooking.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Đặt NHIỀU sân / nhiều khung giờ trong một ngày, thanh toán một QR (`POST /khach/dat-san/nhieu`).
  /// Tất cả hoặc không: 409 `cacCumTrung` → [ApiException.data] (đọc bằng [ConflictCluster.listFrom]).
  static Future<CreatedBooking> createMultiBooking({
    required int venueId,
    required DateTime date,
    required List<BookingCluster> clusters,
    required String name,
    required String phone,
    String? note,
  }) async {
    final trimmedNote = note?.trim() ?? '';
    final data = await ApiClient.post(
      '/khach/dat-san/nhieu',
      body: {
        'maCoSo': venueId,
        'ngay': toApiDate(date),
        'tenKhach': name.trim(),
        'soDienThoai': phone,
        if (trimmedNote.isNotEmpty) 'ghiChu': trimmedNote,
        'cacMuc': [for (final cluster in clusters) cluster.toApiItem()],
      },
    );
    return CreatedBooking.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Hóa đơn: số tiền, mã QR, trạng thái và thời gian giữ chỗ còn lại.
  static Future<Invoice> fetchInvoice(int bookingId) async {
    final data = await ApiClient.get('/khach/dat-san/$bookingId/hoa-don-nhap');
    return Invoice.fromJson((data as Map).cast<String, dynamic>());
  }

  /// Gửi ảnh chuyển khoản (PNG/JPG ≤5MB). Backend tự gắn mã đơn, tên, SĐT, số tiền
  /// của đơn cho chủ sân; thanh toán chuyển sang `confirming` (đợi xác nhận).
  /// Mỗi lần gửi thêm 1 chứng từ (không xóa ảnh cũ, tối đa 5 ảnh/đơn).
  /// [transferredAt] (tùy chọn): giờ ghi trên biên lai, gửi dạng "YYYY-MM-DD HH:mm"; backend từ chối nếu ở tương lai.
  static Future<void> uploadTransferProof(
    int bookingId,
    List<int> bytes,
    String filename, {
    DateTime? transferredAt,
  }) async {
    await ApiClient.postFileBytes(
      '/thanh-toan/$bookingId/anh-chuyen-khoan',
      field: 'anhChuyenKhoan',
      bytes: bytes,
      filename: filename,
      fields: transferredAt == null
          ? null
          : {'thoiDiemChuyen': _formatTransferTime(transferredAt)},
    );
  }

  static String _formatTransferTime(DateTime t) {
    String two(int v) => v.toString().padLeft(2, '0');
    return '${t.year}-${two(t.month)}-${two(t.day)} ${two(t.hour)}:${two(t.minute)}';
  }

  /// Đường dẫn lấy danh sách đơn đặt sân của khách đang đăng nhập.
  /// Đổi tại đây nếu backend dùng route khác.
  static const String myBookingsPath = ApiRoutes.myBookings;

  /// Danh sách lịch đặt của khách (cần đăng nhập). [venues] dùng để gắn
  /// thông tin cơ sở (tên, địa chỉ...) vào từng lịch.
  static Future<List<Booking>> fetchMyBookings(List<Court> venues) async {
    final data = await ApiClient.get(myBookingsPath);
    final list = data is List
        ? data
        : (data is Map ? (data['danhSach'] ?? data['cacDon'] ?? const []) : const []);

    final result = <Booking>[];
    for (final item in list as List) {
      if (item is! Map) continue;
      final booking = _bookingFromJson(item.cast<String, dynamic>(), venues);
      if (booking != null) result.add(booking);
    }
    return result;
  }

  static Booking? _bookingFromJson(Map<String, dynamic> j, List<Court> venues) {
    final bookingId = _asInt(j['maDatSan']);
    if (bookingId == null) return null;

    final venueId = _asInt(j['maCoSo']);
    Court? court;
    for (final v in venues) {
      if (venueId != null && v.venueId == venueId) {
        court = v;
        break;
      }
    }
    court ??= Court(
      id: (venueId ?? bookingId).toString(),
      apiId: venueId,
      name: (j['tenCoSo'] as String?) ?? 'Cơ sở',
      address: (j['diaChi'] as String?) ?? '',
      mapLink: (j['linkBanDo'] as String?)?.trim(),
      pricePerHour: 0,
    );

    final start = parseHm((j['gioBatDau'] ?? '00:00').toString());
    final end = parseHm((j['gioKetThuc'] ?? '00:00').toString());
    final date =
        DateTime.tryParse((j['ngay'] ?? '').toString().split('T').first) ??
        DateTime.now();

    final apiStatus = (j['trangThai'] ?? j['trangThaiDatSan'] ?? '').toString();
    final apiPay = (j['trangThaiThanhToan'] ?? '').toString();
    final source = (j['nguon'] ?? 'app').toString();

    // Nhãn thanh toán theo ThanhToan.TrangThai của backend. Đơn không có dòng
    // ThanhToan (dữ liệu mẫu, đơn chủ sân tạo) suy ra từ trạng thái đơn.
    final String paymentStatus;
    switch (apiPay) {
      case 'success':
        paymentStatus = 'Đã thanh toán';
        break;
      case 'pending':
        paymentStatus = 'Chờ thanh toán';
        break;
      case 'confirming':
        paymentStatus = 'Chờ xác nhận'; // khách đã gửi ảnh, đợi chủ sân
        break;
      case 'failed':
      case 'expired':
      case 'late_payment':
        paymentStatus = 'Thanh toán thất bại';
        break;
      default:
        if (source == 'owner') {
          paymentStatus = 'Thanh toán tại sân';
        } else if (apiStatus == 'confirmed' || apiStatus == 'completed') {
          // Đơn app chỉ lên confirmed/completed khi đã thanh toán thành công.
          paymentStatus = 'Đã thanh toán';
        } else if (apiStatus == 'cancelled' || apiStatus == 'expired') {
          paymentStatus = 'Chưa thanh toán';
        } else {
          paymentStatus = 'Chờ thanh toán';
        }
    }
    final paid = paymentStatus == 'Đã thanh toán';

    final String status;
    switch (apiStatus) {
      case 'cancelled':
      case 'expired':
        status = 'Đã hủy';
        break;
      case 'completed':
        status = 'Đã hoàn thành';
        break;
      case 'confirmed':
        status = 'Đã xác nhận';
        break;
      default:
        status = paid ? 'Đã xác nhận' : 'Chờ xác nhận';
    }

    // Chỉ có dữ liệu giao dịch khi thật sự có dòng ThanhToan thành công.
    final bankCode = _asText(j['maGiaoDichNganHang']);

    // Trạng thái hiển thị do backend tính (`trangThaiHienThi`, `nhanTrangThai`, `nhomTrangThai`).
    // Backend cũ chưa trả → dự phòng suy từ 3 cột gốc, cùng bảng với backend.
    final refund = (j['trangThaiHoanTien'] ?? 'none').toString();
    final rejectReason = _asText(j['lyDoTuChoi']);
    final backendCode = _asText(j['trangThaiHienThi']);
    final backendLabel = _asText(j['nhanTrangThai']);
    final backendGroup = _asText(j['nhomTrangThai']);
    final fallbackCode = Booking.deriveDisplayCode(
      apiStatus: apiStatus,
      apiPayment: apiPay,
      refund: refund,
      rejectReason: rejectReason,
    );
    final fallback = Booking.displayFallback[fallbackCode]!;
    final displayStatus = backendCode ?? fallbackCode;
    final statusLabel = backendLabel ?? fallback.label;
    final statusGroup = backendGroup ?? fallback.group;

    return Booking(
      id: (j['maDon'] ?? 'DS$bookingId').toString(),
      court: court,
      date: DateUtils.dateOnly(date),
      timeSlot: toApiTime(start),
      durationMinutes: end > start ? end - start : 0,
      totalPrice: _asInt(j['tongTien'] ?? j['soTien']) ?? 0,
      status: status,
      paymentStatus: paymentStatus,
      paymentMethod: source == 'owner' ? 'Tại sân' : 'Chuyển khoản QR',
      transactionId: bankCode,
      paidAt: paid ? _asDateTime(j['ngayThanhToan']) : null,
      transferContent: _asText(j['noiDungChuyenKhoan']),
      source: source,
      refundStatus: refund,
      refundAmount: _asInt(j['soTienHoan']) ?? 0,
      apiId: bookingId,
      courtName: j['tenSan'] as String?,
      contactName: j['tenKhach'] as String?,
      contactPhone: (j['soDienThoaiLienHe'] ?? j['soDienThoai']) as String?,
      canReview: j['coTheDanhGia'] == true,
      reviewed: j['daDanhGia'] == true,
      reviewStars: _asInt(j['soSaoDanhGia']),
      reviewBookingId: _asInt(j['maDatSanDanhGia']),
      reviewContent: _asText(j['noiDungDanhGia']),
      canEditReview: j['coTheSuaDanhGia'] == true,
      displayStatus: displayStatus,
      statusLabel: statusLabel,
      statusGroup: statusGroup,
      rejectReason: rejectReason,
      canComplain: j['coTheKhieuNai'] == true,
      complained: j['daKhieuNai'] == true,
      slowReview: j['chamDuyet'] == true,
      canCheckIn: j['coTheCheckIn'] == true,
      inCheckInWindow: j['trongCuaSoCheckIn'] == true,
      checkedInAt: _asDateTime(j['thoiDiemCheckIn']),
      refundId: _asInt(j['maHoanTien']),
      refundDetail: _asText(j['trangThaiHoanTienChiTiet']),
      refundProofUrl: _asText(j['anhChungTuHoanUrl']),
      refundDeadline: _asDateTime(j['hanHoan']),
      canConfirmRefund: j['coTheXacNhanNhanHoan'] == true,
    );
  }

  static String? _asText(dynamic v) {
    final text = v?.toString().trim() ?? '';
    return text.isEmpty ? null : text;
  }

  /// BE trả "yyyy-MM-dd HH:mm:ss" (giờ Việt Nam, không múi giờ) hoặc ISO.
  static DateTime? _asDateTime(dynamic v) {
    final text = _asText(v);
    return text == null ? null : DateTime.tryParse(text);
  }

  static int? _asInt(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString().split('.').first);
  }

  /// Huỷ đơn. Đơn đã trả: backend tính tiền hoàn theo chính sách (≥24h 100%, 12–24h 50%,
  /// <12h không hoàn) và gửi yêu cầu hoàn tiền cho chủ sân; chủ sân tự chuyển khoản hoàn lại.
  /// Xem trước tiền hoàn nếu huỷ ngay bây giờ (không ghi DB) — để cảnh báo trước khi khách xác nhận.
  static Future<CancelPreview> previewCancel(int bookingId) async {
    final data = await ApiClient.get('/khach/dat-san/$bookingId/huy-xem-truoc');
    if (data is Map) return CancelPreview.fromJson(data.cast<String, dynamic>());
    return const CancelPreview();
  }

  static Future<CancelResult> cancelBooking(int bookingId) async {
    final data = await ApiClient.post('/khach/dat-san/$bookingId/huy');
    if (data is Map) return CancelResult.fromJson(data.cast<String, dynamic>());
    return const CancelResult();
  }

  /// Check-in tại sân bằng QR (`POST /khach/dat-san/:id/check-in`). Chỉ giờ MÁY CHỦ quyết định đúng/sai cửa sổ.
  /// Lỗi nghiệp vụ ném [ApiException] với `code` = QR_INVALID | QR_OUTDATED | NOT_BOOKING_OWNER | WRONG_COURT |
  /// BOOKING_NOT_PAID | BOOKING_NOT_ELIGIBLE | OUT_OF_WINDOW | ALREADY_CHECKED_IN.
  static Future<CheckInResult> checkIn(int bookingId, CheckInQr qr) async {
    final data = await ApiClient.post(
      '/khach/dat-san/$bookingId/check-in',
      body: {
        'maSan': qr.courtId,
        'token': qr.token,
        'phienBan': qr.version,
        'quetLuc': DateTime.now().toUtc().toIso8601String(),
      },
    );
    if (data is Map) return CheckInResult.fromJson(data.cast<String, dynamic>());
    return const CheckInResult();
  }

  // HOÀN TIỀN (G4.7) — chủ sân tự chuyển khoản hoàn + gửi ẢNH chứng từ; app chỉ nhập TK nhận và xác nhận đã nhận / chưa nhận.

  /// Danh sách ngân hàng cho ô chọn; lỗi/rỗng → danh sách dự phòng để khách vẫn nhập được.
  static Future<List<BankOption>> fetchBanks() async {
    try {
      final data = await ApiClient.get('/tai-khoan/ngan-hang');
      final raw = data is List
          ? data
          : (data is Map ? (data['danhSach'] ?? data['cacNganHang'] ?? const []) : const []);
      final banks = <BankOption>[
        for (final item in raw as List)
          if (item is Map) ?BankOption.tryFromJson(item.cast<String, dynamic>()),
      ];
      return banks.isEmpty ? BankOption.fallback : banks;
    } catch (_) {
      return BankOption.fallback;
    }
  }

  /// Nhập/sửa tài khoản nhận hoàn (`PUT /khach/dat-san/:id/tai-khoan-hoan-tien`). Không bắt buộc:
  /// khách không nhập thì chủ sân gọi SĐT. 404 nếu khoản hoàn không còn ở `waiting_info`/`processing`.
  static Future<void> updateRefundAccount(
    int bookingId, {
    required BankOption bank,
    required String accountNumber,
    required String holderName,
  }) async {
    await ApiClient.put(
      '/khach/dat-san/$bookingId/tai-khoan-hoan-tien',
      body: {
        'tenNganHang': bank.name,
        'maNganHang': bank.code,
        'soTaiKhoan': accountNumber.replaceAll(RegExp(r'[\s-]'), ''),
        'chuTaiKhoan': holderName.trim(),
      },
    );
  }

  /// Khách xác nhận ĐÃ nhận lại tiền (`POST /khach/hoan-tien/:maHoanTien/da-nhan`) → khoản hoàn đóng (`received`).
  /// 409 `REFUND_NOT_SENT` nếu chủ sân chưa chuyển.
  static Future<void> confirmRefundReceived(int refundId) async {
    await ApiClient.post('/khach/hoan-tien/$refundId/da-nhan');
  }

  /// Khách báo CHƯA nhận được tiền (`POST /khach/hoan-tien/:maHoanTien/chua-nhan`, ghi chú tùy chọn ≤255) →
  /// `not_received`: chủ sân được báo chuyển lại, hạn hoàn vẫn tính theo hạn cũ.
  static Future<void> reportRefundNotReceived(int refundId, {String? note}) async {
    final text = note?.trim() ?? '';
    await ApiClient.post(
      '/khach/hoan-tien/$refundId/chua-nhan',
      body: text.isEmpty ? null : {'ghiChu': text.length > 255 ? text.substring(0, 255) : text},
    );
  }
}
