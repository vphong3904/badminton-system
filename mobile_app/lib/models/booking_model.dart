import 'package:flutter_application_1/models/court_model.dart';

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
  // Ví dụ: Chờ thanh toán, Đã thanh toán, Thanh toán thất bại.
  final String paymentStatus;

  // Chỉ dùng phương thức thanh toán trực tuyến.
  final String paymentMethod;

  // Thông tin giao dịch sau khi backend xác minh.
  final String? transactionId;
  final DateTime? paidAt;
  final String? paymentProof;

  // Thông tin đơn trên backend (có khi đặt qua API).
  final int? apiId; // maDatSan
  final String? courtName; // tên sân con, vd "Sân 1"
  final String? contactName;
  final String? contactPhone;

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
    this.paymentProof,
    this.apiId,
    this.courtName,
    this.contactName,
    this.contactPhone,
  });

  bool get isPaid => paymentStatus == 'Đã thanh toán';

  bool get isCancelled => status == 'Đã hủy';

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
    String? paymentProof,
    int? apiId,
    String? courtName,
    String? contactName,
    String? contactPhone,
  }) {
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
      paymentProof: paymentProof ?? this.paymentProof,
      apiId: apiId ?? this.apiId,
      courtName: courtName ?? this.courtName,
      contactName: contactName ?? this.contactName,
      contactPhone: contactPhone ?? this.contactPhone,
    );
  }
}
