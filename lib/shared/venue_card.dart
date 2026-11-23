import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../core/utils/map_launcher.dart';
import 'round_icon_button.dart';
import '../features/favorites/favorites_store.dart';
import '../models/court_model.dart';

/// Thẻ thông tin sân.
class VenueCard extends StatelessWidget {
  final Court court;
  final VoidCallback onOpen;

  /// false: ẩn huy hiệu đánh giá.
  final bool showRating;

  const VenueCard({
    super.key,
    required this.court,
    required this.onOpen,
    this.showRating = true,
  });

  // Nền banner: các sắc xanh nhạt (không dùng màu tối/khác tông).
  static const List<List<Color>> _palettes = [
    [Color(0xFFDDF1E5), Color(0xFFF1F9F4)],
    [Color(0xFFCFE7D8), Color(0xFFEAF6EF)],
    [Color(0xFFE3F4EA), Color(0xFFD2EBDD)],
    [Color(0xFFD7EFE1), Color(0xFFF6FCF8)],
  ];

  List<Color> get _palette {
    final value = court.id.codeUnits.fold<int>(
      0,
      (previous, current) => previous + current,
    );

    return _palettes[value % _palettes.length];
  }

  Color _tagColor(String tag) {
    switch (tag) {
      default:
        return AppTheme.primaryColor;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onOpen,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [_buildBanner(context), _buildInfo(context)],
          ),
        ),
      ),
    );
  }

  // BANNER SÂN

  Widget _buildBanner(BuildContext context) {
    return SizedBox(
      height: 104,
      width: double.infinity,
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: _palette,
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
            ),
          ),

          // Tên sân.
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 34, 20, 8),
              child: Center(
                child: Text(
                  court.name.toUpperCase(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppTheme.ink,
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ),
          ),

          // Đánh giá và tag.
          Positioned(top: 10, left: 10, child: _buildTagStrip()),

          // Yêu thích và chỉ đường.
          Positioned(
            top: 8,
            right: 8,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListenableBuilder(
                  listenable: FavoritesStore.instance,
                  builder: (context, _) {
                    final isFavorite = FavoritesStore.instance.isFavorite(
                      court.id,
                    );

                    return RoundIconButton(
                      tooltip: isFavorite
                          ? 'Bỏ yêu thích'
                          : 'Thêm vào yêu thích',
                      icon: isFavorite ? Icons.favorite : Icons.favorite_border,
                      color: isFavorite
                          ? AppTheme.danger
                          : AppTheme.ink,
                      onTap: () {
                        FavoritesStore.instance.toggle(
                          court.id,
                          (message) => ScaffoldMessenger.of(context)
                              .showSnackBar(SnackBar(content: Text(message))),
                        );
                      },
                    );
                  },
                ),
                const SizedBox(width: 8),
                RoundIconButton(
                  tooltip: 'Chỉ đường',
                  icon: Icons.alt_route,
                  color: Colors.black87,
                  onTap: () => MapLauncher.openMap(
                    context,
                    mapLink: court.mapLink,
                    address: court.address,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ĐÁNH GIÁ VÀ TAG

  Widget _buildTagStrip() {
    if (!showRating && court.tags.isEmpty) {
      return const SizedBox.shrink();
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showRating)
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(8, 4, 10, 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.star,
                    size: 18,
                    color: court.rating > 0 ? AppTheme.star : AppTheme.hintGrey,
                  ),
                  if (court.rating > 0) ...[
                    const SizedBox(width: 3),
                    Text(
                      court.rating.toStringAsFixed(1),
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ...court.tags.map(
            (tag) => Container(
              color: _tagColor(tag),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Text(
                tag,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // THÔNG TIN SÂN

  Widget _buildInfo(BuildContext context) {
    final distance = court.distanceMeters;

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 25,
            backgroundColor: AppTheme.mintSoft,
            child: Text(
              court.initials,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppTheme.primaryColor,
                fontWeight: FontWeight.w900,
                fontSize: 15,
              ),
            ),
          ),

          const SizedBox(width: 10),

          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  court.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF1F2937),
                  ),
                ),

                const SizedBox(height: 4),

                Text.rich(
                  TextSpan(
                    children: [
                      if (distance != null)
                        TextSpan(
                          text: '(${formatDistance(distance)}) ',
                          style: const TextStyle(
                            color: AppTheme.distanceOrange,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      TextSpan(text: court.address),
                    ],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF1F2937),
                  ),
                ),

                const SizedBox(height: 5),

                Row(
                  children: [
                    const Icon(
                      Icons.access_time,
                      size: 15,
                      color: Color(0xFF1F2937),
                    ),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        court.hoursLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF1F2937),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(width: 8),

          _buildBookButton(),
        ],
      ),
    );
  }

  // NÚT ĐẶT LỊCH

  Widget _buildBookButton() {
    final enabled = court.isActive;

    final borderRadius = court.promoCount > 0
        ? const BorderRadius.vertical(bottom: Radius.circular(6))
        : BorderRadius.circular(6);

    return SizedBox(
      width: 102,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (court.promoCount > 0)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: const BoxDecoration(
                color: Color(0xFFE5484D),
                borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.card_giftcard,
                    size: 12,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      'Ưu đãi ${court.promoCount}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          Material(
            color: enabled ? AppTheme.accentGold : Colors.grey.shade400,
            borderRadius: borderRadius,
            child: InkWell(
              borderRadius: BorderRadius.circular(6),
              onTap: enabled ? onOpen : null,
              child: const SizedBox(
                width: double.infinity,
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6, vertical: 10),
                  child: Center(
                    child: Text(
                      'ĐẶT LỊCH',
                      maxLines: 1,
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
