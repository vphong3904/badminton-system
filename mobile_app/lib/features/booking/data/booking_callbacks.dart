import 'package:flutter_application_1/models/booking_model.dart';

/// Callback cập nhật trạng thái thanh toán của một lịch đặt trong danh sách.
typedef BookingPaymentUpdate =
    void Function(
      Booking booking, {
      required String paymentStatus,
      required String paymentMethod,
      String? transactionId,
      DateTime? paidAt,
      String? paymentProof,
    });
