import 'package:flutter/material.dart';

import 'app_message_box.dart';

/// Hộp thoại xác nhận dùng chung. Trả về true nếu người dùng chọn nút xác nhận.
/// Giao diện do [showConfirmBox] (app_message_box.dart) vẽ; [danger] = true cho việc không hoàn tác được.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String cancelLabel = 'Ở lại',
  bool danger = false,
}) {
  return showConfirmBox(
    context,
    title: title,
    message: message,
    confirmLabel: confirmLabel,
    cancelLabel: cancelLabel,
    danger: danger,
    kind: danger ? MessageKind.danger : MessageKind.warning,
  );
}
