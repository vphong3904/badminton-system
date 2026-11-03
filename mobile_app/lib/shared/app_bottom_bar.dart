import 'package:flutter/material.dart';

// Thanh điều hướng dưới dành cho khách hàng.
// Gồm 4 mục: Trang chủ, Tìm kiếm, Lịch đặt, Tài khoản.
class AppBottomBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;

  const AppBottomBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  static const Color mauXanh = Color(0xFF16845B);

  static const List<_MucDieuHuong> _danhSachMuc = [
    _MucDieuHuong(
      bieuTuong: Icons.home_outlined,
      bieuTuongChon: Icons.home,
      ten: 'Trang chủ',
    ),
    _MucDieuHuong(
      bieuTuong: Icons.search,
      bieuTuongChon: Icons.search,
      ten: 'Tìm kiếm',
    ),
    _MucDieuHuong(
      bieuTuong: Icons.calendar_month_outlined,
      bieuTuongChon: Icons.calendar_month,
      ten: 'Lịch đặt',
    ),
    _MucDieuHuong(
      bieuTuong: Icons.person_outline,
      bieuTuongChon: Icons.person,
      ten: 'Tài khoản',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
          child: Row(
            children: List.generate(
              _danhSachMuc.length,
              (index) {
                final muc = _danhSachMuc[index];
                final dangChon = currentIndex == index;

                return Expanded(
                  child: InkWell(
                    onTap: () => onTap(index),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          dangChon
                              ? muc.bieuTuongChon
                              : muc.bieuTuong,
                          size: 25,
                          color: dangChon
                              ? mauXanh
                              : Colors.grey.shade500,
                        ),
                        const SizedBox(height: 5),
                        Text(
                          muc.ten,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: dangChon
                                ? FontWeight.bold
                                : FontWeight.normal,
                            color: dangChon
                                ? mauXanh
                                : Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _MucDieuHuong {
  final IconData bieuTuong;
  final IconData bieuTuongChon;
  final String ten;

  const _MucDieuHuong({
    required this.bieuTuong,
    required this.bieuTuongChon,
    required this.ten,
  });
}
