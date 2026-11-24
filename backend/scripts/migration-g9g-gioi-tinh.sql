-- G9.G · Giới tính tài khoản + giới tính lúc đăng ký sự kiện (nam / nữ).
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql thì KHÔNG cần.
-- Chạy MỘT lần (ADD COLUMN không có IF NOT EXISTS để chạy được cả MySQL lẫn MariaDB).
-- Cột cho phép NULL: tài khoản/đăng ký cũ chưa khai giữ NULL; giao diện app bắt buộc chọn khi đăng ký mới.
USE db_sancaulong;

ALTER TABLE NguoiDung
  ADD COLUMN GioiTinh ENUM('male','female') NULL
    COMMENT 'male = Nam, female = Nữ; NULL = chưa khai' AFTER SoDienThoaiPhu;

ALTER TABLE DangKySuKien
  ADD COLUMN GioiTinh ENUM('male','female') NULL
    COMMENT 'giới tính khách khai lúc đăng ký (lưu cứng)' AFTER SoDienThoai;

-- Dữ liệu mẫu (chỉ có tác dụng nếu DB đang dùng bộ seed demo): khách id 6-11.
UPDATE NguoiDung SET GioiTinh = 'female' WHERE VaiTro = 'customer' AND MaNguoiDung IN (6, 9);
UPDATE NguoiDung SET GioiTinh = 'male'   WHERE VaiTro = 'customer' AND MaNguoiDung IN (7, 8, 10, 11);

-- Giữ chỗ đăng ký sự kiện có phí: 10 phút để vào màn Xác nhận & thanh toán (trước đây 30 phút).
UPDATE CauHinhHeThong SET GiaTri = '10' WHERE KhoaCauHinh = 'event_payment_accept_minutes';
