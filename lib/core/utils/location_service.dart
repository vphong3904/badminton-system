import 'dart:async';

import 'package:geolocator/geolocator.dart';

/// Lỗi lấy vị trí, [message] là câu tiếng Việt hiển thị thẳng cho người dùng.
class LocationException implements Exception {
  final String message;

  /// Gợi ý nút "Cài đặt" tương ứng (cả hai false = không có nút).
  final bool openAppSettings;
  final bool openLocationSettings;

  const LocationException(
    this.message, {
    this.openAppSettings = false,
    this.openLocationSettings = false,
  });

  @override
  String toString() => message;
}

class UserLocation {
  final double latitude;
  final double longitude;
  const UserLocation(this.latitude, this.longitude);
}

/// Xin quyền vị trí rồi lấy vị trí hiện tại của thiết bị.
class LocationService {
  LocationService._();

  /// Hỏi quyền (nếu chưa có) rồi trả về vị trí hiện tại.
  /// Ném [LocationException] khi GPS tắt, bị từ chối quyền hoặc không lấy được vị trí.
  static Future<UserLocation> getCurrentLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationException(
        'Vui lòng bật định vị (GPS) trên thiết bị để tìm sân gần bạn.',
        openLocationSettings: true,
      );
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission(); // hiện hộp thoại xin quyền
    }
    if (permission == LocationPermission.denied) {
      throw const LocationException(
        'Bạn chưa cho phép truy cập vị trí nên không thể tìm sân gần bạn.',
      );
    }
    if (permission == LocationPermission.deniedForever) {
      throw const LocationException(
        'Quyền vị trí đã bị tắt. Hãy bật lại trong Cài đặt của ứng dụng.',
        openAppSettings: true,
      );
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 15),
        ),
      );
      return UserLocation(position.latitude, position.longitude);
    } on TimeoutException {
      throw const LocationException(
        'Không xác định được vị trí kịp lúc. Hãy thử lại ở nơi thoáng hơn.',
      );
    } catch (_) {
      throw const LocationException('Không lấy được vị trí hiện tại. Vui lòng thử lại.');
    }
  }

  static Future<void> openAppSettings() => Geolocator.openAppSettings();
  static Future<void> openLocationSettings() => Geolocator.openLocationSettings();
}
