import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Bộ "hộp thông báo" dùng chung của app (thay cho AlertDialog / SnackBar trơn).
///
/// Quy ước màu theo đúng bảng màu dự án (xanh nhạt + trắng, [AppTheme]):
///  - [MessageKind.success]  xanh lá chủ đạo  → làm xong việc
///  - [MessageKind.info]     xanh lá chủ đạo  → thông tin / hướng dẫn
///  - [MessageKind.question] xanh lá chủ đạo  → hỏi xác nhận
///  - [MessageKind.warning]  cam              → lưu ý, đang chờ
///  - [MessageKind.danger]   đỏ               → lỗi, việc không thể hoàn tác
///
/// QUY TẮC VIẾT NỘI DUNG (nhìn từ phía KHÁCH HÀNG, không phải lập trình viên):
///  - Nói chuyện như nhân viên hỗ trợ: "Chưa gửi được ảnh" thay vì "Upload thất bại".
///  - Không lộ từ kỹ thuật: server, API, demo, cấu hình, token, mã lỗi...
///  - Luôn nói được 2 điều: chuyện gì đã xảy ra + khách nên làm gì tiếp theo.
enum MessageKind { success, info, question, warning, danger }

class _KindStyle {
  final IconData icon;
  final Color color;
  final Color soft;

  const _KindStyle(this.icon, this.color, this.soft);
}

_KindStyle _styleOf(MessageKind kind) {
  switch (kind) {
    case MessageKind.success:
      return const _KindStyle(
        Icons.check_rounded,
        AppTheme.primaryColor,
        AppTheme.mintSoft,
      );
    case MessageKind.info:
      return const _KindStyle(
        Icons.info_outline_rounded,
        AppTheme.primaryColor,
        AppTheme.mintSoft,
      );
    case MessageKind.question:
      return const _KindStyle(
        Icons.help_outline_rounded,
        AppTheme.primaryColor,
        AppTheme.mintSoft,
      );
    case MessageKind.warning:
      return const _KindStyle(
        Icons.warning_amber_rounded,
        AppTheme.warning,
        AppTheme.warningSoft,
      );
    case MessageKind.danger:
      return const _KindStyle(
        Icons.error_outline_rounded,
        AppTheme.danger,
        AppTheme.dangerSoft,
      );
  }
}

/// Kiểu nút trong hộp thông báo.
enum MessageActionStyle {
  /// Nút chính (xanh).
  primary,

  /// Nút phụ viền nhạt.
  secondary,

  /// Nút chính nhưng nguy hiểm (đỏ) — hủy đặt, xóa, đăng xuất.
  danger,

  /// Nút cam — khiếu nại, lưu ý.
  warning,

  /// Chữ trơn, ít nổi bật.
  text,
}

/// Một nút ở cuối hộp thông báo. Bấm vào thì hộp đóng và trả về [value].
class MessageAction<T> {
  final String label;
  final T value;
  final MessageActionStyle style;
  final IconData? icon;

  const MessageAction({
    required this.label,
    required this.value,
    this.style = MessageActionStyle.primary,
    this.icon,
  });
}

/// Hiện hộp thông báo. Trả về giá trị của nút được bấm (null nếu chạm ra ngoài để đóng).
Future<T?> showAppMessageBox<T>(
  BuildContext context, {
  required MessageKind kind,
  required String title,
  String? message,
  Widget? content,
  required List<MessageAction<T>> actions,
  bool dismissible = true,
  IconData? icon,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: dismissible,
    barrierLabel: 'Đóng thông báo',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (dialogContext, animation, secondaryAnimation) {
      return PopScope(
        canPop: dismissible,
        child: _AppMessageBox<T>(
          kind: kind,
          title: title,
          message: message,
          content: content,
          actions: actions,
          icon: icon,
        ),
      );
    },
    transitionBuilder: (dialogContext, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutBack,
        reverseCurve: Curves.easeIn,
      );
      return FadeTransition(
        opacity: animation,
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.9, end: 1).animate(curved),
          child: child,
        ),
      );
    },
  );
}

/// Thông báo một nút (đã hiểu / đóng). Dùng cho kết quả, lời nhắn, lỗi cần khách chú ý.
Future<void> showInfoBox(
  BuildContext context, {
  required String title,
  required String message,
  MessageKind kind = MessageKind.info,
  String buttonLabel = 'Đã hiểu',
  Widget? content,
}) async {
  await showAppMessageBox<bool>(
    context,
    kind: kind,
    title: title,
    message: message,
    content: content,
    actions: [MessageAction<bool>(label: buttonLabel, value: true)],
  );
}

/// Thông báo thành công (tick xanh).
Future<void> showSuccessBox(
  BuildContext context, {
  required String title,
  required String message,
  String buttonLabel = 'Đã hiểu',
}) {
  return showInfoBox(
    context,
    title: title,
    message: message,
    kind: MessageKind.success,
    buttonLabel: buttonLabel,
  );
}

