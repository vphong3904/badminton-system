import 'package:flutter_application_1/core/config/app_config.dart';

/// Điểm tập trung để tích hợp API backend.
/// Hiện tại ứng dụng vẫn dùng dữ liệu mẫu trong bộ nhớ.
class ApiClient {
  ApiClient._();

  static const String baseUrl = AppConfig.apiBaseUrl;
}
