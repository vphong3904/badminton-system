import 'package:flutter/material.dart';
import '../../../shared/app_message_box.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/map_launcher.dart';
import '../../favorites/favorites_store.dart';
import '../data/venue_detail_api.dart';
import '../../../models/court_model.dart';
import '../../../shared/round_icon_button.dart';
import '../../../shared/venue_placeholder.dart';
import '../../../models/venue_detail_model.dart';

/// Chi tiết cơ sở (thiết kế riêng, không bắt chước app nào):
/// gallery ảnh → thẻ thông tin → Giới thiệu/Sân → BẢNG GIÁ → ĐÁNH GIÁ
/// → thanh "Đặt lịch" cố định ở đáy. Chỉ dùng màu xanh nhạt + trắng.
/// Spec: docs/agent/features/venue-detail/screens.md
class VenueDetailScreen extends StatefulWidget {
  final Court court;
  final VoidCallback onBook;

  const VenueDetailScreen({super.key, required this.court, required this.onBook});

  @override
  State<VenueDetailScreen> createState() => _VenueDetailScreenState();
}

class _VenueDetailScreenState extends State<VenueDetailScreen> {
  VenueDetail? _detail;
  bool _loading = true;
  bool _failed = false;
  bool _descExpanded = false;

  List<PriceRow>? _prices;
  bool _pricesLoading = false;
  bool _pricesFailed = false;
  // Thứ đang xem trong bảng giá: 1 = T2 … 7 = CN (mặc định hôm nay). Mỗi thứ có bảng giá riêng.
  int _priceDay = DateTime.now().weekday;

  List<VenueReview>? _reviews;
  bool _reviewsLoading = false;
  bool _reviewsFailed = false;
  bool _showAllReviews = false;
  bool _loadingMore = false;
  int _reviewPage = 1;
  int _reviewTotal = 0; // tongSo từ máy chủ

  final _priceKey = GlobalKey();
  final _reviewKey = GlobalKey();
  final _infoKey = GlobalKey();
  final _pageController = PageController();
  int _page = 0;

  Court get court => widget.court;

