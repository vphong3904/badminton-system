import '../core/utils/time_utils.dart';
import 'court_model.dart';

class Booking {
  final String id;
  final Court court;
  final DateTime date;
  final String timeSlot;
  final int durationMinutes;
  final int totalPrice;

  // Trạng thái lịch đặt sân.
  // Ví dụ: Chờ xác nhận, Đã xác nhận, Đã hoàn thành, Đã hủy.
  final String status;

  // Trạng thái thanh toán riêng biệt với trạng thái đặt sân.
  // Ví dụ: Chờ thanh toán, Chờ xác nhận (đã gửi ảnh), Đã thanh toán, Thanh toán thất bại.
  final String paymentStatus;

  // Chỉ dùng phương thức thanh toán trực tuyến.
  final String paymentMethod;

  // Thông tin giao dịch sau khi backend xác minh (bảng ThanhToan).
  final String? transactionId; // maGiaoDichNganHang (nếu có)
  final DateTime? paidAt; // ngayThanhToan
  final String? transferContent; // noiDungChuyenKhoan (= mã đơn)

  // 'app' = khách đặt qua app (thanh toán QR); 'owner' = chủ sân tạo, trả tại sân.
  final String source;

  // Hoàn tiền (chỉ có khi đơn đã trả tiền rồi bị huỷ): none | waiting_info |
  // processing | refunded | failed.
  final String refundStatus;
  final int refundAmount;

  // Thông tin đơn trên backend (có khi đặt qua API).
  final int? apiId; // maDatSan
  final String? courtName; // tên sân con, vd "Sân 1"
  final String? contactName;
  final String? contactPhone;

  // Trạng thái đánh giá (BE-05a, `GET /khach/dat-san`): backend tính sẵn.
  final bool canReview; // coTheDanhGia: đã chơi xong + thanh toán + chưa đánh giá
  final bool reviewed; // daDanhGia
  final int? reviewStars; // soSaoDanhGia

  // Sửa/xoá đánh giá (BE tính sẵn): buổi đang giữ đánh giá (lịch cố định dùng chung 1 đánh giá) và
  // còn trong 7 ngày + chưa bị ẩn.
  final int? reviewBookingId; // maDatSanDanhGia
  final String? reviewContent; // noiDungDanhGia (mở lại form sửa)
  final bool canEditReview; // coTheSuaDanhGia

  // Trạng thái hiển thị cho khách — BACKEND tính (`trangThaiHienThi`, `nhanTrangThai`,
  // `nhomTrangThai`, `lyDoTuChoi`), app chỉ hiển thị. Xem docs/agent/features/history/api.md.
  final String displayStatus; // awaiting_payment | paid | completed | cancelled_* | expired | ...
  final String statusLabel; // nhãn tiếng Việt hiển thị trên chip
  final String statusGroup; // sap_toi | hoan_thanh | da_huy (tab lọc)
  final String? rejectReason; // lý do chủ sân từ chối ảnh chuyển khoản

  // Khiếu nại chủ sân (backend tính sẵn ở `GET /khach/dat-san`).
  final bool canComplain; // coTheKhieuNai: đơn app đã thanh toán / đã huỷ, chưa khiếu nại
  final bool complained; // daKhieuNai
  final bool slowReview; // chamDuyet: đã gửi ảnh, chủ sân chưa duyệt quá 30 phút → nút "Khiếu nại (Chậm duyệt)"

  // QR check-in (G3, backend tính sẵn ở `GET /khach/dat-san`).
  final bool canCheckIn; // coTheCheckIn: đơn app hợp lệ, chưa check-in, trong ngày chơi, chưa hết giờ
  final bool inCheckInWindow; // trongCuaSoCheckIn: đang trong cửa sổ check-in (giờ máy chủ)
  final DateTime? checkedInAt; // thoiDiemCheckIn

  // Hoàn tiền (G4, backend tính sẵn ở `GET /khach/dat-san`; null khi đơn không có khoản hoàn).
  final int? refundId; // maHoanTien (dùng cho đã nhận / chưa nhận)
  final String? refundDetail; // trangThaiHoanTienChiTiet: waiting_info | processing | refunded | received | not_received | escalated
  final String? refundProofUrl; // anhChungTuHoanUrl: ảnh chủ sân chuyển hoàn
  final DateTime? refundDeadline; // hanHoan
  final bool canConfirmRefund; // coTheXacNhanNhanHoan: chủ sân đã chuyển → khách bấm Đã nhận / Chưa nhận

