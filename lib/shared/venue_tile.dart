import 'package:flutter/material.dart';
import '../core/network/api_client.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/formatters.dart';
import '../features/favorites/favorites_store.dart';
import '../models/court_model.dart';
import 'venue_placeholder.dart';

/// Thẻ sân dạng gọn (1 hàng, cao ~92dp) dùng ở màn Tìm kiếm.
/// Ảnh nhỏ bên trái · tên/địa chỉ/giờ ở giữa · ♡ và giá bên phải.
class VenueTile extends StatelessWidget {
  final Court court;
  final VoidCallback onOpen;

  const VenueTile({super.key, required this.court, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final cover = court.imageUrl;
    final distance = court.distanceMeters;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onOpen,
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.mintLine),
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 76,
                  height: 76,
                  child: cover == null
                      ? VenuePlaceholder(initials: court.initials, iconSize: 26)
                      : Image.network(
                          ApiClient.resolveFileUrl(cover),
                          fit: BoxFit.cover,
                          cacheWidth: 240, // giảm RAM/băng thông ảnh
                          errorBuilder: (_, _, _) => VenuePlaceholder(
                            initials: court.initials,
                            iconSize: 26,
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      court.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.ink,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      distance == null
                          ? court.address
                          : '${formatDistance(distance)} · ${court.address}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: AppTheme.hintGrey),
                    ),
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        Icon(
                          Icons.star_rounded,
                          size: 16,
                          color: court.rating > 0 ? AppTheme.star : AppTheme.mintLine,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          court.rating > 0 ? court.rating.toStringAsFixed(1) : 'Mới',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(width: 10),
                        const Icon(Icons.access_time, size: 14, color: AppTheme.hintGrey),
                        const SizedBox(width: 3),
                        Flexible(
                          child: Text(
                            court.hoursLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: AppTheme.hintGrey),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  ListenableBuilder(
                    listenable: FavoritesStore.instance,
                    builder: (context, _) {
                      final fav = FavoritesStore.instance.isFavorite(court.id);
                      return InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () => FavoritesStore.instance.toggle(
                          court.id,
                          (m) => ScaffoldMessenger.of(context)
                              .showSnackBar(SnackBar(content: Text(m))),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(4),
                          child: Icon(
                            fav ? Icons.favorite : Icons.favorite_border,
                            size: 20,
                            color: fav ? AppTheme.danger : AppTheme.hintGrey,
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 14),
                  if (court.pricePerHour > 0)
                    Text(
                      'từ ${formatMoney(court.pricePerHour)}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.primaryColor,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
