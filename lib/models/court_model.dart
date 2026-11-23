import '../core/utils/geo_utils.dart';

class Court {
  final String id;

  /// Mã cơ sở (`maCoSo`) trên backend. Để trống nếu sân chỉ là dữ liệu mẫu.
  final int? apiId;
  final String name;
  final String address;
  final int pricePerHour;
  final double rating;
  final int numberOfCourts;
  final bool isActive;

  // Thông tin bổ sung cho giao diện danh sách sân.
  final String sport; // Cầu lông, Pickleball, Bóng đá...
  final double? distanceMeters; // khoảng cách tới người dùng (m)
  final String openTime; // 'HH:mm'
  final String closeTime; // 'HH:mm' ('24:00' = nửa đêm)
  final String province;
  final String district;
  final List<String> tags; // Đơn ngày, Sự kiện, Xé vé
  final int promoCount; // số ưu đãi đang áp dụng

  /// Ảnh bìa (đường dẫn hoặc URL), null nếu chủ sân chưa thêm ảnh.
  final String? imageUrl;
  final String? contactPhone;
  final String? mapLink;

  /// Toạ độ cơ sở (`viDo`/`kinhDo`, backend lấy từ `linkBanDo`) để tính khoảng cách; null nếu chưa có.
  final double? latitude;
  final double? longitude;

  const Court({
    required this.id,
    this.apiId,
    required this.name,
    required this.address,
    required this.pricePerHour,
    this.rating = 0,
    this.numberOfCourts = 1,
    this.isActive = true,
    this.sport = 'Cầu lông',
    this.distanceMeters,
    this.openTime = '05:00',
    this.closeTime = '24:00',
    this.province = 'TP. Hồ Chí Minh',
    this.district = '',
    this.tags = const [],
    this.promoCount = 0,
    this.imageUrl,
    this.contactPhone,
    this.mapLink,
    this.latitude,
    this.longitude,
  });

  /// Có toạ độ hợp lệ để tính khoảng cách.
  bool get hasLocation => isValidLatLng(latitude, longitude);


  /// Tạo từ một phần tử của `GET /khach/co-so/danh-sach`.
  factory Court.fromApi(Map<String, dynamic> json) {
    final venueId = (json['maCoSo'] as num).toInt();
    final mapLink = _nonEmpty(json['linkBanDo']);
    // Backend tự đọc toạ độ từ link Google Maps của chủ sân (viDo/kinhDo); null nếu không đọc được.
    final lat = _toNullableDouble(json['viDo']);
    final lng = _toNullableDouble(json['kinhDo']);

    return Court(
      id: venueId.toString(),
      apiId: venueId,
      name: (json['tenCoSo'] as String?) ?? 'Cơ sở #$venueId',
      address: [json['diaChi'], json['quanHuyen'], json['tinhThanh']]
          .whereType<String>()
          .where((part) => part.trim().isNotEmpty)
          .join(', '),
      pricePerHour: _toInt(json['giaThapNhat']),
      rating: _toDouble(json['diemTrungBinh']),
      numberOfCourts: _toInt(json['soSan']) > 0 ? _toInt(json['soSan']) : 1,
      openTime: _hm(json['gioMoCua'], '05:00'),
      closeTime: _hm(json['gioDongCua'], '24:00'),
      province: (json['tinhThanh'] as String?) ?? '',
      district: (json['quanHuyen'] as String?) ?? '',
      imageUrl: _nonEmpty(json['duongDanAnh']),
      contactPhone: _nonEmpty(json['soDienThoai']),
      mapLink: mapLink,
      latitude: lat,
      longitude: lng,
    );
  }

  static String? _nonEmpty(Object? value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? null : text;
  }

  static int _toInt(Object? value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  static double? _toNullableDouble(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '');
  }

  static double _toDouble(Object? value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  /// "06:00:00" -> "06:00".
  static String _hm(Object? value, String fallback) {
    final text = value?.toString() ?? '';
    return text.length >= 5 ? text.substring(0, 5) : fallback;
  }

  /// Mã cơ sở dùng để gọi API: ưu tiên [apiId], nếu không thì thử đọc [id]
  /// (khi dữ liệu sân được tải từ backend, `id` chính là `maCoSo`).
  int? get venueId => apiId ?? int.tryParse(id);

  String get hoursLabel => '$openTime - $closeTime';

  int get openMinutes => _toMinutes(openTime);
  int get closeMinutes => _toMinutes(closeTime);

  /// Chữ viết tắt hiển thị trong logo tròn, ví dụ "CLB Cầu Lông" -> "CC".
  String get initials {
    final words = name
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty && w.toUpperCase() != 'CLB')
        .toList();
    if (words.isEmpty) return '?';
    if (words.length == 1) return words.first.substring(0, 1).toUpperCase();
    return (words[0].substring(0, 1) + words[1].substring(0, 1)).toUpperCase();
  }

  /// Sân mở cửa trọn khoảng [startMinute, endMinute] trong ngày.
  bool isOpenDuring(int startMinute, int endMinute) =>
      startMinute >= openMinutes && endMinute <= closeMinutes;

  static int _toMinutes(String value) {
    final parts = value.split(':');
    final hour = int.tryParse(parts.first) ?? 0;
    final minute = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
    return hour * 60 + minute;
  }

  Court copyWith({
    String? id,
    int? apiId,
    String? name,
    String? address,
    int? pricePerHour,
    double? rating,
    int? numberOfCourts,
    bool? isActive,
    String? sport,
    double? distanceMeters,
    String? openTime,
    String? closeTime,
    String? province,
    String? district,
    List<String>? tags,
    int? promoCount,
    String? imageUrl,
    String? contactPhone,
    String? mapLink,
    double? latitude,
    double? longitude,
  }) {
    return Court(
      id: id ?? this.id,
      apiId: apiId ?? this.apiId,
      name: name ?? this.name,
      address: address ?? this.address,
      pricePerHour: pricePerHour ?? this.pricePerHour,
      rating: rating ?? this.rating,
      numberOfCourts: numberOfCourts ?? this.numberOfCourts,
      isActive: isActive ?? this.isActive,
      sport: sport ?? this.sport,
      distanceMeters: distanceMeters ?? this.distanceMeters,
      openTime: openTime ?? this.openTime,
      closeTime: closeTime ?? this.closeTime,
      province: province ?? this.province,
      district: district ?? this.district,
      tags: tags ?? this.tags,
      promoCount: promoCount ?? this.promoCount,
      imageUrl: imageUrl ?? this.imageUrl,
      contactPhone: contactPhone ?? this.contactPhone,
      mapLink: mapLink ?? this.mapLink,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
    );
  }
}
