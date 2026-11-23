import '../../../core/network/api_client.dart';

/// Gọi API khiếu nại chủ sân (`POST /khach/dat-san/:maDatSan/khieu-nai`).
class ComplaintApi {
  ComplaintApi._();

  /// Gửi khiếu nại cho 1 đơn đã thanh toán thành công hoặc đã huỷ.
  /// [atCancel] = true khi bấm ngay sau lúc huỷ (để admin biết bối cảnh).
  static Future<void> submit({
    required int bookingId,
    required String content,
    bool atCancel = false,
  }) async {
    await ApiClient.post(
      '/khach/dat-san/$bookingId/khieu-nai',
      body: {
        'noiDung': content.trim(),
        if (atCancel) 'giaiDoan': 'at_cancel',
      },
    );
  }
}
