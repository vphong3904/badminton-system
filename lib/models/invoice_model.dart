/// Kết quả tạo đơn đặt sân.
class CreatedBooking {
  final int bookingId; // maDatSan
  final String orderCode; // maDon (cũng là nội dung chuyển khoản)
  final int totalAmount;
  final int? groupId; // maNhomDat (đặt nhiều sân/khung giờ); null với API cũ
  final int itemCount; // số đơn con (cụm) trong nhóm

  const CreatedBooking({
    required this.bookingId,
    required this.orderCode,
    required this.totalAmount,
    this.groupId,
    this.itemCount = 1,
  });

  factory CreatedBooking.fromJson(Map<String, dynamic> json) {
    final first = ((json['cacDon'] as List).first as Map).cast<String, dynamic>();
    return CreatedBooking(
      bookingId: (first['maDatSan'] as num).toInt(),
      orderCode: first['maDon'] as String,
      totalAmount: (json['tongTien'] as num).toInt(),
      groupId: (json['maNhomDat'] as num?)?.toInt(),
      itemCount: (json['cacDon'] as List).length,
    );
  }
}

/// Một ảnh chuyển khoản khách đã gửi cho đơn (mới nhất trước trong danh sách).
class PaymentProof {
  final int id; // maChungTu
  final String imageUrl; // anhUrl (đường dẫn tương đối)
  final String sentAt; // ngayGui (chuỗi từ backend)
  final String? transferredAt; // thoiDiemChuyen (khách tự nhập, có thể null)
  final String result; // pending | accepted | rejected
  final String? reason; // lyDo (khi bị từ chối)

  const PaymentProof({
    required this.id,
    required this.imageUrl,
    required this.sentAt,
    required this.result,
    this.transferredAt,
    this.reason,
  });

  factory PaymentProof.fromJson(Map<String, dynamic> json) {
    String? text(dynamic v) {
      final s = v?.toString().trim();
      return (s == null || s.isEmpty) ? null : s;
    }

    return PaymentProof(
      id: Invoice._toInt(json['maChungTu']),
      imageUrl: (json['anhUrl'] ?? '').toString(),
      sentAt: (json['ngayGui'] ?? '').toString(),
      transferredAt: text(json['thoiDiemChuyen']),
      result: (json['ketQua'] ?? 'pending').toString(),
      reason: text(json['lyDo']),
    );
  }

  bool get isRejected => result == 'rejected';
  bool get isAccepted => result == 'accepted';
}

/// Hóa đơn thanh toán của một đơn đặt sân.
class Invoice {
  final int bookingId;
  final String orderCode;
  final int amount;
  final String bookingStatus; // pending_payment | confirmed | expired | cancelled...
  final String paymentStatus; // pending | confirming (đợi chủ sân xác nhận) | success | expired | late_payment
  /// Giây còn giữ chỗ. null khi khách đã gửi ảnh (đang chờ chủ sân xác nhận, không còn đếm ngược giữ chỗ).
  final int? remainingSeconds;
  /// Hạn chủ sân xác nhận (chuỗi từ backend) và số giây còn lại; có thể null, có thể âm (quá hạn).
  final String? confirmDeadline;
  final int? confirmRemainingSeconds;
  /// Các ảnh đã gửi (mới nhất trước) và số ảnh tối đa cho phép (mặc định 5).
  final List<PaymentProof> proofs;
  final int maxProofs;
  final String? qrUrl;
  /// Nội dung mã VietQR do backend dựng sẵn; app tự vẽ thành QR (không cần mạng ngoài).
  final String? qrPayload;
  /// Backend chưa cấu hình tài khoản nhận tiền (BANK_*) nên chưa có QR.
  final bool paymentNotConfigured;
  final String transferContent;

  // Tài khoản nhận tiền hiển thị cạnh QR (chỉ có khi pending/confirming).
  final String? bankCode;
  final String? bankName;
  final String? accountNumber;
  final String? accountName;

