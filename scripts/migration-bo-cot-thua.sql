-- Dọn cột/bảng không dùng (chạy 1 lần trên DB đã có dữ liệu; DB mới dùng db_sancaulong.sql đã sạch).
-- Không đụng HoSoChuSan.MaNganHang: đang dùng để tạo QR VietQR, yêu cầu rút tiền và hoàn tiền.
USE db_sancaulong;
ALTER TABLE NguoiDung DROP COLUMN AnhDaiDien;
ALTER TABLE BangGia DROP COLUMN TenKhungGia;
DROP TABLE IF EXISTS ThietBi;
-- Bỏ trạng thái 'draft': hồ sơ cũ còn draft chuyển hết sang pending (chờ duyệt), rồi bỏ draft khỏi ENUM.
UPDATE HoSoChuSan SET TrangThaiDuyet='pending', NgayGuiDuyet=COALESCE(NgayGuiDuyet, NOW())
WHERE TrangThaiDuyet='draft';
ALTER TABLE HoSoChuSan
  MODIFY TrangThaiDuyet ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending';
