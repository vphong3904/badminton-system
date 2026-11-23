import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/complaint_api.dart';
import '../../../shared/app_message_box.dart';

/// Khách đang khiếu nại ở hoàn cảnh nào → đổi gợi ý lý do cho dễ chọn.
enum ComplaintStage {
  /// Đã (hoặc chưa) gửi ảnh chuyển khoản, chủ sân chưa duyệt / từ chối.
  paymentPending,

  /// Đã thanh toán thành công.
  paid,

  /// Đơn đã hủy (chờ hoàn tiền / đã hoàn tiền / không hoàn).
  cancelled,
}

const Map<ComplaintStage, List<String>> _suggestions = {
  ComplaintStage.paymentPending: [
    'Tôi đã chuyển khoản nhưng chủ sân chưa xác nhận.',
    'Chủ sân từ chối dù tôi đã chuyển khoản đúng số tiền.',
    'Chủ sân không phản hồi tôi.',
  ],
  ComplaintStage.paid: [
    'Chủ sân từ chối cho tôi vào sân dù đã thanh toán.',
    'Sân không đúng như thông tin đã đăng.',
    'Chủ sân có thái độ không tốt.',
  ],
  ComplaintStage.cancelled: [
    'Chủ sân chưa hoàn tiền cho tôi.',
    'Số tiền hoàn lại không đúng.',
    'Chủ sân tự ý hủy lịch của tôi.',
  ],
};

/// Bảng "Khiếu nại chủ sân". Trả về true nếu gửi thành công (hoặc đơn đã khiếu nại từ trước)
/// để nơi gọi tải lại danh sách đơn. Gửi xong sẽ tự hiện thông báo thành công.
/// Admin là người đọc và xử lý khiếu nại.
Future<bool> showComplaintSheet(
  BuildContext context, {
  required int bookingId,
  required String venueName,
  bool atCancel = false,
  ComplaintStage stage = ComplaintStage.paymentPending,
}) async {
  final result = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    // Vuốt xuống đóng form bằng pop cứng, không chặn được khi đang gửi.
    enableDrag: false,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _ComplaintForm(
      bookingId: bookingId,
      venueName: venueName,
      atCancel: atCancel,
      stage: stage,
    ),
  );
  if (result == null) return false;
  if (result == _sentOk && context.mounted) {
    await showSuccessBox(
      context,
      title: 'Đã gửi khiếu nại',
      message: 'Quản trị viên sẽ xem xét và phản hồi bạn trong mục Thông báo. '
          'Bạn không cần gửi thêm, mỗi đơn chỉ có một khiếu nại.',
    );
  }
  return true;
}

const String _sentOk = 'ok';
const String _sentBefore = 'before';

