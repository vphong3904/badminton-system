# Badminton Booking Flutter – bản mở rộng theo tài liệu Word

## Cách áp dụng
1. Sao lưu thư mục `lib` hiện tại trong dự án Flutter.
2. Giải nén gói này.
3. Chép thư mục `lib` trong gói vào thư mục gốc dự án Flutter, chọn ghi đè các file cũ.
4. Mở dự án trong Android Studio, mở `pubspec.yaml` và nhấn **Pub get**.
5. Chạy `flutter analyze`, sau đó chọn Android Emulator/điện thoại và nhấn Run.

## Màn hình đã bổ sung
- Home và bottom navigation 4 mục.
- Tìm sân, bộ lọc chi tiết khu vực/ngày/giờ/thời lượng/giá.
- Chi tiết sân và luồng chọn lịch.
- Lịch đặt có tab trạng thái, chi tiết lịch, tiếp tục thanh toán.
- Màn hình thanh toán QR minh họa.
- Sân yêu thích, thông báo và đánh dấu đã đọc.
- Đăng nhập/đăng ký giao diện, quên mật khẩu demo.
- Chỉnh sửa hồ sơ, lịch sử thanh toán, cài đặt/hỗ trợ.
- Đăng ký chủ sân, màn hình quản lý sân và lịch sân demo.

## Lưu ý quan trọng
Đây là bản giao diện Flutter với dữ liệu mẫu để chạy thử trên Android Studio. Chưa có backend/database thật nên đăng nhập, lưu hồ sơ, yêu thích đồng bộ, tình trạng sân trống realtime, QR ngân hàng, xác nhận thanh toán, nhắc lịch 2 giờ trước giờ chơi, hoàn tiền và duyệt chủ sân mới là mô phỏng. Không dùng QR minh họa để chuyển tiền thật. Các nghiệp vụ đó cần API/backend và kiểm tra dữ liệu phía máy chủ như tài liệu yêu cầu.
