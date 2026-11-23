import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:zxing2/qrcode.dart' as zx;

import '../../../core/theme/app_theme.dart';

/// Ảnh đã giải mã thành điểm ảnh RGBA (4 byte/điểm), gửi sang isolate để đọc QR.
class _RgbaImage {
  final Uint8List rgba;
  final int width;
  final int height;
  const _RgbaImage(this.rgba, this.width, this.height);
}

const int _maxDecodeSide = 2400; // ảnh lớn hơn thì giải mã thu nhỏ để đỡ tốn RAM

/// Giải mã ảnh (JPG/PNG/WebP/HEIC...) bằng codec của hệ điều hành — bắt được nhiều định dạng hơn gói `image`.
/// Lỗi thì rơi về gói `image` (Dart thuần). Trả null nếu không giải mã được.
Future<_RgbaImage?> _loadRgba(Uint8List bytes) async {
  try {
    var codec = await ui.instantiateImageCodec(bytes);
    var frame = await codec.getNextFrame();
    var image = frame.image;
    final longest = image.width > image.height ? image.width : image.height;
    if (longest > _maxDecodeSide) {
      final landscape = image.width >= image.height;
      image.dispose();
      codec.dispose();
      codec = await ui.instantiateImageCodec(
        bytes,
        targetWidth: landscape ? _maxDecodeSide : null,
        targetHeight: landscape ? null : _maxDecodeSide,
      );
      frame = await codec.getNextFrame();
      image = frame.image;
    }
    final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    final result = data == null
        ? null
        : _RgbaImage(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes), image.width, image.height);
    image.dispose();
    codec.dispose();
    if (result != null) return result;
  } catch (e) {
    debugPrint('Codec hệ thống không đọc được ảnh: $e');
  }
  try {
    final decoded = img.decodeImage(bytes);
    if (decoded == null) return null;
    final rgba = decoded.convert(numChannels: 4).getBytes(order: img.ChannelOrder.rgba);
    return _RgbaImage(Uint8List.fromList(rgba), decoded.width, decoded.height);
  } catch (e) {
    debugPrint('Gói image không đọc được ảnh: $e');
    return null;
  }
}

