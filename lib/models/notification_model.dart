/// Một thông báo của người dùng (bảng ThongBao, `GET /thong-bao`).
class AppNotification {
  final int id; // maThongBao
  final String type; // loai, vd booking_created, payment_success, refund_requested, review_received|replied|hidden|sent|reminder...
  final String title;
  final String message;
  final String? refType; // loaiThamChieu: booking | payment | complaint | venue (maThamChieu = maCoSo) | ...
  final int? refId; // maThamChieu
  final bool read;
  final DateTime? createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    this.refType,
    this.refId,
    this.read = false,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    int? asInt(dynamic v) => v == null ? null : int.tryParse(v.toString());
    return AppNotification(
      id: asInt(j['maThongBao']) ?? 0,
      type: (j['loai'] ?? 'system').toString(),
      title: (j['tieuDe'] ?? '').toString(),
      message: (j['noiDung'] ?? '').toString(),
      refType: j['loaiThamChieu']?.toString(),
      refId: asInt(j['maThamChieu']),
      read: j['daDoc'] == true || j['daDoc'] == 1,
      // BE trả "yyyy-MM-dd HH:mm:ss" (giờ Việt Nam, không múi giờ).
      createdAt: DateTime.tryParse((j['ngayTao'] ?? '').toString().replaceFirst(' ', 'T')),
    );
  }

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        type: type,
        title: title,
        message: message,
        refType: refType,
        refId: refId,
        read: read ?? this.read,
        createdAt: createdAt,
      );
}