  const Booking({
    required this.id,
    required this.court,
    required this.date,
    required this.timeSlot,
    required this.durationMinutes,
    required this.totalPrice,
    this.status = 'Chờ xác nhận',
    this.paymentStatus = 'Chờ thanh toán',
    this.paymentMethod = 'Thanh toán trực tuyến',
    this.transactionId,
    this.paidAt,
    this.transferContent,
    this.source = 'app',
    this.refundStatus = 'none',
    this.refundAmount = 0,
    this.apiId,
    this.courtName,
    this.contactName,
    this.contactPhone,
    this.canReview = false,
    this.reviewed = false,
    this.reviewStars,
    this.reviewBookingId,
    this.reviewContent,
    this.canEditReview = false,
    this.displayStatus = 'awaiting_payment',
    this.statusLabel = 'Đã đặt, chờ thanh toán',
    this.statusGroup = 'sap_toi',
    this.rejectReason,
    this.canComplain = false,
    this.complained = false,
    this.slowReview = false,
    this.canCheckIn = false,
    this.inCheckInWindow = false,
    this.checkedInAt,
    this.refundId,
    this.refundDetail,
    this.refundProofUrl,
    this.refundDeadline,
    this.canConfirmRefund = false,
  });

  /// Mã `trangThaiHienThi` dự phòng, CHỈ dùng khi backend cũ chưa trả trường mới (và khi app tự cập nhật
  /// tạm trạng thái trước lần tải lại). Phản chiếu `backend/src/utils/trangThaiDon.js`.
  static String deriveDisplayCode({
    required String apiStatus,
    required String apiPayment,
    String refund = 'none',
    String? rejectReason,
  }) {
    switch (apiStatus) {
      case 'pending_payment':
        if (apiPayment == 'confirming') return 'awaiting_owner_approval';
        if (apiPayment == 'pending' && (rejectReason ?? '').isNotEmpty) {
          return 'payment_rejected';
        }
        return 'awaiting_payment';
      case 'confirmed':
        return 'paid';
      case 'checked_in':
        return 'checked_in';
      case 'completed':
        return 'completed';
      case 'cancelled':
        if (apiPayment != 'success') return 'cancelled_unpaid';
        if (refund == 'processing' || refund == 'waiting_info') return 'cancelled_refund_pending';
        if (refund == 'refunded') return 'cancelled_refunded';
        if (refund == 'received') return 'cancelled_refund_received';
        if (refund == 'failed') return 'cancelled_refund_failed';
        return 'cancelled_no_refund';
      case 'expired':
        if (apiPayment == 'late_payment') {
          return refund == 'refunded' ? 'late_payment_refunded' : 'late_payment_refund_pending';
        }
        return 'expired';
      default:
        return 'unknown';
    }
  }

  /// Nhãn + nhóm tab của từng mã (dự phòng; bản chính do backend trả).
  static const Map<String, ({String label, String group})> displayFallback = {
    'awaiting_payment': (label: 'Đã đặt, chờ thanh toán', group: 'sap_toi'),
    'awaiting_owner_approval': (label: 'Chờ chủ sân duyệt', group: 'sap_toi'),
    'payment_rejected': (label: 'Bị từ chối, gửi lại ảnh', group: 'sap_toi'),
    'paid': (label: 'Thanh toán thành công (đã duyệt)', group: 'sap_toi'),
    'completed': (label: 'Hoàn thành', group: 'hoan_thanh'),
    'cancelled_refund_pending': (label: 'Đã hủy, chờ hoàn tiền', group: 'da_huy'),
    'cancelled_refunded': (label: 'Đã hủy, đã hoàn tiền', group: 'da_huy'),
    'cancelled_refund_received': (label: 'Đã hủy, đã nhận lại tiền', group: 'da_huy'),
    'cancelled_refund_failed': (label: 'Đã hủy, hoàn tiền thất bại', group: 'da_huy'),
    'cancelled_no_refund': (label: 'Đã hủy, không hoàn tiền', group: 'da_huy'),
    'cancelled_unpaid': (label: 'Đã hủy (chưa thanh toán)', group: 'da_huy'),
    'expired': (label: 'Hết hạn giữ chỗ', group: 'da_huy'),
    'late_payment_refund_pending': (label: 'Quá hạn, chờ admin hoàn tiền', group: 'da_huy'),
    'late_payment_refunded': (label: 'Quá hạn, đã hoàn tiền', group: 'da_huy'),
    'checked_in': (label: 'Đã check-in', group: 'sap_toi'),
    'no_show': (label: 'Không đến sân', group: 'da_huy'),
    'unknown': (label: 'Không xác định', group: 'sap_toi'),
  };

