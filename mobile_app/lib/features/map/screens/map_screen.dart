import 'package:flutter/material.dart';
import 'package:flutter_application_1/core/theme/app_theme.dart';
import 'package:flutter_application_1/core/utils/formatters.dart';
import 'package:flutter_application_1/models/court_model.dart';
import 'package:flutter_application_1/shared/sport_pin.dart';
import 'package:flutter_application_1/shared/venue_card.dart';

/// Tab "Bản đồ" (bản minh họa).
/// TODO: thay vùng bản đồ bằng google_maps_flutter / flutter_map + geolocator
/// khi có API key và quyền vị trí. Vị trí ghim hiện được giả lập từ id sân.
class MapScreen extends StatefulWidget {
  final List<Court> courts;
  final ValueChanged<Court> onBook;

  const MapScreen({super.key, required this.courts, required this.onBook});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  String? selectedId;

  List<Court> get nearby {
    final list = widget.courts.where((c) => c.isActive).toList();
    list.sort(
      (a, b) => (a.distanceMeters ?? double.infinity).compareTo(
        b.distanceMeters ?? double.infinity,
      ),
    );
    return list;
  }

  /// Vị trí giả lập (0..1) ổn định theo id.
  Offset _fakePosition(Court court) {
    var hash = 7;
    for (final unit in court.id.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    final x = 0.10 + (hash % 80) / 100;
    final y = 0.12 + ((hash ~/ 97) % 70) / 100;
    return Offset(x, y);
  }

  @override
  Widget build(BuildContext context) {
    final courts = nearby;
    Court? selected;
    for (final court in courts) {
      if (court.id == selectedId) selected = court;
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Sân gần bạn',
                  style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
                ),
              ),
              Text(
                '${courts.length} sân',
                style: const TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 270,
          child: LayoutBuilder(
            builder: (context, box) {
              return ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: CustomPaint(painter: _FakeMapPainter()),
                    ),
                    // Vị trí của bạn.
                    Positioned(
                      left: box.maxWidth * 0.5 - 12,
                      top: 270 * 0.5 - 12,
                      child: Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: AppTheme.accentBlue,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: const [
                            BoxShadow(color: Colors.black26, blurRadius: 6),
                          ],
                        ),
                      ),
                    ),
                    for (final court in courts)
                      Positioned(
                        left: _fakePosition(court).dx * (box.maxWidth - 44),
                        top: _fakePosition(court).dy * (270 - 52),
                        child: GestureDetector(
                          onTap: () => setState(() => selectedId = court.id),
                          child: SportPin(
                            sport: sportCategoryOf(court.sport),
                            size: court.id == selectedId ? 52 : 40,
                          ),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 6, 16, 0),
          child: Text(
            'Bản đồ minh họa • Chưa tích hợp Google Maps / định vị',
            style: TextStyle(color: Colors.grey, fontSize: 11),
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              if (selected != null) ...[
                VenueCard(
                  court: selected,
                  onOpen: () => widget.onBook(selected!),
                ),
                const SizedBox(height: 14),
              ],
              ...courts
                  .where((c) => c.id != selectedId)
                  .map(
                    (court) => Card(
                      color: Colors.white,
                      elevation: 0,
                      child: ListTile(
                        leading: SportPin(
                          sport: sportCategoryOf(court.sport),
                          size: 36,
                        ),
                        title: Text(
                          court.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          '${court.distanceMeters == null ? '' : '${formatDistance(court.distanceMeters!)} • '}'
                          '${court.hoursLabel}',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => setState(() => selectedId = court.id),
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

class _FakeMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    canvas.drawRect(
      Rect.fromLTWH(0, 0, w, h),
      Paint()..color = const Color(0xFFE6EEE3),
    );

    // Công viên.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.06, h * 0.58, w * 0.26, h * 0.28),
        const Radius.circular(12),
      ),
      Paint()..color = const Color(0xFFCFE6C8),
    );

    // Sông.
    final river = Path()
      ..moveTo(w * 0.62, 0)
      ..cubicTo(w * 0.50, h * 0.30, w * 0.80, h * 0.55, w * 0.68, h);
    canvas.drawPath(
      river,
      Paint()
        ..color = const Color(0xFFB9DDF2)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 26
        ..strokeCap = StrokeCap.round,
    );

    // Đường phố.
    final road = Paint()
      ..color = Colors.white
      ..strokeWidth = 9
      ..style = PaintingStyle.stroke;
    canvas.drawLine(Offset(0, h * 0.35), Offset(w, h * 0.42), road);
    canvas.drawLine(Offset(w * 0.30, 0), Offset(w * 0.38, h), road);
    canvas.drawLine(Offset(0, h * 0.82), Offset(w, h * 0.74), road);
    canvas.drawLine(Offset(w * 0.85, 0), Offset(w * 0.92, h), road);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
