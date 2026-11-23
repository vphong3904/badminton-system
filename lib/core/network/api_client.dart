import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;

import '../config/app_config.dart';

/// Lỗi trả về từ API (hoặc lỗi kết nối) với thông báo tiếng Việt hiển thị
/// trực tiếp cho người dùng.
class ApiException implements Exception {
  final String message;
  final String? code;
  final int? statusCode;

  /// Lỗi theo từng trường do backend trả về (`loi.chiTiet`): tên trường -> thông báo.
  final Map<String, String> details;

  /// `loi.chiTiet` khi backend trả OBJECT (vd 409 `{cacCumTrung:[…]}`, 429 `{soLan, chanDen…}`); null nếu không phải object.
  final Map<String, dynamic>? data;

  /// Mất kết nối / không tới được máy chủ (chưa có phản hồi HTTP).
  final bool isNetwork;

  /// Quá thời gian chờ phản hồi.
  final bool isTimeout;

  const ApiException(
    this.message, {
    this.code,
    this.statusCode,
    this.details = const <String, String>{},
    this.data,
    this.isNetwork = false,
    this.isTimeout = false,
  });

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isConflict => statusCode == 409;

  /// Máy chủ/CSDL bận hoặc đang bảo trì (502/503/504).
  bool get isServiceUnavailable =>
      statusCode == 502 || statusCode == 503 || statusCode == 504;

  /// Lỗi hạ tầng: nên hiện nút "Thử lại" thay vì báo lỗi nhập liệu.
  bool get isInfrastructure =>
      isNetwork || isTimeout || isServiceUnavailable || statusCode == 500;

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

  /// Gọi khi một API cần đăng nhập trả 401 (phiên hết hạn). Token đã bị xoá
  /// trước khi gọi. Không gọi cho chính các API đăng nhập/đăng ký.
  static void Function()? onUnauthorized;

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

  /// Gửi 1 file ảnh dạng multipart. Content-Type lấy theo đuôi file vì backend kiểm mime.
  /// Gửi file ảnh bằng bytes (chạy được cả trên web, nơi `XFile.path` chỉ là blob URL
  /// nên không đọc được bằng đường dẫn).
  static Future<dynamic> postFileBytes(
    String path, {
    required String field,
    required List<int> bytes,
    required String filename,
    Map<String, String>? fields,
  }) async {
    final lower = filename.toLowerCase();
    final subtype = lower.endsWith('.png')
        ? 'png'
        : lower.endsWith('.webp')
            ? 'webp'
            : 'jpeg';
    final request = http.MultipartRequest('POST', _uri(path))
      ..headers.addAll(_headers())
      ..files.add(http.MultipartFile.fromBytes(
        field,
        bytes,
        filename: filename,
        contentType: MediaType('image', subtype),
      ));
    // Trường văn bản đi kèm (vd `thoiDiemChuyen`), chỉ gửi khi có.
    if (fields != null) request.fields.addAll(fields);
    return _send(request, timeout: const Duration(seconds: 60));
  }

  static Future<dynamic> postFile(
    String path, {
    required String field,
    required String filePath,
  }) async {
    final lower = filePath.toLowerCase();
    final subtype = lower.endsWith('.png')
        ? 'png'
        : lower.endsWith('.webp')
            ? 'webp'
            : 'jpeg';
    final request = http.MultipartRequest('POST', _uri(path))
      ..headers.addAll(_headers())
      ..files.add(await http.MultipartFile.fromPath(
        field,
        filePath,
        contentType: MediaType('image', subtype),
      ));
    return _send(request, timeout: const Duration(seconds: 60));
  }

  static Future<dynamic> delete(String path) {
    return _send(http.Request('DELETE', _uri(path))..headers.addAll(_headers()));
  }

  /// PUT JSON (G4.7: cập nhật tài khoản nhận hoàn).
  static Future<dynamic> put(String path, {Object? body}) {
    final request = http.Request('PUT', _uri(path))
      ..headers.addAll(_headers(json: body != null));
    if (body != null) request.body = jsonEncode(body);
    return _send(request);
  }

  static Future<dynamic> patch(String path, {Object? body}) {
    final request = http.Request('PATCH', _uri(path))
      ..headers.addAll(_headers(json: body != null));
    if (body != null) request.body = jsonEncode(body);
    return _send(request);
  }

  static Future<dynamic> _send(
    http.BaseRequest request, {
    Duration timeout = _timeout,
  }) async {
    try {
      final streamed = await request.send().timeout(timeout);
      final response = await http.Response.fromStream(streamed).timeout(timeout);
      return _unwrap(response, request.url.path);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(
        'Máy chủ phản hồi quá chậm. Vui lòng thử lại.',
        isTimeout: true,
      );
    } on SocketException {
      throw const ApiException(
        'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ API.',
        isNetwork: true,
      );
    } on http.ClientException {
      throw const ApiException(
        'Không kết nối được máy chủ. Kiểm tra mạng hoặc địa chỉ API.',
        isNetwork: true,
      );
    }
  }

  static dynamic _unwrap(http.Response response, String path) {
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

    final status = response.statusCode;
    String? serverMessage;
    String? code;
    final details = <String, String>{};
    Map<String, dynamic>? data;
    if (decoded is Map<String, dynamic> && decoded['loi'] is Map) {
      final error = decoded['loi'] as Map;
      final text = error['thongBao'];
      if (text is String && text.isNotEmpty) serverMessage = text;
      final errorCode = error['maLoi'];
      if (errorCode is String) code = errorCode;
      final rawDetails = error['chiTiet'];
      if (rawDetails is Map) data = rawDetails.cast<String, dynamic>();
      if (rawDetails is List) {
        for (final item in rawDetails) {
          if (item is Map && item['truong'] is String && item['thongBao'] is String) {
            details.putIfAbsent(item['truong'] as String, () => item['thongBao'] as String);
          }
        }
      }
    }

    String message;
    if (status == 502 || status == 504 || (status == 503 && serverMessage == null)) {
      // Proxy/hạ tầng trả về, không có JSON của backend.
      message = 'Máy chủ đang bận hoặc bảo trì. Vui lòng thử lại sau ít phút.';
    } else if (status == 500) {
      message = 'Lỗi máy chủ. Vui lòng thử lại sau.';
    } else if (status == 401 && !_isAuthPath(path)) {
      message = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    } else if (status == 400 && details.isNotEmpty) {
      // BE trả lỗi theo trường (cùng câu chữ với validators.dart): hiện luôn lỗi cụ thể
      // thay vì "Dữ liệu không hợp lệ".
      message = details.values.first;
    } else {
      message = serverMessage ?? 'Có lỗi xảy ra (mã $status). Vui lòng thử lại.';
    }

    if (status == 401 && !_isAuthPath(path)) {
      // Token hết hạn hoặc không hợp lệ: bỏ token và báo cho ứng dụng.
      clearToken();
      onUnauthorized?.call();
    }
    throw ApiException(message, code: code, statusCode: status, details: details, data: data);
  }

  /// Các API đăng nhập/đăng ký: 401 ở đây là sai mật khẩu, không phải hết phiên.
  static bool _isAuthPath(String path) =>
      path.contains('/tai-khoan/dang-nhap') || path.contains('/tai-khoan/dang-ky');
}
