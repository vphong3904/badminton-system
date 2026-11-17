-- Thêm trạng thái 'closed' (đóng tạm cơ sở) để phân biệt với 'hidden' (đang soạn/chờ duyệt).
-- Chạy 1 lần trên DB đang dùng.
ALTER TABLE CoSo
  MODIFY TrangThai ENUM('active','hidden','locked','closed') NOT NULL DEFAULT 'hidden'
  COMMENT 'hidden: đang soạn/chờ duyệt; closed: chủ sân/admin đóng tạm (phải đóng trước khi xóa); locked: admin khóa';
