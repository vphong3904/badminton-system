-- Ảnh đại diện + ràng buộc đường dẫn ảnh. Chạy 1 lần trên DB đã có (DB mới dùng db_sancaulong.sql).
USE db_sancaulong;
ALTER TABLE NguoiDung
  ADD COLUMN AnhDaiDien VARCHAR(255) NOT NULL DEFAULT '/tep-tai-len/avatar/default-user.jpg'
    COMMENT 'đường dẫn tương đối; mặc định = uploads/avatar/default-user.jpg' AFTER VaiTro,
  ADD CONSTRAINT CHK_NguoiDung_AnhDaiDien CHECK (AnhDaiDien LIKE '/tep-tai-len/avatar/%');
-- Ảnh cơ sở cũ nằm ở gốc uploads/ (/tep-tai-len/<tên>): chuyển file sang uploads/coso/ rồi chạy UPDATE này,
-- nếu không ràng buộc CHK_AnhCoSo_DuongDan sẽ từ chối. (Bỏ qua nếu bảng AnhCoSo chưa có dữ liệu.)
-- UPDATE AnhCoSo SET DuongDan = REPLACE(DuongDan, '/tep-tai-len/', '/tep-tai-len/coso/')
--   WHERE DuongDan NOT LIKE '/tep-tai-len/coso/%';
ALTER TABLE AnhCoSo
  ADD CONSTRAINT CHK_AnhCoSo_DuongDan CHECK (DuongDan LIKE '/tep-tai-len/coso/%');
