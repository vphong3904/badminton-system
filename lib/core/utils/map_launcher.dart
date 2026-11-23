import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Mở Google Maps / gọi điện. Dùng chung cho thẻ danh sách và màn chi tiết.
class MapLauncher {
  MapLauncher._();

  /// Đích bản đồ: `linkBanDo` (http/https) nếu có, ngược lại tìm theo địa chỉ.
  static Uri destination({String? mapLink, required String address}) {
    final link = (mapLink ?? '').trim();
    if (link.startsWith('http://') || link.startsWith('https://')) {
      final parsed = Uri.tryParse(link);
      if (parsed != null) return parsed;
    }
    return Uri.https('www.google.com', '/maps/search/', {
      'api': '1',
      'query': address,
    });
  }

  static Future<void> openMap(
    BuildContext context, {
    String? mapLink,
    required String address,
  }) async {
    final uri = destination(mapLink: mapLink, address: address);
    final messenger = ScaffoldMessenger.of(context);
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened) {
      await Clipboard.setData(ClipboardData(text: uri.toString()));
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Không mở được Google Maps. Đã sao chép liên kết bản đồ.'),
        ),
      );
    }
  }

  static Future<void> call(BuildContext context, String phone) async {
    final messenger = ScaffoldMessenger.of(context);
    var opened = false;
    try {
      opened = await launchUrl(Uri(scheme: 'tel', path: phone));
    } catch (_) {
      opened = false;
    }
    if (!opened) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Không mở được ứng dụng gọi điện.')),
      );
    }
  }
}
