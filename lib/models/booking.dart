import 'court.dart';

class Booking {
  final String id;
  final Court court;
  final DateTime date;
  final String timeSlot;
  final int durationMinutes;
  final int totalPrice;
  final String status;
  final String paymentStatus;
  final String paymentMethod;

  const Booking({
    required this.id,
    required this.court,
    required this.date,
    required this.timeSlot,
    required this.durationMinutes,
    required this.totalPrice,
    this.status = 'Chờ xác nhận',
    this.paymentStatus = 'Chưa thanh toán',
    this.paymentMethod = '',
  });

  Booking copyWith({
    String? status,
    String? paymentStatus,
    String? paymentMethod,
  }) {
    return Booking(
      id: id,
      court: court,
      date: date,
      timeSlot: timeSlot,
      durationMinutes: durationMinutes,
      totalPrice: totalPrice,
      status: status ?? this.status,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      paymentMethod: paymentMethod ?? this.paymentMethod,
    );
  }
}