/// Nút "Khiếu nại chủ sân" dùng chung (thanh toán, lịch đặt, đơn đã hủy...).
/// Luôn hiện ở mọi đơn; đã khiếu nại rồi thì chuyển sang trạng thái "Đã khiếu nại" và không bấm được.
class ComplaintButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final bool compact;
  final double? height; // đặt để thu nhỏ nút (mặc định cao 44)
  final String label;

  const ComplaintButton({
    super.key,
    required this.onPressed,
    this.compact = false,
    this.height,
    this.label = 'Khiếu nại chủ sân',
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final color = enabled ? AppTheme.warning : AppTheme.hintGrey;
    return SizedBox(
      width: compact ? null : double.infinity,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(
          enabled ? Icons.report_problem_outlined : Icons.check_circle_outline,
          size: 18,
        ),
        label: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          disabledForegroundColor: AppTheme.hintGrey,
          backgroundColor: enabled ? AppTheme.warningSoft : Colors.transparent,
          side: BorderSide(
            color: enabled ? AppTheme.warning.withValues(alpha: 0.55) : AppTheme.fieldBorder,
          ),
          minimumSize: Size(0, height ?? 44),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }
}

class _ComplaintForm extends StatefulWidget {
  final int bookingId;
  final String venueName;
  final bool atCancel;
  final ComplaintStage stage;

  const _ComplaintForm({
    required this.bookingId,
    required this.venueName,
    required this.atCancel,
    required this.stage,
  });

  @override
  State<_ComplaintForm> createState() => _ComplaintFormState();
}

class _ComplaintFormState extends State<_ComplaintForm> {
  static const int _minLength = 10;
  static const int _maxLength = 1000;

  final _controller = TextEditingController();
  bool _sending = false;
  bool _alreadySent = false; // 409: đơn này đã khiếu nại → chỉ còn nút Đóng
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _useSuggestion(String text) {
    final current = _controller.text.trim();
    final next = current.isEmpty ? text : '$current\n$text';
    if (next.length > _maxLength) return;
    setState(() {
      _controller.text = next;
      _controller.selection = TextSelection.collapsed(offset: next.length);
      _error = null;
    });
  }

  Future<void> _send() async {
    if (_sending) return;
    final text = _controller.text.trim();
    if (text.length < _minLength) {
      setState(() => _error = 'Bạn hãy mô tả rõ hơn một chút nhé (ít nhất $_minLength ký tự).');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ComplaintApi.submit(
        bookingId: widget.bookingId,
        content: text,
        atCancel: widget.atCancel,
      );
      if (mounted) Navigator.pop(context, _sentOk);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _alreadySent = e.isConflict;
        _error = e.isConflict ? 'Bạn đã gửi khiếu nại cho đơn này rồi, quản trị viên đang xử lý.' : e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Chưa gửi được khiếu nại. Bạn kiểm tra kết nối mạng rồi thử lại nhé.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final chips = _suggestions[widget.stage] ?? const <String>[];

    // Đang gửi: chặn Back và chạm ra ngoài để không mất kết quả gửi.
    return PopScope(
      canPop: !_sending,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          10,
          20,
          MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppTheme.mintLine,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(
                      color: AppTheme.warningSoft,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.report_problem_outlined,
                      color: AppTheme.warning,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Khiếu nại chủ sân',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.ink,
                          ),
                        ),
                        Text(
                          widget.venueName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: AppTheme.hintGrey, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Đóng',
                    onPressed: _sending ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.mintSoft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.shield_outlined, size: 18, color: AppTheme.primaryColor),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Quản trị viên sẽ xem xét và báo kết quả cho bạn trong mục Thông báo. '
                        'Mỗi đơn chỉ gửi được một khiếu nại.',
                        style: TextStyle(fontSize: 12.5, height: 1.4, color: AppTheme.ink),
                      ),
                    ),
                  ],
                ),
              ),
              if (chips.isNotEmpty && !_alreadySent) ...[
                const SizedBox(height: 14),
                const Text(
                  'Chọn nhanh vấn đề bạn gặp',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.ink),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final text in chips)
                      ActionChip(
                        label: Text(text, style: const TextStyle(fontSize: 12.5)),
                        onPressed: _sending ? null : () => _useSuggestion(text),
                        backgroundColor: Colors.white,
                        side: const BorderSide(color: AppTheme.mintLine),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 14),
              TextField(
                controller: _controller,
                enabled: !_sending && !_alreadySent,
                maxLines: 5,
                maxLength: _maxLength,
                decoration: InputDecoration(
                  hintText: 'Hãy kể ngắn gọn chuyện đã xảy ra để quản trị viên hỗ trợ bạn nhanh hơn...',
                  hintStyle: const TextStyle(fontSize: 13.5, color: AppTheme.hintGrey),
                  filled: true,
                  fillColor: AppTheme.backgroundColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2, bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.error_outline_rounded, size: 16, color: AppTheme.danger),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          _error!,
                          style: const TextStyle(color: AppTheme.danger, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton(
                  onPressed: _sending
                      ? null
                      : (_alreadySent ? () => Navigator.pop(context, _sentBefore) : _send),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  child: _sending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          _alreadySent ? 'Đóng' : 'Gửi khiếu nại',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
