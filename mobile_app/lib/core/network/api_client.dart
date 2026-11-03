import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:http_parser/http_parser.dart' show MediaType;

import 'package:flutter_application_1/core/config/app_config.dart';

/// Lỗi trả về từ API (hoặc lỗi kết nối) với thông báo tiếng Việt hiển thị
/// trực tiếp cho người dùng.
class ApiException implements Exception {
  final String message;
  final String? code;
  final int? statusCode;

  const ApiException(this.message, {this.code, this.statusCode});

  bool get isUnauthorized => statusCode == 401;
  bool get isConflict => statusCode == 409;

  @override
  String toString() => message;
}

/// Client HTTP dùng chung cho toàn bộ ứng dụng.
///
/// Backend luôn trả JSON dạng:
///   thành công: `{ "thanhCong": true,  "duLieu": ... }`
///   thất bại:   `{ "thanhCong": false, "loi": { "maLoi", "thongBao" } }`
/// Các hàm ở đây trả về phần `duLieu` hoặc ném [ApiException].
class ApiClient {
  ApiClient._();

  static const String baseUrl = AppConfig.apiBaseUrl;
  static const Duration _timeout = Duration(seconds: 20);

  static String? _token;

  /// Token đăng nhập (JWT). Lưu trong bộ nhớ, mất khi tắt app.
  static String? get token => _token;
  static bool get hasToken => _token != null && _token!.isNotEmpty;

  static void setToken(String? value) => _token = value;
  static void clearToken() => _token = null;

  /// Đổi đường dẫn tương đối của file tải lên (vd `/tep-tai-len/a.jpg`)
  /// thành URL đầy đủ. URL tuyệt đối được giữ nguyên.
  static String resolveFileUrl(String pathOrUrl) {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    final origin = Uri.parse(baseUrl).replace(path: '', query: null);
    final prefix = origin.toString().replaceAll(RegExp(r'/+$'), '');
    return pathOrUrl.startsWith('/') ? '$prefix$pathOrUrl' : '$prefix/$pathOrUrl';
  }

  static Uri _uri(String path, [Map<String, String>? query]) {
    final uri = Uri.parse('$baseUrl$path');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: query);
  }

  static Map<String, String> _headers({bool json = false}) {
    return <String, String>{
      'Accept': 'application/json',
      if (json) 'Content-Type': 'application/json; charset=utf-8',
      if (hasToken) 'Authorization': 'Bearer $_token',
    };
  }

  static Future<dynamic> get(String path, {Map<String, String>? query}) {
    return _send(http.Request('GET', _uri(path, query))..headers.addAll(_headers()));
  }

  static Future<dynamic> post(String path, {Object? body}) {
    final request = http.Request('POST', _uri(path))
      ..headers.addAll(_headers(json: body != null));
    if (body != null) request.body = jsonEncode(body);
    return _send(request);
  }

  static Future<dynamic> delete(String path) {
    return _send(http.Request('DELETE', _uri(path))..headers.addAll(_headers()));
  }

  static Future<dynamic> patch(String path, {Object? body}) {
    final request = http.Request('PATCH', _uri(path))
      ..headers.addAll(_headers(json: body != null));
    if (body != null) request.body = jsonEncode(body);
    return _send(request);
  }

  /// Tải một file ảnh lên (multipart/form-data). Dùng bytes nên chạy được cả
  /// trên Android lẫn Flutter Web.
  static Future<dynamic> uploadImage(
    String path, {
    required String field,
    required XFile file,
  }) async {
    final request = http.MultipartRequest('POST', _uri(path))
      ..headers.addAll(_headers());
    request.files.add(
      http.MultipartFile.fromBytes(
        field,
        await file.readAsBytes(),
        filename: file.name,
        contentType: _imageMediaType(file.name),
      ),
    );
    return _send(request, timeout: const Duration(seconds: 60));
  }

  static MediaType _imageMediaType(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return MediaType('image', 'png');
    if (lower.endsWith('.webp')) return MediaType('image', 'webp');
    return MediaType('image', 'jpeg');
  }

  static Future<dynamic> _send(
    http.BaseRequest request, {
    Duration timeout = _timeout,
  }) async {
    try {
      final streamed = await request.send().timeout(timeout);
      final response = await http.Response.fromStream(streamed).timeout(timeout);
      return _unwrap(response);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException('Máy chủ phản hồi quá chậm. Vui lòng thử lại.');
    } on SocketException {
      throw const ApiException(
        'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ API.',
      );
    } on http.ClientException {
      throw const ApiException(
        'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ API.',
      );
    }
  }

  static dynamic _unwrap(http.Response response) {
    dynamic decoded;
    try {
      decoded = jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      decoded = null;
    }

    final ok = response.statusCode >= 200 && response.statusCode < 300;
    if (ok && decoded is Map<String, dynamic> && decoded['thanhCong'] == true) {
      return decoded['duLieu'];
    }

    String message = 'Có lỗi xảy ra (mã ${response.statusCode}). Vui lòng thử lại.';
    String? code;
    if (decoded is Map<String, dynamic> && decoded['loi'] is Map) {
      final error = decoded['loi'] as Map;
      final text = error['thongBao'];
      if (text is String && text.isNotEmpty) message = text;
      final errorCode = error['maLoi'];
      if (errorCode is String) code = errorCode;
    }

    if (response.statusCode == 401) {
      // Token hết hạn hoặc không hợp lệ: bỏ token để lần sau đăng nhập lại.
      clearToken();
    }
    throw ApiException(message, code: code, statusCode: response.statusCode);
  }
}