/// Thông báo lỗi (dấu chấm than đỏ).
Future<void> showErrorBox(
  BuildContext context, {
  required String title,
  required String message,
  String buttonLabel = 'Đóng',
}) {
  return showInfoBox(
    context,
    title: title,
    message: message,
    kind: MessageKind.danger,
    buttonLabel: buttonLabel,
  );
}

/// Hỏi xác nhận (2 nút). Trả về true nếu khách chọn nút xác nhận.
/// [danger] = true cho việc không hoàn tác được (hủy đặt, xóa, đăng xuất) → nút đỏ.
Future<bool> showConfirmBox(
  BuildContext context, {
  required String title,
  String? message,
  Widget? content,
  required String confirmLabel,
  String cancelLabel = 'Để sau',
  MessageKind? kind,
  bool danger = false,
}) async {
  final result = await showAppMessageBox<bool>(
    context,
    kind: kind ?? (danger ? MessageKind.danger : MessageKind.question),
    title: title,
    message: message,
    content: content,
    actions: [
      MessageAction<bool>(
        label: confirmLabel,
        value: true,
        style: danger ? MessageActionStyle.danger : MessageActionStyle.primary,
      ),
      MessageAction<bool>(
        label: cancelLabel,
        value: false,
        style: MessageActionStyle.secondary,
      ),
    ],
  );
  return result == true;
}

/// Thanh thông báo nhanh ở đáy màn hình (thay SnackBar trơn): có biểu tượng + màu theo loại.
void showAppToast(
  BuildContext context,
  String message, {
  MessageKind kind = MessageKind.info,
  SnackBarAction? action,
}) {
  final style = _styleOf(kind);
  final accent = kind == MessageKind.info || kind == MessageKind.question
      ? AppTheme.mintLine
      : style.color;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        backgroundColor: AppTheme.ink,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        action: action,
        content: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.2),
                shape: BoxShape.circle,
              ),
              child: Icon(style.icon, size: 18, color: accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ),
      ),
    );
}

class _AppMessageBox<T> extends StatelessWidget {
  final MessageKind kind;
  final String title;
  final String? message;
  final Widget? content;
  final List<MessageAction<T>> actions;
  final IconData? icon;

  const _AppMessageBox({
    required this.kind,
    required this.title,
    required this.message,
    required this.content,
    required this.actions,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final style = _styleOf(kind);

    return Dialog(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 26, 22, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _badge(style),
                      const SizedBox(height: 16),
                      Text(
                        title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          height: 1.25,
                          color: AppTheme.ink,
                        ),
                      ),
                      if (message != null && message!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          message!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 14,
                            height: 1.45,
                            color: AppTheme.hintGrey,
                          ),
                        ),
                      ],
                      if (content != null) ...[
                        const SizedBox(height: 14),
                        SizedBox(width: double.infinity, child: content),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              for (var i = 0; i < actions.length; i++) ...[
                if (i > 0) const SizedBox(height: 10),
                _actionButton(context, actions[i]),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// Biểu tượng tròn 2 lớp (vòng ngoài nhạt, vòng trong đậm hơn).
  Widget _badge(_KindStyle style) {
    return Container(
      width: 84,
      height: 84,
      decoration: BoxDecoration(
        color: style.soft.withValues(alpha: 0.55),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Container(
        width: 60,
        height: 60,
        decoration: BoxDecoration(color: style.soft, shape: BoxShape.circle),
        child: Icon(icon ?? style.icon, size: 32, color: style.color),
      ),
    );
  }

  Widget _actionButton(BuildContext context, MessageAction<T> action) {
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
    const labelStyle = TextStyle(fontSize: 15, fontWeight: FontWeight.w700);
    final onPressed = () => Navigator.of(context).pop<T>(action.value);

    Widget label(Color color) {
      final text = Text(
        action.label,
        textAlign: TextAlign.center,
        style: labelStyle.copyWith(color: color),
      );
      if (action.icon == null) return text;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(action.icon, size: 18, color: color),
          const SizedBox(width: 8),
          Flexible(child: text),
        ],
      );
    }

    Widget filled(Color background) {
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            backgroundColor: background,
            foregroundColor: Colors.white,
            elevation: 0,
            shape: shape,
          ),
          child: label(Colors.white),
        ),
      );
    }

    switch (action.style) {
      case MessageActionStyle.primary:
        return filled(AppTheme.primaryColor);
      case MessageActionStyle.danger:
        return filled(AppTheme.danger);
      case MessageActionStyle.warning:
        return filled(AppTheme.warning);
      case MessageActionStyle.secondary:
        return SizedBox(
          width: double.infinity,
          height: 48,
          child: OutlinedButton(
            onPressed: onPressed,
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.ink,
              side: const BorderSide(color: AppTheme.fieldBorder, width: 1.2),
              shape: shape,
            ),
            child: label(AppTheme.ink),
          ),
        );
      case MessageActionStyle.text:
        return SizedBox(
          width: double.infinity,
          height: 44,
          child: TextButton(
            onPressed: onPressed,
            style: TextButton.styleFrom(
              foregroundColor: AppTheme.hintGrey,
              shape: shape,
            ),
            child: label(AppTheme.hintGrey),
          ),
        );
    }
  }
}
