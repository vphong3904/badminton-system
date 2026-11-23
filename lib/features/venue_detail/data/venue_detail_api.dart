import '../../../core/network/api_client.dart';
import '../../../models/venue_detail_model.dart';

class VenueDetailApi {
  VenueDetailApi._();

  // Cache theo cơ sở (2 phút): mở lại màn chi tiết không gọi lại backend.
  static const Duration _ttl = Duration(minutes: 2);
  static final Map<int, ({DateTime at, VenueDetail data})> _detailCache = {};
  static final Map<int, ({DateTime at, List<PriceRow> data})> _priceCache = {};
  static final Map<int, ({DateTime at, ReviewPage data})> _reviewCache = {};

  static bool _fresh(DateTime at) => DateTime.now().difference(at) < _ttl;

  /// Gọi sau khi gửi đánh giá mới: bỏ cache danh sách + chi tiết (điểm TB/số
  /// lượt đổi) để lần mở sau tải lại.
  static void invalidateReviews(int venueId) {
    _reviewCache.remove(venueId);
    _detailCache.remove(venueId);
  }

  static Future<VenueDetail> fetch(int venueId, {bool force = false}) async {
    final hit = _detailCache[venueId];
    if (!force && hit != null && _fresh(hit.at)) return hit.data;
    final data = await ApiClient.get('/khach/co-so/$venueId');
    if (data is! Map) {
      throw const ApiException('Dữ liệu chi tiết cơ sở không hợp lệ.');
    }
    final detail = VenueDetail.fromJson(data.cast<String, dynamic>());
    _detailCache[venueId] = (at: DateTime.now(), data: detail);
    return detail;
  }

  static const int pageSize = 20;

  /// `GET /khach/co-so/:maCoSo/danh-gia?trang&soLuong` (công khai).
  /// Trang 1 được cache 2 phút; trang sau luôn gọi mới. 404 (cơ sở ngừng hoạt
  /// động) → coi như chưa có đánh giá.
  static Future<ReviewPage> fetchReviews(
    int venueId, {
    int page = 1,
    bool force = false,
  }) async {
    final hit = _reviewCache[venueId];
    if (page == 1 && !force && hit != null && _fresh(hit.at)) return hit.data;
    try {
      final data = await ApiClient.get(
        '/khach/co-so/$venueId/danh-gia',
        query: {'trang': '$page', 'soLuong': '$pageSize'},
      );
      final map = data is Map ? data.cast<String, dynamic>() : const <String, dynamic>{};
      final list = data is List
          ? data
          : (map['danhSach'] is List ? map['danhSach'] as List : const []);
      final items = <VenueReview>[
        for (final item in list)
          if (item is Map) VenueReview.fromJson(item.cast<String, dynamic>()),
      ];
      final result = ReviewPage(
        items: items,
        page: (map['trang'] as num?)?.toInt() ?? page,
        total: (map['tongSo'] as num?)?.toInt() ?? items.length,
      );
      if (page == 1) _reviewCache[venueId] = (at: DateTime.now(), data: result);
      return result;
    } on ApiException catch (e) {
      if (e.isNotFound) return ReviewPage.empty;
      rethrow;
    }
  }

  /// `POST /khach/dat-san/:maDatSan/danh-gia` → 201. Chỉ đơn `completed` đã
  /// thanh toán, mỗi đơn 1 lần. Lỗi 409: `BOOKING_NOT_COMPLETED`,
  /// `PAYMENT_NOT_COMPLETED`, `REVIEW_EXISTS` (đọc `ApiException.code`).
  static Future<ReviewResult> postReview({
    required int bookingId,
    required int stars,
    String? content,
  }) async {
    final data = await ApiClient.post(
      '/khach/dat-san/$bookingId/danh-gia',
      body: {
        'soSao': stars,
        if (content != null && content.trim().isNotEmpty)
          'noiDung': content.trim(),
      },
    );
    final map = data is Map ? data.cast<String, dynamic>() : const <String, dynamic>{};
    return ReviewResult(
      rating: double.tryParse(map['diemTrungBinh']?.toString() ?? ''),
      count: (map['soDanhGia'] as num?)?.toInt(),
    );
  }

  /// `PATCH /khach/dat-san/:maDatSan/danh-gia` — sửa đánh giá của mình (trong 7 ngày). `bookingId` là buổi
  /// đang giữ đánh giá (`Booking.reviewBookingId`). Lỗi 409: `REVIEW_EDIT_EXPIRED`, `REVIEW_HIDDEN`.
  static Future<ReviewResult> updateReview({
    required int bookingId,
    required int stars,
    String? content,
  }) async {
    final data = await ApiClient.patch(
      '/khach/dat-san/$bookingId/danh-gia',
      // noiDung rỗng = xoá bình luận.
      body: {'soSao': stars, 'noiDung': (content ?? '').trim()},
    );
    final map = data is Map ? data.cast<String, dynamic>() : const <String, dynamic>{};
    return ReviewResult(
      rating: double.tryParse(map['diemTrungBinh']?.toString() ?? ''),
      count: (map['soDanhGia'] as num?)?.toInt(),
    );
  }

  /// `DELETE /khach/dat-san/:maDatSan/danh-gia` — xoá đánh giá của mình, sau đó được đánh giá lại.
  static Future<void> deleteReview(int bookingId) async {
    await ApiClient.delete('/khach/dat-san/$bookingId/danh-gia');
  }

  /// `GET /khach/san/:maSan` → bảng giá.
  static Future<List<PriceRow>> fetchPrices(int courtId, {int? venueId}) async {
    final key = venueId ?? -courtId;
    final hit = _priceCache[key];
    if (hit != null && _fresh(hit.at)) return hit.data;
    final data = await ApiClient.get('/khach/san/$courtId');
    final rows = <PriceRow>[];
    if (data is Map && data['bangGia'] is List) {
      for (final item in data['bangGia'] as List) {
        if (item is! Map) continue;
        String hm(Object? v) {
          final t = v?.toString() ?? '';
          return t.length >= 5 ? t.substring(0, 5) : t;
        }

        rows.add(PriceRow(
          day: (item['thu'] as num?)?.toInt(),
          dayType: item['loaiNgay']?.toString() ?? '',
          customerType: item['loaiKhach']?.toString() ?? '',
          start: hm(item['gioBatDau']),
          end: hm(item['gioKetThuc']),
          pricePerHour: (item['giaMoiGio'] as num?)?.toInt() ?? 0,
        ));
      }
    }
    _priceCache[key] = (at: DateTime.now(), data: rows);
    return rows;
  }
}
