BADMINTON BOOKING - RESTRUCTURED SOURCE

This archive reorganizes the uploaded lib(2).zip source into a feature-based structure.

Run:
1. Extract the mobile_app folder.
2. Open mobile_app in VS Code / Android Studio.
3. Run: flutter pub get
4. Run: flutter analyze
5. Run: flutter run

Notes:
- Existing demo screens and in-memory data are preserved and moved into feature folders.
- Package imports were updated to package:cau_long_app/...
- Theme was centralized in lib/core/theme/app_theme.dart.
- Core config/network/router placeholders are included as extension points for the Node.js backend.
- API calls are not connected yet; the existing app still uses sample/in-memory data.
- This environment did not have Flutter/Dart CLI available, so a real `flutter analyze` / build could not be run here. Please run those commands locally and share any errors for follow-up fixes.

---- CẬP NHẬT GIAO DIỆN (theo ảnh thiết kế) ----
Tài khoản demo: demo / 123456 (hoặc tự đăng ký; dữ liệu chỉ lưu trong bộ nhớ).
Màn hình mới / viết lại:
- features/home/screens/home_screen.dart        Trang chủ: header, tìm kiếm, chip "gần tôi", danh mục môn, thẻ sân
- features/auth/screens/login_screen.dart       Đăng nhập
- features/auth/screens/register_screen.dart    Đăng kí tài khoản
- features/search/widgets/availability_sheet.dart  "Tìm kiếm lịch trống"
- features/search/widgets/date_picker_sheet.dart   Chọn ngày
- features/search/widgets/time_picker_sheet.dart   Chọn thời gian
- features/search/screens/search_screen.dart    Tab "Khám phá"
- features/map/screens/map_screen.dart          Tab "Bản đồ" (minh họa, chưa có Google Maps)
- features/featured/screens/featured_screen.dart Tab "Nổi bật"
- shared/venue_card.dart, shared/app_bottom_bar.dart, shared/sport_pin.dart
- core/state/auth_store.dart, features/favorites/favorites_store.dart (trạng thái trong bộ nhớ)
Lịch đặt sân của khách nằm ở: Tài khoản -> "Lịch đặt sân của tôi".
