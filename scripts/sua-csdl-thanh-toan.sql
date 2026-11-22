-- Sửa DB cũ cho khớp code hiện tại (MariaDB/MySQL). Chạy lại nhiều lần không sao (MariaDB: IF NOT EXISTS).
-- Dùng khi xác nhận thanh toán báo lỗi "Unknown column ..." hoặc "Data truncated for column TrangThai".
USE db_sancaulong;

-- 1) Cột phục vụ gửi ảnh chuyển khoản + xác nhận (chủ sân hoặc admin)
ALTER TABLE ThanhToan
  ADD COLUMN IF NOT EXISTS LyDoLoi        VARCHAR(255) NULL AFTER MaGiaoDichNganHang,
  ADD COLUMN IF NOT EXISTS AnhChuyenKhoan VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS NgayGuiAnh     DATETIME NULL,
  ADD COLUMN IF NOT EXISTS MaNguoiXacNhan INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS VaiTroXacNhan  ENUM('owner','admin') NULL,
  ADD COLUMN IF NOT EXISTS NgayThanhToan  DATETIME NULL;

-- 2) Trạng thái 'confirming', 'late_payment' phải có trong ENUM
ALTER TABLE ThanhToan
  MODIFY COLUMN TrangThai ENUM('pending','confirming','success','failed','expired','late_payment')
  NOT NULL DEFAULT 'pending';

-- 3) Cấu hình thời gian giữ chỗ (code đọc 2 khoá này)
INSERT INTO CauHinhHeThong (KhoaCauHinh, GiaTri, MoTa) VALUES
  ('confirm_minutes', '60', 'Thời gian giữ chỗ (phút) sau khi khách gửi ảnh, chờ chủ sân xác nhận')
ON DUPLICATE KEY UPDATE KhoaCauHinh = KhoaCauHinh;
