import 'dart:math' as math;

/// Khoảng cách đường chim bay (mét) giữa hai toạ độ theo công thức Haversine.
double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
  const earthRadius = 6371000.0; // mét
  double rad(double deg) => deg * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final a =
      math.pow(math.sin(dLat / 2), 2) +
      math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * earthRadius * math.asin(math.min(1.0, math.sqrt(a)));
}

/// Toạ độ hợp lệ (không phải 0,0 và nằm trong giới hạn kinh/vĩ độ).
bool isValidLatLng(double? lat, double? lng) =>
    lat != null &&
    lng != null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat == 0 && lng == 0);
