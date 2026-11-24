-- G7.C · Khách hủy đăng ký sự kiện đã trả phí: hoàn theo chính sách như đặt sân (>=24h 100%, 12-24h 50%, <12h không hoàn).
-- Lưu số tiền chủ sân cần hoàn (NULL = hoàn toàn bộ SoTien, dùng cho hủy do chủ sân/Admin/hệ thống).
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql thì KHÔNG cần.
USE db_sancaulong;

ALTER TABLE ThanhToanSuKien
  ADD COLUMN SoTienHoan DECIMAL(12,0) NULL COMMENT 'số tiền chủ sân cần hoàn khi khách tự hủy theo chính sách hoàn tiền; NULL = hoàn toàn bộ SoTien' AFTER TrangThaiHoan;