  /// Suy mã trạng thái từ các nhãn tiếng Việt cũ (`status`, `paymentStatus`) khi app cập nhật tạm.
  static String _codeFromLabels(String status, String paymentStatus, String refund, String? rejectReason) {
    final apiStatus = switch (status) {
      'Đã hủy' => 'cancelled',
      'Đã hoàn thành' => 'completed',
      'Đã xác nhận' => 'confirmed',
      _ => 'pending_payment',
    };
    final apiPayment = switch (paymentStatus) {
      'Đã thanh toán' => 'success',
      'Chờ xác nhận' => 'confirming',
      'Chờ thanh toán' => 'pending',
      'Thanh toán thất bại' => 'failed',
      _ => '',
    };
    return deriveDisplayCode(
      apiStatus: apiStatus,
      apiPayment: apiPayment,
      refund: refund,
      rejectReason: rejectReason,
    );
  }

  /// Giờ kết thúc ("HH:mm") = giờ bắt đầu + thời lượng.
  String get endTimeSlot => toApiTime(parseHm(timeSlot) + durationMinutes);

  bool get isPaid => paymentStatus == 'Đã thanh toán';

  /// Theo nhóm tab do backend trả (`da_huy` gồm cả đơn hết hạn giữ chỗ).
  bool get isCancelled => statusGroup == 'da_huy';

  bool get isCompleted => statusGroup == 'hoan_thanh';

  /// Đơn app còn thanh toán/xem thanh toán được: chờ thanh toán, chờ chủ sân duyệt (xem trạng thái),
  /// hoặc bị từ chối ảnh (gửi lại ảnh). Đơn xong/huỷ/chủ sân tạo không có hoá đơn để tải.
  bool get canPay =>
      source == 'app' &&
      (displayStatus == 'awaiting_payment' ||
          displayStatus == 'awaiting_owner_approval' ||
          displayStatus == 'payment_rejected');

  bool get isPaymentRejected => displayStatus == 'payment_rejected';

  bool get isCheckedIn => displayStatus == 'checked_in' || checkedInAt != null;

  /// Còn huỷ được: chưa huỷ, chưa hoàn thành và chưa check-in (đã đến sân thì không huỷ).
  bool get canCancel => !isCancelled && !isCompleted && !isCheckedIn;

  bool get hasRefund => refundStatus != 'none' && refundAmount > 0;

  /// Khối "Hoàn tiền" trong thẻ đơn (đơn đã huỷ có hoàn tiền).
  bool get showRefundBlock =>
      displayStatus == 'cancelled_refund_pending' ||
      displayStatus == 'cancelled_refunded' ||
      displayStatus == 'cancelled_refund_received' ||
      displayStatus == 'cancelled_refund_failed' ||
      (refundId != null && canConfirmRefund);

  /// Còn nhập/sửa được tài khoản nhận hoàn: khoản hoàn chưa được chủ sân chuyển (backend chỉ nhận ở nhóm này).
  bool get canEnterRefundAccount =>
      apiId != null &&
      refundId != null &&
      const {'waiting_info', 'processing', 'not_received', 'escalated'}.contains(refundDetail);

  /// Huỷ dưới 12 giờ: không được hoàn tiền.
  bool get isNoRefund => displayStatus == 'cancelled_no_refund';