  // Ảnh chuyển khoản khách đã gửi (đường dẫn tương đối) và lý do chủ sân từ chối lần trước.
  final String? proofImageUrl;
  final String? rejectReason;

  /// Đã gửi ảnh mà chủ sân chưa duyệt quá hạn (mặc định 30 phút): khách được khiếu nại "Chậm duyệt".
  final bool slowReview;

  const Invoice({
    required this.bookingId,
    required this.orderCode,
    required this.amount,
    required this.bookingStatus,
    required this.paymentStatus,
    required this.remainingSeconds,
    this.confirmDeadline,
    this.confirmRemainingSeconds,
    this.proofs = const [],
    this.maxProofs = 5,
    required this.qrUrl,
    this.qrPayload,
    this.paymentNotConfigured = false,
    required this.transferContent,
    this.bankCode,
    this.bankName,
    this.accountNumber,
    this.accountName,
    this.proofImageUrl,
    this.rejectReason,
    this.slowReview = false,
  });

  /// DECIMAL của MySQL có thể về dạng chuỗi ("120000"), nên nhận cả số lẫn chuỗi.
  static int _toInt(dynamic v) =>
      v is num ? v.toInt() : int.parse(v.toString().split('.').first);

  static String? _nonEmpty(dynamic v) {
    final text = v?.toString().trim();
    return (text == null || text.isEmpty) ? null : text;
  }

  factory Invoice.fromJson(Map<String, dynamic> json) {
    final account = json['taiKhoanNhan'] is Map
        ? (json['taiKhoanNhan'] as Map).cast<String, dynamic>()
        : const <String, dynamic>{};
    return Invoice(
      bookingId: _toInt(json['maDatSan']),
      orderCode: json['maDon'] as String,
      amount: _toInt(json['soTien']),
      bookingStatus: json['trangThaiDatSan'] as String,
      paymentStatus: json['trangThaiThanhToan'] as String,
      remainingSeconds:
          json['conLaiGiay'] == null ? null : _toInt(json['conLaiGiay']),
      confirmDeadline: _nonEmpty(json['hanXacNhan']),
      confirmRemainingSeconds: json['conLaiXacNhanGiay'] == null
          ? null
          : _toInt(json['conLaiXacNhanGiay']),
      proofs: json['chungTu'] is List
          ? (json['chungTu'] as List)
              .whereType<Map>()
              .map((e) => PaymentProof.fromJson(e.cast<String, dynamic>()))
              .toList()
          : const <PaymentProof>[],
      maxProofs: json['soAnhToiDa'] == null ? 5 : _toInt(json['soAnhToiDa']),
      qrUrl: json['anhQrUrl'] as String?,
      qrPayload: _nonEmpty(json['maQr']),
      paymentNotConfigured: json['chuaCauHinhThanhToan'] == true,
      transferContent:
          (json['noiDungChuyenKhoan'] as String?) ?? (json['maDon'] as String),
      bankCode: _nonEmpty(account['maNganHang']),
      bankName: _nonEmpty(account['tenNganHang']),
      accountNumber: _nonEmpty(account['soTaiKhoan']),
      accountName: _nonEmpty(account['chuTaiKhoan']),
      proofImageUrl: _nonEmpty(json['anhChuyenKhoanUrl']),
      rejectReason: _nonEmpty(json['lyDoTuChoi']),
      slowReview: json['chamDuyet'] == true,
    );
  }

  bool get isPaid => paymentStatus == 'success';
  bool get isCancelled => bookingStatus == 'cancelled';
  bool get isExpired =>
      !isPaid &&
      (bookingStatus == 'expired' ||
          paymentStatus == 'expired' ||
          paymentStatus == 'late_payment');
  /// Khách đã gửi ảnh, đợi chủ sân xác nhận.
  bool get isAwaitingOwner => paymentStatus == 'confirming';

  /// Còn có thể gửi thêm ảnh (chưa đủ số ảnh tối đa).
  bool get canSendMoreProofs => proofs.length < maxProofs;

  /// Còn đang chờ khách thanh toán.
  bool get isOpen => !isPaid && !isExpired && !isCancelled;
}