  @override
  void initState() {
    super.initState();
    _load();
    _loadReviews(); // độc lập với chi tiết → chạy song song
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- tải dữ liệu

  Future<void> _load({bool force = false}) async {
    final id = court.venueId;
    if (id == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final detail = await VenueDetailApi.fetch(id, force: force);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
      });
      _loadPrices(); // bảng giá cần mã sân → sau khi có chi tiết
    } on ApiException catch (error) {
      if (!mounted) return;
      if (error.isNotFound) {
        await showInfoBox(
          context,
          title: 'Sân này tạm ngưng hoạt động',
          message: 'Cơ sở này hiện không nhận đặt sân. Bạn hãy chọn một sân khác nhé.',
          kind: MessageKind.warning,
          buttonLabel: 'Quay lại',
        );
        if (mounted) Navigator.pop(context);
        return;
      }
      setState(() {
        _loading = false;
        _failed = true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  Future<void> _loadPrices() async {
    final courts = _detail?.courts ?? const <VenueCourt>[];
    if (_pricesLoading || courts.isEmpty) return;
    setState(() {
      _pricesLoading = true;
      _pricesFailed = false;
    });
    try {
      final rows = await VenueDetailApi.fetchPrices(
        courts.first.id,
        venueId: court.venueId,
      );
      if (!mounted) return;
      setState(() {
        _prices = rows;
        _pricesLoading = false;
        // Hôm nay chưa có giá mà nhóm ngày kia có thì mở sẵn thứ đầu tiên của nhóm có giá.
        if (!rows.any((r) => r.appliesTo(_priceDay))) {
          for (var d = 1; d <= 7; d++) {
            if (rows.any((r) => r.appliesTo(d))) {
              _priceDay = d;
              break;
            }
          }
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _pricesLoading = false;
        _pricesFailed = true;
      });
    }
  }

  Future<void> _loadReviews({bool force = false}) async {
    final id = court.venueId;
    if (id == null || _reviewsLoading) return;
    setState(() {
      _reviewsLoading = true;
      _reviewsFailed = false;
    });
    try {
      final res = await VenueDetailApi.fetchReviews(id, force: force);
      if (!mounted) return;
      setState(() {
        _reviews = res.items;
        _reviewPage = res.page;
        _reviewTotal = res.total;
        _reviewsLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _reviewsLoading = false;
        _reviewsFailed = true;
      });
    }
  }

  /// Tải trang kế tiếp của danh sách bình luận (nút "Xem thêm").
  Future<void> _loadMoreReviews() async {
    final id = court.venueId;
    final current = _reviews;
    if (id == null || current == null || _loadingMore) return;
    setState(() => _loadingMore = true);
    try {
      final res = await VenueDetailApi.fetchReviews(id, page: _reviewPage + 1);
      if (!mounted) return;
      setState(() {
        _reviews = [...current, ...res.items];
        _reviewPage = res.page;
        // Trang rỗng → dừng, tránh bấm mãi không có gì thêm.
        _reviewTotal = res.items.isEmpty ? current.length : res.total;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingMore = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Chưa tải thêm được bình luận, bạn thử lại sau nhé.')),
        );
    }
  }

  // ------------------------------------------------------------------ dữ liệu

  String? get _phone => _detail?.phone ?? court.contactPhone;
  String? get _mapLink => _detail?.mapLink ?? court.mapLink;
  int get _reviewCount => _detail?.reviewCount ?? 0;

  /// Ảnh đầu trang = chỉ ảnh bìa (tính riêng); ảnh sân nằm ở mục "Ảnh sân".
  List<String> get _images {
    final detailCover = _detail?.coverUrl;
    if (detailCover != null) return [detailCover];
    final cover = court.imageUrl;
    return cover == null ? const [] : [ApiClient.resolveFileUrl(cover)];
  }

  static final RegExp _phonePattern = RegExp(r'^0\d{9,10}$');
  bool _isDialable(String phone) =>
      _phonePattern.hasMatch(phone.replaceAll(RegExp(r'[^0-9]'), ''));

  void _openMap() =>
      MapLauncher.openMap(context, mapLink: _mapLink, address: court.address);

  void _scrollTo(GlobalKey key) {
    final ctx = key.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      alignment: 0.02,
    );
  }

  // --------------------------------------------------------------------- UI

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: Column(
        children: [
          Expanded(
            child: RefreshIndicator(
              color: AppTheme.primaryColor,
              onRefresh: () async {
                await _load(force: true);
                await _loadReviews(force: true);
              },
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  _gallery(),
                  _infoCard(),
                  if (_failed) _errorBanner(),
                  _quickNav(),
                  _aboutSection(),
                  _priceSection(),
                  _reviewSection(),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          _bottomBar(),
        ],
      ),
    );
  }

  // ---- gallery + nút nổi
  Widget _gallery() {
    final images = _images;
    final top = MediaQuery.of(context).padding.top;

    Widget content;
    if (_loading && images.isEmpty) {
      content = Container(color: AppTheme.mintSoft);
    } else if (images.isEmpty) {
      content = VenuePlaceholder(initials: court.initials, iconSize: 56);
    } else {
      content = PageView.builder(
        controller: _pageController,
        itemCount: images.length,
        onPageChanged: (i) => setState(() => _page = i),
        itemBuilder: (_, i) => GestureDetector(
          onTap: () => _openFullscreen(images, i),
          child: Image.network(
            images[i],
            fit: BoxFit.cover,
            cacheWidth: 900,
            loadingBuilder: (_, child, p) =>
                p == null ? child : Container(color: AppTheme.mintSoft),
            errorBuilder: (_, _, _) =>
                VenuePlaceholder(initials: court.initials, iconSize: 56),
          ),
        ),
      );
    }

    return SizedBox(
      height: 230 + top,
      child: Stack(
        children: [
          Positioned.fill(child: content),
          Positioned(
            top: top + 8,
            left: 12,
            right: 12,
            child: Row(
              children: [
                RoundIconButton(
                  tooltip: 'Quay lại',
                  icon: Icons.arrow_back,
                  color: AppTheme.ink,
                  onTap: () => Navigator.maybePop(context),
                ),
                const Spacer(),
                _favoriteButton(),
                const SizedBox(width: 8),
                RoundIconButton(
                  tooltip: 'Chỉ đường',
                  icon: Icons.alt_route,
                  color: AppTheme.ink,
                  onTap: _openMap,
                ),
              ],
            ),
          ),
          if (images.length > 1)
            Positioned(
              bottom: 10,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < images.length; i++)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: i == _page ? 16 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: i == _page ? Colors.white : Colors.white70,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _favoriteButton() {
    return ListenableBuilder(
      listenable: FavoritesStore.instance,
      builder: (context, _) {
        final fav = FavoritesStore.instance.isFavorite(court.id);
        return RoundIconButton(
          tooltip: fav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích',
          icon: fav ? Icons.favorite : Icons.favorite_border,
          color: fav ? AppTheme.danger : AppTheme.ink,
          onTap: () => FavoritesStore.instance.toggle(
            court.id,
            (message) => ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(message))),
          ),
        );
      },
    );
  }

  void _openFullscreen(List<String> images, int start) {
    final index = ValueNotifier<int>(start);
    Navigator.of(context)
        .push<void>(
          MaterialPageRoute<void>(
            fullscreenDialog: true,
            builder: (_) => Scaffold(
              backgroundColor: Colors.black,
              appBar: AppBar(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                title: images.length > 1
                    ? ValueListenableBuilder<int>(
                        valueListenable: index,
                        builder: (_, i, _) => Text('${i + 1}/${images.length}'),
                      )
                    : null,
              ),
              body: PageView(
                controller: PageController(initialPage: start),
                onPageChanged: (i) => index.value = i,
                children: [
                  for (final url in images)
                    InteractiveViewer(
                      child: Image.network(
                        url,
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) =>
                            const Center(child: Icon(Icons.broken_image, color: Colors.white54)),
                      ),
                    ),
                ],
              ),
            ),
          ),
        )
        .whenComplete(index.dispose);
  }

  // ---- thẻ thông tin
  Widget _card({required Widget child, Key? key, EdgeInsets? margin}) {
    return Container(
      key: key,
      width: double.infinity,
      margin: margin ?? const EdgeInsets.fromLTRB(12, 10, 12, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.mintLine),
      ),
      child: child,
    );
  }

  Widget _chip(String text, {IconData? icon, VoidCallback? onTap, bool strong = false}) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: strong ? AppTheme.primaryColor : AppTheme.mintSoft,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 15, color: strong ? Colors.white : AppTheme.ink),
              const SizedBox(width: 4),
            ],
            Text(
              text,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: strong ? Colors.white : AppTheme.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String text, {VoidCallback? onTap, String? action}) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 19, color: AppTheme.primaryColor),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 14,
                  color: AppTheme.ink,
                  decoration: onTap != null && action == null
                      ? TextDecoration.underline
                      : null,
                  decorationColor: AppTheme.primaryColor,
                ),
              ),
            ),
            if (action != null)
              Text(
                action,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryColor,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _infoCard() {
    final phone = _phone;
    final rating = _detail?.rating ?? court.rating;
    return _card(
      key: _infoKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            court.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppTheme.ink,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _chip(
                rating > 0
                    ? '${rating.toStringAsFixed(1)} · $_reviewCount đánh giá'
                    : 'Chưa có đánh giá',
                icon: Icons.star_rounded,
                onTap: () => _scrollTo(_reviewKey),
              ),
              _chip(court.sport, icon: Icons.sports_tennis),
              _chip('${court.numberOfCourts} sân', icon: Icons.grid_view_rounded),
              if (court.pricePerHour > 0)
                _chip('Từ ${formatMoney(court.pricePerHour)}/giờ'),
            ],
          ),
          const Divider(height: 22, color: AppTheme.mintLine),
          _infoRow(Icons.place_outlined, court.address, onTap: _openMap, action: 'Chỉ đường'),
          _infoRow(Icons.access_time, 'Mở cửa ${court.hoursLabel}'),
          if (phone != null)
            _infoRow(
              Icons.phone_outlined,
              phone,
              onTap: _isDialable(phone) ? () => MapLauncher.call(context, phone) : null,
              action: _isDialable(phone) ? 'Gọi' : null,
            ),
        ],
      ),
    );
  }

  Widget _errorBanner() {
    return _card(
      child: Row(
        children: [
          const Icon(Icons.cloud_off, color: AppTheme.hintGrey),
          const SizedBox(width: 10),
          const Expanded(
            child: Text('Không tải được thông tin chi tiết.', style: TextStyle(fontSize: 13)),
          ),
          TextButton(
            onPressed: () => _load(force: true),
            child: const Text('Thử lại'),
          ),
        ],
      ),
    );
  }

  // ---- thanh chuyển nhanh
  Widget _quickNav() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      child: Row(
        children: [
          _chip('Thông tin', onTap: () => _scrollTo(_infoKey)),
          const SizedBox(width: 8),
          _chip('Bảng giá', onTap: () => _scrollTo(_priceKey)),
          const SizedBox(width: 8),
          _chip('Đánh giá', onTap: () => _scrollTo(_reviewKey)),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text, {Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppTheme.ink,
              ),
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  // ---- giới thiệu, sân
  Widget _aboutSection() {
    final desc = _detail?.description;
    final courts = _detail?.courts ?? const <VenueCourt>[];
    if (_loading && desc == null) {
      return _card(child: _skeleton(3));
    }
    final courtImages = _detail?.courtImageUrls ?? const <String>[];
    if (desc == null && courts.isEmpty && courtImages.isEmpty) {
      return const SizedBox.shrink();
    }
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (desc != null) ...[
            _sectionTitle('Giới thiệu'),
            Text(
              desc,
              maxLines: _descExpanded ? null : 3,
              overflow: _descExpanded ? TextOverflow.visible : TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, height: 1.4, color: AppTheme.ink),
            ),
            if (desc.length > 120)
              GestureDetector(
                onTap: () => setState(() => _descExpanded = !_descExpanded),
                child: Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _descExpanded ? 'Thu gọn' : 'Xem thêm',
                    style: const TextStyle(
                      color: AppTheme.primaryColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 14),
          ],
          if (courts.isNotEmpty) ...[
            _sectionTitle('Các sân (${courts.length})'),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [for (final c in courts) _chip(c.name)],
            ),
          ],
          // Chủ sân không thêm ảnh sân → không hiện mục này.
          if (courtImages.isNotEmpty) ...[
            SizedBox(height: courts.isNotEmpty ? 14 : 0),
            _sectionTitle('Ảnh sân (${courtImages.length})'),
            _courtImageStrip(courtImages),
          ],
        ],
      ),
    );
  }

  /// Dải ảnh chi tiết sân (vuốt ngang); chạm để xem toàn màn hình.
  Widget _courtImageStrip(List<String> urls) {
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: urls.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          return GestureDetector(
            // Chỉ vuốt giữa các ảnh sân; ảnh bìa tính riêng ở đầu trang.
            onTap: () => _openFullscreen(urls, i),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 128,
                child: Image.network(
                  urls[i],
                  fit: BoxFit.cover,
                  cacheWidth: 400,
                  loadingBuilder: (_, child, p) =>
                      p == null ? child : Container(color: AppTheme.mintSoft),
                  errorBuilder: (_, _, _) =>
                      Container(color: AppTheme.mintSoft, child: const Icon(Icons.broken_image, color: AppTheme.hintGrey)),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _skeleton(int lines) {
    return Column(
      children: [
        for (var i = 0; i < lines; i++)
          Container(
            height: 12,
            margin: const EdgeInsets.symmetric(vertical: 5),
            decoration: BoxDecoration(
              color: AppTheme.mintSoft,
              borderRadius: BorderRadius.circular(6),
            ),
          ),
      ],
    );
  }

  // ---- bảng giá
  Widget _priceSection() {
    return _card(
      key: _priceKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle('Bảng giá sân'),
          _priceBody(),
        ],
      ),
    );
  }

  Widget _priceBody() {
    if (_loading || _pricesLoading) return _skeleton(4);
    if (_pricesFailed) {
      return Row(
        children: [
          const Expanded(child: Text('Không tải được bảng giá.')),
          TextButton(onPressed: _loadPrices, child: const Text('Thử lại')),
        ],
      );
    }
    final rows = _prices ?? const <PriceRow>[];
    if (rows.isEmpty) {
      return Text(
        court.pricePerHour > 0
            ? 'Giá từ ${formatMoney(court.pricePerHour)}/giờ. Bảng giá chi tiết đang được cập nhật.'
            : 'Chủ sân chưa cập nhật bảng giá.',
        style: const TextStyle(color: AppTheme.hintGrey),
      );
    }

    // Mỗi thứ có bảng giá riêng: chỉ lấy các dòng của đúng thứ đang chọn.
    final shown = rows.where((r) => r.appliesTo(_priceDay)).toList();

    // Gom theo khung giờ: mỗi khung có giá vãng lai + giá cố định.
    final slots = <String, Map<String, int>>{};
    for (final r in shown) {
      slots.putIfAbsent('${r.start}|${r.end}', () => {})[r.customerType] = r.pricePerHour;
    }
    final keys = slots.keys.toList()..sort();

    Widget cell(String text, {bool head = false, bool right = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 8),
      child: Text(
        text,
        textAlign: right ? TextAlign.right : TextAlign.left,
        style: TextStyle(
          fontSize: head ? 12.5 : 13.5,
          fontWeight: head ? FontWeight.w700 : FontWeight.w500,
          color: head ? AppTheme.hintGrey : AppTheme.ink,
        ),
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Bấm một thứ bất kỳ để xem giá của thứ đó.
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              for (var d = 1; d <= 7; d++)
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: d == 7 ? 0 : 5),
                    child: _dayTab(
                      d == 7 ? 'CN' : 'T${d + 1}',
                      _priceDay == d,
                      () => setState(() => _priceDay = d),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'Giá ${_priceDay == 7 ? 'Chủ nhật' : 'Thứ ${_priceDay + 1}'}'
            '${_priceDay == DateTime.now().weekday ? ' (hôm nay)' : ''}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.ink),
          ),
        ),
        if (keys.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'Chủ sân chưa cập nhật giá cho ngày này.',
              style: TextStyle(color: AppTheme.hintGrey),
            ),
          )
        else
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Table(
            columnWidths: const {
              0: FlexColumnWidth(1.25),
              1: FlexColumnWidth(1),
              2: FlexColumnWidth(1),
            },
            border: TableBorder(
              horizontalInside: BorderSide(color: AppTheme.mintLine),
            ),
            children: [
              TableRow(
                decoration: const BoxDecoration(color: AppTheme.mintSoft),
                children: [
                  cell('Khung giờ', head: true),
                  cell('Vãng lai', head: true, right: true),
                  cell('Cố định', head: true, right: true),
                ],
              ),
              for (final k in keys)
                TableRow(
                  children: [
                    cell(k.replaceAll('|', ' – ')),
                    cell(
                      slots[k]!['walk_in'] == null ? '—' : formatMoney(slots[k]!['walk_in']!),
                      right: true,
                    ),
                    cell(
                      slots[k]!['fixed'] == null ? '—' : formatMoney(slots[k]!['fixed']!),
                      right: true,
                    ),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Giá theo giờ. Số tiền thực tế do hệ thống tính khi bạn đặt sân.',
          style: TextStyle(fontSize: 12, color: AppTheme.hintGrey),
        ),
      ],
    );
  }

  Widget _dayTab(String text, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppTheme.primaryColor : AppTheme.mintSoft,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppTheme.ink,
          ),
        ),
      ),
    );
  }

  // ---- đánh giá
  Widget _stars(int n, {double size = 16}) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      for (var i = 1; i <= 5; i++)
        Icon(
          i <= n ? Icons.star_rounded : Icons.star_outline_rounded,
          size: size,
          color: i <= n ? AppTheme.star : AppTheme.mintLine,
        ),
    ],
  );

  void _writeReview() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Viết đánh giá',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Để đảm bảo đánh giá thật, bạn chỉ có thể đánh giá sau khi đã chơi xong. '
              'Vào "Lịch đặt sân của tôi" → mở đơn đã hoàn thành → bấm "Đánh giá sân".',
              style: TextStyle(color: AppTheme.hintGrey, height: 1.4),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Đã hiểu'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _reviewSection() {
    // Điểm TB mới nhất từ chi tiết cơ sở; chưa tải xong thì dùng từ danh sách.
    final rating = _detail?.rating ?? court.rating;
    final reviews = _reviews ?? const <VenueReview>[];
    final visible = _showAllReviews ? reviews : reviews.take(3).toList();

    return _card(
      key: _reviewKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionTitle(
            'Đánh giá',
            trailing: TextButton.icon(
              onPressed: _writeReview,
              icon: const Icon(Icons.edit_outlined, size: 17),
              label: const Text('Viết đánh giá'),
            ),
          ),
          Row(
            children: [
              Text(
                rating > 0 ? rating.toStringAsFixed(1) : '–',
                style: const TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.ink,
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _stars(rating.round(), size: 20),
                  const SizedBox(height: 2),
                  Text(
                    _reviewCount > 0 ? '$_reviewCount lượt đánh giá' : 'Chưa có lượt đánh giá',
                    style: const TextStyle(fontSize: 12.5, color: AppTheme.hintGrey),
                  ),
                ],
              ),
            ],
          ),
          const Divider(height: 24, color: AppTheme.mintLine),
          if (_reviewsLoading && _reviews == null)
            _skeleton(3)
          else if (_reviewsFailed)
            Row(
              children: [
                const Expanded(child: Text('Không tải được đánh giá.')),
                TextButton(
                  onPressed: () => _loadReviews(force: true),
                  child: const Text('Thử lại'),
                ),
              ],
            )
          else if (reviews.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Chưa có bình luận nào. Hãy là người đầu tiên đánh giá sân này!',
                style: TextStyle(color: AppTheme.hintGrey),
              ),
            )
          else ...[
            for (var i = 0; i < visible.length; i++) ...[
              if (i > 0) const Divider(height: 20, color: AppTheme.mintLine),
              _reviewTile(visible[i]),
            ],
            if (_reviewTotal > 3 || reviews.length > 3)
              Row(
                children: [
                  TextButton(
                    onPressed: () =>
                        setState(() => _showAllReviews = !_showAllReviews),
                    child: Text(
                      _showAllReviews
                          ? 'Thu gọn'
                          : 'Xem tất cả ${_reviewTotal > reviews.length ? _reviewTotal : reviews.length} bình luận',
                    ),
                  ),
                  const Spacer(),
                  if (_showAllReviews && reviews.length < _reviewTotal)
                    TextButton(
                      onPressed: _loadingMore ? null : _loadMoreReviews,
                      child: _loadingMore
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Xem thêm'),
                    ),
                ],
              ),
          ],
        ],
      ),
    );
  }

  Widget _reviewTile(VenueReview r) {
    final initial = r.author.trim().isEmpty ? '?' : r.author.trim()[0].toUpperCase();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: AppTheme.mintSoft,
          child: Text(
            initial,
            style: const TextStyle(
              color: AppTheme.primaryColor,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      r.author,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                  if (r.date != null)
                    Text(
                      r.date!,
                      style: const TextStyle(fontSize: 11.5, color: AppTheme.hintGrey),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              _stars(r.stars, size: 15),
              if (r.content != null) ...[
                const SizedBox(height: 4),
                Text(r.content!, style: const TextStyle(height: 1.35)),
              ],
              if (r.ownerReply != null)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.backgroundColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.storefront_outlined, size: 15, color: AppTheme.primaryColor),
                          const SizedBox(width: 6),
                          const Text(
                            'Phản hồi từ chủ sân',
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
                          ),
                          if (r.ownerReplyDate != null) ...[
                            const Spacer(),
                            Text(
                              r.ownerReplyDate!,
                              style: const TextStyle(fontSize: 11.5, color: AppTheme.hintGrey),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        r.ownerReply!,
                        style: const TextStyle(fontSize: 12.5, height: 1.35, color: AppTheme.hintGrey),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  // ---- thanh đặt lịch cố định
  Widget _bottomBar() {
    return Container(
      padding: EdgeInsets.fromLTRB(
        14,
        10,
        14,
        10 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppTheme.mintLine)),
      ),
      child: Row(
        children: [
          if (court.pricePerHour > 0)
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Từ', style: TextStyle(fontSize: 11.5, color: AppTheme.hintGrey)),
                  Text(
                    '${formatMoney(court.pricePerHour)}/giờ',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: AppTheme.ink,
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: SizedBox(
              height: 46,
              child: FilledButton(
                onPressed: court.isActive ? widget.onBook : null,
                style: FilledButton.styleFrom(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(
                  court.isActive ? 'Chọn ngày và đặt sân' : 'Cơ sở tạm ngưng hoạt động',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