  Booking copyWith({
    String? id,
    Court? court,
    DateTime? date,
    String? timeSlot,
    int? durationMinutes,
    int? totalPrice,
    String? status,
    String? paymentStatus,
    String? paymentMethod,
    String? transactionId,
    DateTime? paidAt,
    String? transferContent,
    String? source,
    String? refundStatus,
    int? refundAmount,
    int? apiId,
    String? courtName,
    String? contactName,
    String? contactPhone,
    bool? canReview,
    bool? reviewed,
    int? reviewStars,
    int? reviewBookingId,
    String? reviewContent,
    bool? canEditReview,
    String? displayStatus,
    String? statusLabel,
    String? statusGroup,
    String? rejectReason,
    bool? canComplain,
    bool? complained,
    bool? slowReview,
    bool? canCheckIn,
    bool? inCheckInWindow,
    DateTime? checkedInAt,
    int? refundId,
    String? refundDetail,
    String? refundProofUrl,
    DateTime? refundDeadline,
    bool? canConfirmRefund,
  }) {
    // App cập nhật tạm `status`/`paymentStatus` (vd vừa thanh toán/huỷ) mà không kèm trạng thái hiển thị
    // → suy lại ở đây; lần tải lại kế tiếp sẽ lấy bản chính từ backend.
    final changedLegacy = (status != null || paymentStatus != null || refundStatus != null) &&
        displayStatus == null;
    var nextCode = displayStatus ?? this.displayStatus;
    var nextLabel = statusLabel ?? this.statusLabel;
    var nextGroup = statusGroup ?? this.statusGroup;
    if (changedLegacy) {
      nextCode = _codeFromLabels(
        status ?? this.status,
        paymentStatus ?? this.paymentStatus,
        refundStatus ?? this.refundStatus,
        rejectReason ?? this.rejectReason,
      );
      nextLabel = displayFallback[nextCode]!.label;
      nextGroup = displayFallback[nextCode]!.group;
    }
    return Booking(
      id: id ?? this.id,
      court: court ?? this.court,
      date: date ?? this.date,
      timeSlot: timeSlot ?? this.timeSlot,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      totalPrice: totalPrice ?? this.totalPrice,
      status: status ?? this.status,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      transactionId: transactionId ?? this.transactionId,
      paidAt: paidAt ?? this.paidAt,
      transferContent: transferContent ?? this.transferContent,
      source: source ?? this.source,
      refundStatus: refundStatus ?? this.refundStatus,
      refundAmount: refundAmount ?? this.refundAmount,
      apiId: apiId ?? this.apiId,
      courtName: courtName ?? this.courtName,
      contactName: contactName ?? this.contactName,
      contactPhone: contactPhone ?? this.contactPhone,
      canReview: canReview ?? this.canReview,
      reviewed: reviewed ?? this.reviewed,
      reviewStars: reviewStars ?? this.reviewStars,
      reviewBookingId: reviewBookingId ?? this.reviewBookingId,
      reviewContent: reviewContent ?? this.reviewContent,
      canEditReview: canEditReview ?? this.canEditReview,
      displayStatus: nextCode,
      statusLabel: nextLabel,
      statusGroup: nextGroup,
      rejectReason: rejectReason ?? this.rejectReason,
      canComplain: canComplain ?? this.canComplain,
      complained: complained ?? this.complained,
      slowReview: slowReview ?? this.slowReview,
      canCheckIn: canCheckIn ?? this.canCheckIn,
      inCheckInWindow: inCheckInWindow ?? this.inCheckInWindow,
      checkedInAt: checkedInAt ?? this.checkedInAt,
      refundId: refundId ?? this.refundId,
      refundDetail: refundDetail ?? this.refundDetail,
      refundProofUrl: refundProofUrl ?? this.refundProofUrl,
      refundDeadline: refundDeadline ?? this.refundDeadline,
      canConfirmRefund: canConfirmRefund ?? this.canConfirmRefund,
    );
  }
}

/// Kết quả huỷ đơn (`POST /khach/dat-san/:id/huy`). Tiền hoàn do backend tính theo chính sách:
/// còn ≥24h hoàn 100%, 12–24h hoàn 50%, dưới 12h không hoàn.
class CancelResult {
  final bool paid; // đơn đã thanh toán
  final int refundAmount; // soTienHoanDuKien
  final int refundPercent; // tiLeHoan
  final String? message; // thongBao
  final bool canUpdateRefundAccount; // canCapNhatTaiKhoanHoan: có tiền hoàn → mời khách nhập TK nhận

  const CancelResult({
    this.paid = false,
    this.refundAmount = 0,
    this.refundPercent = 0,
    this.message,
    this.canUpdateRefundAccount = false,
  });

  factory CancelResult.fromJson(Map<String, dynamic> j) {
    int asInt(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? 0}') ?? 0;
    return CancelResult(
      paid: j['daThanhToan'] == true,
      refundAmount: asInt(j['soTienHoanDuKien']),
      refundPercent: asInt(j['tiLeHoan']),
      message: j['thongBao']?.toString(),
      canUpdateRefundAccount: j['canCapNhatTaiKhoanHoan'] == true,
    );
  }
}

/// Xem trước huỷ (`GET /khach/dat-san/:id/huy-xem-truoc`): backend tính sẵn, app chỉ hiển thị cảnh báo.
/// Trường hợp: còn ≥24h hoàn 100% · 12–24h hoàn 50% · dưới 12h không hoàn.
class CancelPreview {
  final bool paid; // daThanhToan
  final int refundAmount; // soTienHoan
  final int refundPercent; // tiLeHoan (100 / 50 / 0)
  final int totalPaid; // tongDaTra
  final int sessionCount; // soBuoiHuy (>1 với lịch cố định)
  final int freeHours; // gioMienPhi (24)
  final int halfHours; // gioNuaTien (12)
  final double hoursLeft; // soGioConLai tới buổi gần nhất

