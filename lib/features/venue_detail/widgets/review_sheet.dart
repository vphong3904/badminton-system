import 'package:flutter/material.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../data/venue_detail_api.dart';

/// Bảng viết đánh giá (1–5 sao + bình luận ≤ 1000 ký tự) cho 1 đơn đã hoàn thành.
/// Trả về true nếu gửi thành công (hoặc đơn đã được đánh giá từ trước) → nơi gọi
/// nên tải lại danh sách. Backend: BE-05a (`POST /khach/dat-san/:maDatSan/danh-gia`).
///
/// Sửa đánh giá: truyền [editing] = true cùng [initialStars]/[initialContent]; khi đó gọi
/// `PATCH /khach/dat-san/:maDatSan/danh-gia` với [bookingId] là buổi đang giữ đánh giá.
Future<bool> showReviewSheet(
  BuildContext context, {
  required int bookingId,
  required int venueId,
  required String venueName,
  bool editing = false,
  int initialStars = 0,
  String? initialContent,
}) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    // Vuốt xuống đóng form bằng pop cứng, không chặn được khi đang gửi.
    enableDrag: false,
    backgroundColor: Colors.white,
    builder: (_) => _ReviewForm(
      bookingId: bookingId,
      venueId: venueId,
      venueName: venueName,
      editing: editing,
      initialStars: initialStars,
      initialContent: initialContent,
    ),
  );
  return ok == true;
}

class _ReviewForm extends StatefulWidget {
  final int bookingId;
  final int venueId;
  final String venueName;
  final bool editing;
  final int initialStars;
  final String? initialContent;

  const _ReviewForm({
    required this.bookingId,
    required this.venueId,
    required this.venueName,
    this.editing = false,
    this.initialStars = 0,
    this.initialContent,
  });

  @override
  State<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends State<_ReviewForm> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initialContent ?? '');
  late int _stars = widget.initialStars.clamp(0, 5);
  bool _sending = false;
  bool _alreadyReviewed = false; // 409 REVIEW_EXISTS → chỉ còn nút Đóng
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_sending) return;
    final text = _controller.text.trim();
    // Kiểm ở máy khách trước khi gọi API.
    if (_stars < 1) {
      setState(() => _error = 'Vui lòng chọn số sao.');
      return;
    }
    if (text.length > 1000) {
      setState(() => _error = 'Bình luận tối đa 1000 ký tự.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      if (widget.editing) {
        await VenueDetailApi.updateReview(
          bookingId: widget.bookingId,
          stars: _stars,
          content: text,
        );
      } else {
        await VenueDetailApi.postReview(
          bookingId: widget.bookingId,
          stars: _stars,
          content: text,
        );
      }
      VenueDetailApi.invalidateReviews(widget.venueId);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      // 409: BOOKING_NOT_COMPLETED / PAYMENT_NOT_COMPLETED / REVIEW_EXISTS / REVIEW_EDIT_EXPIRED /
      // REVIEW_HIDDEN — hiện đúng `message` backend trả về.
      final locked = e.code == 'REVIEW_EXISTS' ||
          e.code == 'REVIEW_EDIT_EXPIRED' ||
          e.code == 'REVIEW_HIDDEN';
      if (locked) {
        VenueDetailApi.invalidateReviews(widget.venueId);
      }
      setState(() {
        _sending = false;
        _alreadyReviewed = locked; // chỉ còn nút Đóng
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = 'Không thể gửi đánh giá. Vui lòng thử lại.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Đang gửi: chặn Back và chạm ra ngoài để không mất kết quả gửi.
    return PopScope(
      canPop: !_sending,
      child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.editing ? 'Sửa đánh giá' : 'Đánh giá sân',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Đóng',
                  onPressed: _sending ? null : () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              widget.venueName,
              style: const TextStyle(color: AppTheme.hintGrey),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 1; i <= 5; i++)
                  IconButton(
                    onPressed: _sending ? null : () => setState(() => _stars = i),
                    iconSize: 38,
                    icon: Icon(
                      i <= _stars ? Icons.star_rounded : Icons.star_outline_rounded,
                      color: i <= _stars ? AppTheme.star : AppTheme.mintLine,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _controller,
              enabled: !_sending,
              maxLines: 4,
              maxLength: 1000,
              decoration: InputDecoration(
                hintText: 'Chia sẻ trải nghiệm của bạn (không bắt buộc)',
                filled: true,
                fillColor: AppTheme.backgroundColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 4),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppTheme.danger, fontSize: 13),
                ),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(
                onPressed: _sending
                    ? null
                    : (_alreadyReviewed
                          ? () => Navigator.pop(context, true)
                          : _send),
                child: _sending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: Colors.white,
                        ),
                      )
                    : Text(_alreadyReviewed ? 'Đóng' : (widget.editing ? 'Lưu thay đổi' : 'Gửi đánh giá')),
              ),
            ),
          ],
        ),
      ),
    ),
    );
  }
}
