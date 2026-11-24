-- G9.E1 · Khoá khung giờ khi còn đơn + chuyển sân (kế hoạch 24/11/2026).
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql thì KHÔNG cần.
-- Chạy MỘT lần (ADD COLUMN không có IF NOT EXISTS để chạy được cả MySQL lẫn MariaDB).
-- ENUM ThongBao.Loai 'booking_moved' đã được thêm ở migration G9.C1, không thêm lại ở đây.
USE db_sancaulong;

-- DatSan: ghi lại việc chủ sân chuyển đơn sang sân khác trong cùng cơ sở (G9.E4).
--   MaSan      = sân HIỆN TẠI (đổi khi chuyển); MaSanCu = sân trước khi chuyển (NULL = chưa từng chuyển).
--   Chỉ lưu sân gần nhất: chuyển nhiều lần thì MaSanCu là sân liền trước lần chuyển cuối.
ALTER TABLE DatSan
  ADD COLUMN MaSanCu       INT UNSIGNED NULL COMMENT 'sân trước khi chủ sân chuyển sân (G9.E); NULL = chưa chuyển' AFTER MaSan,
  ADD COLUMN NgayChuyenSan DATETIME     NULL COMMENT 'thời điểm chuyển sân gần nhất (G9.E); NULL = chưa chuyển' AFTER MaSanCu,
  ADD CONSTRAINT FK_DatSan_SanCu FOREIGN KEY (MaSanCu) REFERENCES San(MaSan);