/// Thu nhỏ ảnh xám bằng cách lấy trung bình từng khối (giữ nét hơn lấy mẫu thẳng).
Uint8List _resizeGray(Uint8List src, int w, int h, int nw, int nh) {
  final out = Uint8List(nw * nh);
  for (var dy = 0; dy < nh; dy++) {
    final y0 = dy * h ~/ nh;
    final y1 = ((dy + 1) * h ~/ nh).clamp(y0 + 1, h);
    for (var dx = 0; dx < nw; dx++) {
      final x0 = dx * w ~/ nw;
      final x1 = ((dx + 1) * w ~/ nw).clamp(x0 + 1, w);
      var sum = 0;
      for (var y = y0; y < y1; y++) {
        final row = y * w;
        for (var x = x0; x < x1; x++) {
          sum += src[row + x];
        }
      }
      out[dy * nw + dx] = sum ~/ ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/// Thử đọc 1 ảnh xám: thêm viền trắng (vùng yên tĩnh quanh QR) rồi thử 2 bộ nhị phân hoá, kể cả QR đảo màu.
String? _tryDecodeGray(Uint8List gray, int w, int h) {
  final pad = (w > h ? w : h) ~/ 8 + 16;
  final pw = w + pad * 2;
  final ph = h + pad * 2;
  for (final invert in const [false, true]) {
    final pixels = Int32List(pw * ph);
    for (var y = 0; y < ph; y++) {
      for (var x = 0; x < pw; x++) {
        final inside = x >= pad && x < pad + w && y >= pad && y < pad + h;
        var l = inside ? gray[(y - pad) * w + (x - pad)] : 255;
        if (invert && inside) l = 255 - l; // QR sáng trên nền tối: đảo màu, viền vẫn trắng
        pixels[y * pw + x] = 0xFF000000 | (l << 16) | (l << 8) | l;
      }
    }
    final source = zx.RGBLuminanceSource(pw, ph, pixels);
    for (final binarize in <zx.BinaryBitmap Function()>[
      () => zx.BinaryBitmap(zx.HybridBinarizer(source)),
      () => zx.BinaryBitmap(zx.GlobalHistogramBinarizer(source)),
    ]) {
      try {
        return zx.QRCodeReader().decode(binarize()).text;
      } catch (_) {
        // NotFound/Checksum/Format: thử cách khác
      }
    }
  }
  return null;
}

/// Đọc mã QR từ ảnh bằng Dart thuần (zxing2) — đường dự phòng khi plugin quét không đọc được ảnh.
/// Thử nhiều cỡ ảnh (QR trong ảnh chụp màn hình thường nhỏ, thu nhỏ quá sẽ nát). Chạy trong isolate qua `compute`.
String? _decodeQrFromRgba(_RgbaImage src) {
  final w = src.width;
  final h = src.height;
  final gray = Uint8List(w * h);
  for (var i = 0, p = 0; i < gray.length; i++, p += 4) {
    final r = src.rgba[p], g = src.rgba[p + 1], b = src.rgba[p + 2];
    final a = src.rgba[p + 3];
    final l = (r * 299 + g * 587 + b * 114) ~/ 1000;
    gray[i] = a == 255 ? l : (l * a + 255 * (255 - a)) ~/ 255; // nền trong suốt coi như trắng
  }

  final longest = w > h ? w : h;
  // Thử cỡ phổ biến trước cho nhanh; ảnh nhỏ hơn mốc nào thì dùng đúng cỡ gốc.
  final sizes = <int>{
    for (final s in const [1000, 1600, 640, 2400, 400]) s < longest ? s : longest,
  };
  for (final side in sizes) {
    if (side == longest) {
      final text = _tryDecodeGray(gray, w, h);
      if (text != null) return text;
      continue;
    }
    final nw = w >= h ? side : (w * side / h).round().clamp(1, side);
    final nh = h > w ? side : (h * side / w).round().clamp(1, side);
    final text = _tryDecodeGray(_resizeGray(gray, w, h, nw, nh), nw, nh);
    if (text != null) return text;
  }
  return null;
}

/// Màn quét QR check-in tại sân (G3.9). Quét được mã đầu tiên thì đóng màn và trả về chuỗi QR thô
/// (`Navigator.pop<String>`); khách bấm quay lại thì trả null. Việc kiểm tra đúng/sai do backend làm.
/// Hai cách lấy mã: quét trực tiếp bằng camera, hoặc chọn ảnh QR có sẵn trong thư viện ảnh (ảnh chụp/ảnh chủ sân gửi).
class QrScanScreen extends StatefulWidget {
  /// Tên sân/cơ sở + giờ chơi, hiện phía trên khung quét để khách biết đang check-in đơn nào.
  final String title;
  final String subtitle;

  const QrScanScreen({super.key, required this.title, required this.subtitle});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  final MobileScannerController _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  final ImagePicker _picker = ImagePicker();
  bool _handled = false; // chỉ nhận 1 lần quét
  bool _analyzing = false; // đang đọc QR từ ảnh đã chọn

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue;
      if (value != null && value.trim().isNotEmpty) {
        _handled = true;
        Navigator.of(context).pop<String>(value);
        return;
      }
    }
  }

  /// Khách chọn ảnh có mã QR trong thư viện → đọc mã từ ảnh, giống như vừa quét bằng camera.
  /// Thử plugin quét trước; nếu lỗi hoặc không thấy mã thì đọc lại bằng zxing2 (Dart thuần).
  Future<void> _pickFromGallery() async {
    if (_handled || _analyzing) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _analyzing = true);
    Object? pluginError;
    try {
      // requestFullMetadata=false: không đòi quyền đọc vị trí ảnh (Android 10+), tránh lỗi/hộp thoại quyền thừa.
      final picked = await _picker.pickImage(source: ImageSource.gallery, requestFullMetadata: false);
      if (picked == null) return; // khách đóng bộ chọn ảnh

      String? value;
      try {
        final capture = await _controller.analyzeImage(
          picked.path,
          formats: const [BarcodeFormat.qrCode],
        );
        for (final barcode in capture?.barcodes ?? const <Barcode>[]) {
          final raw = barcode.rawValue;
          if (raw != null && raw.trim().isNotEmpty) {
            value = raw;
            break;
          }
        }
      } catch (e) {
        pluginError = e; // vẫn thử đường dự phòng bên dưới
        debugPrint('analyzeImage lỗi: $e');
      }

      if (value == null) {
        final bytes = await picked.readAsBytes();
        final decoded = await _loadRgba(bytes);
        if (decoded == null) {
          if (!mounted) return;
          messenger.showSnackBar(
            const SnackBar(content: Text('Không mở được ảnh này. Bạn thử chọn ảnh JPG/PNG khác.')),
          );
          return;
        }
        value = await compute(_decodeQrFromRgba, decoded);
      }
      if (!mounted) return;

      if (value == null || value.trim().isEmpty) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('Không tìm thấy mã QR trong ảnh. Hãy chọn ảnh rõ nét, thấy đủ cả mã QR.'),
          ),
        );
        return;
      }
      _handled = true;
      Navigator.of(context).pop<String>(value);
    } catch (e) {
      debugPrint('Đọc ảnh QR lỗi: $e (plugin: $pluginError)');
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text('Không đọc được ảnh này (${e.runtimeType}). Bạn thử chọn ảnh khác hoặc quét trực tiếp bằng camera.')),
      );
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

  /// Camera bị từ chối quyền / không dùng được: nói rõ cách xử lý thay vì để màn đen.
  Widget _cameraError(BuildContext context, MobileScannerException error) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.all(24),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.no_photography_outlined, color: Colors.white70, size: 48),
          const SizedBox(height: 12),
          Text(
            denied ? 'Chưa cho phép dùng camera' : 'Không mở được camera',
            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            denied
                ? 'Vào Cài đặt của điện thoại, cho phép ứng dụng dùng camera rồi quay lại quét. '
                    'Nếu vẫn không được, hãy báo chủ sân để check-in giúp bạn.'
                : 'Bạn thử đóng màn này rồi mở lại. Nếu vẫn không được, hãy báo chủ sân để check-in giúp bạn.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70, height: 1.4),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Quét QR check-in'),
        actions: [
          IconButton(
            tooltip: 'Chọn ảnh QR từ thư viện',
            onPressed: _analyzing ? null : _pickFromGallery,
            icon: const Icon(Icons.photo_library_outlined),
          ),
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, _) {
              if (state.torchState == TorchState.unavailable) return const SizedBox.shrink();
              final on = state.torchState == TorchState.on;
              return IconButton(
                tooltip: on ? 'Tắt đèn' : 'Bật đèn',
                onPressed: _controller.toggleTorch,
                icon: Icon(on ? Icons.flash_on_rounded : Icons.flash_off_rounded),
              );
            },
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: _cameraError,
          ),
          // Khung ngắm.
          IgnorePointer(
            child: Center(
              child: Container(
                width: 250,
                height: 250,
                decoration: BoxDecoration(
                  border: Border.all(color: AppTheme.primaryColor, width: 3),
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: 28,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    widget.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                  if (widget.subtitle.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(widget.subtitle, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                  ],
                  const SizedBox(height: 8),
                  const Text(
                    'Hướng camera vào mã QR check-in dán tại sân (không phải mã chuyển khoản).',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 12.5, height: 1.35),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: _analyzing ? null : _pickFromGallery,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white54),
                    ),
                    icon: _analyzing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.photo_library_outlined, size: 18),
                    label: Text(_analyzing ? 'Đang đọc ảnh...' : 'Chọn ảnh QR từ thư viện'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}