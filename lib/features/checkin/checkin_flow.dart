import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../booking/data/booking_api.dart';
import 'screens/qr_scan_screen.dart';
import '../../models/booking_model.dart';
import '../../shared/app_message_box.dart';

/// Luồng "Quét QR check-in" (G3.9): mở camera → gửi mã lên backend → hiện kết quả theo mã lỗi.
/// Trả true khi đơn đã ở trạng thái check-in (vừa check-in xong HOẶC đã check-in từ trước) để màn gọi tải lại danh sách.
/// Việc kiểm tra QR/cửa sổ giờ do backend quyết định (giờ máy chủ); app chỉ hiển thị.
Future<bool> startQrCheckIn(BuildContext context, Booking booking) async {
  final bookingId = booking.apiId;
  if (bookingId == null) return false;

  while (context.mounted) {
    final raw = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => QrScanScreen(
          title: '${booking.court.name}${booking.courtName == null ? '' : ' · ${booking.courtName}'}',
          subtitle: '${booking.timeSlot} - ${booking.endTimeSlot} · mã đơn ${booking.id}',
        ),
      ),
    );
    if (raw == null || !context.mounted) return false; // khách tự thoát màn quét

    final qr = CheckInQr.tryParse(raw);
    if (qr == null) {
      // QR không phải của hệ thống (vd quét nhầm QR chuyển khoản): không cần gọi máy chủ.
      final again = await _askRetry(
        context,
        title: 'Mã QR không hợp lệ',
        message: 'Đây không phải mã QR check-in. Vui lòng quét đúng mã QR được dán tại sân.',
      );
      if (!again) return false;
      continue;
    }

    try {
      final result = await _withLoading(context, () => BookingApi.checkIn(bookingId, qr));
      if (!context.mounted) return true;
      await showSuccessBox(
        context,
        title: 'Check-in thành công',
        message: result.autoConfirmed
            ? 'Bạn đã check-in. Đơn của bạn cũng đã được xác nhận. Chúc bạn chơi vui vẻ!'
            : 'Bạn đã check-in. Chúc bạn chơi vui vẻ!',
        buttonLabel: 'Xong',
      );
      return true;
    } on ApiException catch (error) {
      if (!context.mounted) return false;
      final outcome = await _showCheckInError(context, error);
      switch (outcome) {
        case _Outcome.retry:
          continue;
        case _Outcome.done:
          return true;
        case _Outcome.close:
          return false;
      }
    }
  }
  return false;
}

enum _Outcome { retry, done, close }

Future<T> _withLoading<T>(BuildContext context, Future<T> Function() task) async {
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    useRootNavigator: true,
    builder: (_) => const PopScope(
      canPop: false,
      child: Center(child: CircularProgressIndicator()),
    ),
  );
  try {
    return await task();
  } finally {
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
  }
}

Future<bool> _askRetry(BuildContext context, {required String title, required String message}) async {
  final again = await showAppMessageBox<bool>(
    context,
    kind: MessageKind.warning,
    title: title,
    message: message,
    actions: const [
      MessageAction<bool>(label: 'Đóng', value: false, style: MessageActionStyle.secondary),
      MessageAction<bool>(label: 'Quét lại', value: true, icon: Icons.qr_code_scanner_rounded),
    ],
  );
  return again == true;
}

/// Thông báo theo mã lỗi backend (`ApiException.code`). Câu chữ nhìn từ phía khách: chuyện gì xảy ra + làm gì tiếp.
Future<_Outcome> _showCheckInError(BuildContext context, ApiException error) async {
  switch (error.code) {
    case 'QR_INVALID':
      return await _askRetry(
        context,
        title: 'Mã QR không hợp lệ',
        message: 'Mã này không dùng để check-in được. Vui lòng quét đúng mã QR được dán tại sân.',
      )
          ? _Outcome.retry
          : _Outcome.close;

    case 'QR_OUTDATED':
      return await _askRetry(
        context,
        title: 'Mã QR đã cũ',
        message: 'Chủ sân đã đổi mã QR mới. Vui lòng quét mã QR mới đang dán tại sân.',
      )
          ? _Outcome.retry
          : _Outcome.close;

    case 'WRONG_COURT':
      return await _askRetry(
        context,
        title: 'Không đúng sân đã đặt',
        message: 'Mã QR này thuộc sân khác. Vui lòng quét mã QR tại đúng sân bạn đã đặt.',
      )
          ? _Outcome.retry
          : _Outcome.close;

    case 'NOT_BOOKING_OWNER':
      await showErrorBox(
        context,
        title: 'Không phải đơn của bạn',
        message: 'Bạn chỉ check-in được đơn do chính mình đặt. Hãy đăng nhập đúng tài khoản đã đặt sân.',
      );
      return _Outcome.close;

    case 'BOOKING_NOT_PAID':
      await showInfoBox(
        context,
        kind: MessageKind.warning,
        title: 'Đơn chưa thanh toán',
        message: 'Bạn cần thanh toán và gửi ảnh chuyển khoản trước khi check-in. '
            'Vào "Thanh toán" ở đơn này để hoàn tất, rồi quét lại nhé.',
      );
      return _Outcome.close;

    case 'BOOKING_NOT_ELIGIBLE':
      await showErrorBox(
        context,
        title: 'Đơn không check-in được',
        message: 'Đơn này đã hủy, hết hạn hoặc không còn hiệu lực nên không thể check-in. '
            'Nếu bạn nghĩ đây là nhầm lẫn, hãy liên hệ chủ sân.',
      );
      return _Outcome.close;

    case 'OUT_OF_WINDOW':
      final early = error.data?['viTri'] == 'qua_som';
      final openMinutes = error.data?['moSomPhut'];
      await showInfoBox(
        context,
        kind: MessageKind.warning,
        title: early ? 'Chưa đến giờ check-in' : 'Đã quá thời gian check-in',
        message: early
            ? 'Bạn có thể check-in từ ${openMinutes ?? 30} phút trước giờ chơi. Vui lòng quay lại gần giờ nhé.'
            : 'Đã quá thời gian cho phép check-in bằng QR. Vui lòng gặp chủ sân để được check-in thủ công.',
      );
      return _Outcome.close;

    case 'ALREADY_CHECKED_IN':
      await showInfoBox(
        context,
        title: 'Đơn đã check-in',
        message: 'Đơn này đã được check-in trước đó, bạn không cần quét lại.',
      );
      return _Outcome.done; // để màn lịch sử tải lại và cập nhật nút

    default:
      if (error.isInfrastructure) {
        return await _askRetry(
          context,
          title: 'Chưa check-in được',
          message: 'Không kết nối được máy chủ. Bạn kiểm tra mạng rồi quét lại nhé. '
              'Nếu mạng yếu, hãy báo chủ sân để check-in thủ công.',
        )
            ? _Outcome.retry
            : _Outcome.close;
      }
      await showErrorBox(context, title: 'Chưa check-in được', message: error.message);
      return _Outcome.close;
  }
}