  const CancelPreview({
    this.paid = false,
    this.refundAmount = 0,
    this.refundPercent = 0,
    this.totalPaid = 0,
    this.sessionCount = 1,
    this.freeHours = 24,
    this.halfHours = 12,
    this.hoursLeft = 0,
  });

  factory CancelPreview.fromJson(Map<String, dynamic> j) {
    int asInt(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? 0}') ?? 0;
    double asDouble(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? 0}') ?? 0;
    return CancelPreview(
      paid: j['daThanhToan'] == true,
      refundAmount: asInt(j['soTienHoan']),
      refundPercent: asInt(j['tiLeHoan']),
      totalPaid: asInt(j['tongDaTra']),
      sessionCount: asInt(j['soBuoiHuy']) == 0 ? 1 : asInt(j['soBuoiHuy']),
      freeHours: asInt(j['gioMienPhi']) == 0 ? 24 : asInt(j['gioMienPhi']),
      halfHours: asInt(j['gioNuaTien']) == 0 ? 12 : asInt(j['gioNuaTien']),
      hoursLeft: asDouble(j['soGioConLai']),
    );
  }
}

/// Kết quả check-in QR (`POST /khach/dat-san/:id/check-in`).
class CheckInResult {
  final DateTime? checkedInAt; // thoiDiemCheckIn
  final bool autoConfirmed; // daTuXacNhanDon: đơn đang chờ chủ sân duyệt được tự xác nhận
  final String? statusLabel; // nhanTrangThai

  const CheckInResult({this.checkedInAt, this.autoConfirmed = false, this.statusLabel});

  factory CheckInResult.fromJson(Map<String, dynamic> j) => CheckInResult(
        checkedInAt: DateTime.tryParse('${j['thoiDiemCheckIn'] ?? ''}'),
        autoConfirmed: j['daTuXacNhanDon'] == true,
        statusLabel: j['nhanTrangThai']?.toString(),
      );
}

/// Nội dung mã QR check-in tại sân: `bc1:<maSan>:<phienBan>:<token>` (QR thanh toán là mã khác).
class CheckInQr {
  final int courtId;
  final int version;
  final String token;

  const CheckInQr({required this.courtId, required this.version, required this.token});

  /// null nếu không đúng định dạng (vd khách quét nhầm QR chuyển khoản/QR lạ).
  static CheckInQr? tryParse(String? raw) {
    final text = raw?.trim() ?? '';
    if (!text.startsWith('bc1:')) return null;
    final parts = text.split(':');
    if (parts.length != 4) return null;
    final courtId = int.tryParse(parts[1]);
    final version = int.tryParse(parts[2]);
    if (courtId == null || version == null || parts[3].isEmpty) return null;
    return CheckInQr(courtId: courtId, version: version, token: parts[3]);
  }
}

/// Ngân hàng để chọn khi nhập tài khoản nhận hoàn (`GET /tai-khoan/ngan-hang`).
class BankOption {
  final String code; // maNganHang (2-20 ký tự)
  final String name; // tenNganHang

  const BankOption({required this.code, required this.name});

  /// Danh sách dự phòng khi không tải được từ backend.
  static const List<BankOption> fallback = [
    BankOption(code: 'VCB', name: 'Vietcombank'),
    BankOption(code: 'CTG', name: 'VietinBank'),
    BankOption(code: 'BIDV', name: 'BIDV'),
    BankOption(code: 'VBA', name: 'Agribank'),
    BankOption(code: 'MB', name: 'MB Bank'),
    BankOption(code: 'TCB', name: 'Techcombank'),
    BankOption(code: 'ACB', name: 'ACB'),
    BankOption(code: 'VPB', name: 'VPBank'),
    BankOption(code: 'TPB', name: 'TPBank'),
    BankOption(code: 'STB', name: 'Sacombank'),
  ];

  /// Đọc linh hoạt vì backend có thể đặt tên trường khác nhau; bỏ dòng thiếu mã hoặc tên.
  static BankOption? tryFromJson(Map<String, dynamic> j) {
    String? pick(List<String> keys) {
      for (final k in keys) {
        final v = j[k]?.toString().trim() ?? '';
        if (v.isNotEmpty) return v;
      }
      return null;
    }

    final code = pick(['maNganHang', 'ma', 'code']);
    final name = pick(['tenNganHang', 'ten', 'tenVietTat', 'shortName', 'name']);
    if (code == null || name == null) return null;
    return BankOption(code: code, name: name);
  }
}
