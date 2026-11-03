class Court {
  final String id;
  final String name;
  final String address;
  final int pricePerHour;
  final double rating;
  final int numberOfCourts;
  final List<String> amenities;
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

  const Court({
    required this.id,
    required this.name,
    required this.address,
    required this.pricePerHour,
    this.rating = 0,
    this.numberOfCourts = 1,
    this.amenities = const [],
    this.isActive = true,
    this.sport = 'Cầu lông',
    this.distanceMeters,
    this.openTime = '05:00',
    this.closeTime = '24:00',
    this.province = 'TP. Hồ Chí Minh',
    this.district = '',
    this.tags = const [],
    this.promoCount = 0,
  });

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
    String? name,
    String? address,
    int? pricePerHour,
    double? rating,
    int? numberOfCourts,
    List<String>? amenities,
    bool? isActive,
    String? sport,
    double? distanceMeters,
    String? openTime,
    String? closeTime,
    String? province,
    String? district,
    List<String>? tags,
    int? promoCount,
  }) {
    return Court(
      id: id ?? this.id,
      name: name ?? this.name,
      address: address ?? this.address,
      pricePerHour: pricePerHour ?? this.pricePerHour,
      rating: rating ?? this.rating,
      numberOfCourts: numberOfCourts ?? this.numberOfCourts,
      amenities: amenities ?? this.amenities,
      isActive: isActive ?? this.isActive,
      sport: sport ?? this.sport,
      distanceMeters: distanceMeters ?? this.distanceMeters,
      openTime: openTime ?? this.openTime,
      closeTime: closeTime ?? this.closeTime,
      province: province ?? this.province,
      district: district ?? this.district,
      tags: tags ?? this.tags,
      promoCount: promoCount ?? this.promoCount,
    );
  }
}
