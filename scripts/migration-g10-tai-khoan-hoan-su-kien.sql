-- G10 · Khách hủy đăng ký sự kiện được hoàn phí: BẮT BUỘC nhập tài khoản nhận hoàn (ngân hàng, số TK, tên chủ TK) lúc hủy.
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql thì KHÔNG cần.
USE db_sancaulong;

ALTER TABLE ThanhToanSuKien
  ADD COLUMN MaNganHangHoan   VARCHAR(20)  NULL COMMENT 'mã VietQR ngân hàng khách nhận hoàn' AFTER SoTienHoan,
  ADD COLUMN TenNganHangHoan  VARCHAR(100) NULL AFTER MaNganHangHoan,
  ADD COLUMN SoTaiKhoanHoan   VARCHAR(30)  NULL AFTER TenNganHangHoan,
  ADD COLUMN ChuTaiKhoanHoan  VARCHAR(100) NULL AFTER SoTaiKhoanHoan;
