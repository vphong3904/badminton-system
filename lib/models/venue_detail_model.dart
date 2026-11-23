import '../core/network/api_client.dart';

class VenueCourt {
  final int id;
  final String name;
  const VenueCourt({required this.id, required this.name});
}

class PriceRow {
  /// Thứ áp dụng: 1 = Thứ 2 … 7 = Chủ nhật (mỗi thứ có giá riêng). Null nếu máy chủ cũ chưa trả `thu`.
  final int? day;
  final String dayType; // weekday / weekend (chỉ dùng khi `day` null)
  final String customerType;
  final String start;
  final String end;
  final int pricePerHour;
  const PriceRow({
    this.day,
    required this.dayType,
    required this.customerType,
    required this.start,
    required this.end,
    required this.pricePerHour,
  });

  /// Dòng giá này có áp dụng cho thứ [d] (1..7) không.
  bool appliesTo(int d) =>
      day != null ? day == d : dayType == (d >= 6 ? 'weekend' : 'weekday');
}

/// Chi tiết cơ sở từ `GET /khach/co-so/:maCoSo`.
class VenueDetail {
  final String? phone;
  final String? mapLink;
  final String? description;
  final int reviewCount;
  final double? rating; // diemTrungBinh (mới nhất từ máy chủ)
  /// Mọi ảnh của cơ sở (ảnh bìa đứng đầu), dùng cho trình xem toàn màn hình.
  final List<String> imageUrls;

  /// Ảnh bìa (null nếu chủ sân chưa thêm ảnh nào — API chỉ trả ảnh mặc định).
  final String? coverUrl;

  /// Ảnh chi tiết các sân do chủ sân thêm (không gồm ảnh bìa), tối đa
  /// [maxCourtImages]. Rỗng = chủ sân không thêm → màn chi tiết ẩn mục này.
  final List<String> courtImageUrls;
  final List<VenueCourt> courts;

  static const int maxCourtImages = 12;

  const VenueDetail({
    this.phone,
    this.mapLink,
    this.description,
    this.reviewCount = 0,
    this.rating,
    this.imageUrls = const [],
    this.coverUrl,
    this.courtImageUrls = const [],
    this.courts = const [],
  });

  static String? _text(Object? v) {
    final t = v?.toString().trim() ?? '';
    return t.isEmpty ? null : t;
  }

  factory VenueDetail.fromJson(Map<String, dynamic> j) {
    final images = <String>[];
    final courtImages = <String>[];
    String? cover;
    final rawImages = j['anh'];
    if (rawImages is List) {
      for (final item in rawImages) {
        if (item is! Map || _text(item['duongDan']) == null) continue;
        final url = ApiClient.resolveFileUrl(item['duongDan'].toString());
        images.add(url);
        final isCover = item['laAnhBia'] == true || item['laAnhBia'] == 1;
        if (isCover) {
          cover ??= url;
        } else if (courtImages.length < maxCourtImages) {
          courtImages.add(url);
        }
      }
    }
    final courts = <VenueCourt>[];
    final rawCourts = j['cacSan'];
    if (rawCourts is List) {
      for (final item in rawCourts) {
        if (item is Map && item['maSan'] is num) {
          courts.add(VenueCourt(
            id: (item['maSan'] as num).toInt(),
            name: _text(item['tenSan']) ?? 'Sân ${item['maSan']}',
          ));
        }
      }
    }
    return VenueDetail(
      phone: _text(j['soDienThoai']),
      mapLink: _text(j['linkBanDo']),
      description: _text(j['moTa']),
      reviewCount: (j['soDanhGia'] as num?)?.toInt() ?? 0,
      rating: double.tryParse(j['diemTrungBinh']?.toString() ?? ''),
      imageUrls: images,
      coverUrl: cover,
      courtImageUrls: courtImages,
      courts: courts,
    );
  }
}

/// Một đánh giá của khách (`GET /khach/co-so/:maCoSo/danh-gia`, BE-05).
class VenueReview {
  final String author;
  final int stars; // 1..5
  final String? content;
  final String? date; // dd/MM/yyyy
  final String? ownerReply;
  final String? ownerReplyDate; // dd/MM/yyyy (ngayPhanHoi)

  const VenueReview({
    required this.author,
    required this.stars,
    this.content,
    this.date,
    this.ownerReply,
    this.ownerReplyDate,
  });

  static String? _formatDate(Object? raw) {
    final text = _text(raw);
    if (text == null) return null;
    final d = DateTime.tryParse(text);
    if (d == null) return null;
    final l = d.toLocal();
    return '${l.day.toString().padLeft(2, '0')}/'
        '${l.month.toString().padLeft(2, '0')}/${l.year}';
  }

  static String? _text(Object? v) {
    final t = v?.toString().trim() ?? '';
    return t.isEmpty ? null : t;
  }

  factory VenueReview.fromJson(Map<String, dynamic> j) {
    final stars = ((j['soSao'] as num?)?.toInt() ?? 0).clamp(0, 5);
    return VenueReview(
      author: _text(j['tenKhach']) ?? _text(j['hoTen']) ?? 'Khách hàng',
      stars: stars,
      content: _text(j['noiDung']),
      date: _formatDate(j['ngayTao']),
      ownerReply: _text(j['phanHoiChuSan']),
      ownerReplyDate: _formatDate(j['ngayPhanHoi']),
    );
  }
}

/// Một trang đánh giá: `{danhSach, trang, soLuong, tongSo}`.
class ReviewPage {
  final List<VenueReview> items;
  final int page;
  final int total;

  const ReviewPage({required this.items, required this.page, required this.total});

  static const empty = ReviewPage(items: [], page: 1, total: 0);
}

/// Kết quả gửi đánh giá (`POST /khach/dat-san/:maDatSan/danh-gia` → 201).
class ReviewResult {
  final double? rating; // diemTrungBinh MỚI của cơ sở
  final int? count; // soDanhGia MỚI

  const ReviewResult({this.rating, this.count});
}
