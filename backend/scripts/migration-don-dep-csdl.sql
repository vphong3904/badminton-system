-- Dọn bảng/cột không dùng (chạy 1 lần trên DB đã có dữ liệu; DB mới dùng db_sancaulong.sql đã sạch).
-- Sau khi chạy: node scripts/capNhatToaDoCoSo.js  (điền ViDo/KinhDo từ LinkBanDo cho cơ sở đang thiếu)
USE db_sancaulong;

-- 1. Rút tiền: nền tảng không giữ tiền (khách chuyển thẳng cho chủ sân) nên bỏ hẳn.
ALTER TABLE DatSan DROP FOREIGN KEY FK_DatSan_RutTien;
ALTER TABLE DatSan DROP INDEX IDX_DatSan_RutTien;
ALTER TABLE DatSan DROP COLUMN MaYeuCauRutTien;
DROP TABLE IF EXISTS YeuCauRutTien;
DELETE FROM CauHinhHeThong WHERE KhoaCauHinh IN ('min_payout', 'owner_approval_days');

-- 2. CoSo.Zalo: app không hiển thị. LinkBanDo bắt buộc (backend dùng để lấy toạ độ).
UPDATE CoSo SET LinkBanDo = CONCAT('https://maps.google.com/?q=', ViDo, ',', KinhDo)
WHERE LinkBanDo IS NULL AND ViDo IS NOT NULL AND KinhDo IS NOT NULL;
UPDATE CoSo SET LinkBanDo = CONCAT('https://www.google.com/maps/search/?api=1&query=', REPLACE(DiaChi, ' ', '+'))
WHERE LinkBanDo IS NULL;
ALTER TABLE CoSo DROP COLUMN Zalo;
ALTER TABLE CoSo MODIFY LinkBanDo VARCHAR(500) NOT NULL
  COMMENT 'link Google Maps chủ sân dán vào; mở bản đồ + backend tự đọc ra ViDo/KinhDo';
ALTER TABLE CoSo MODIFY ViDo DECIMAL(9,6) NULL
  COMMENT 'TỰ ĐỘNG lấy từ LinkBanDo khi lưu cơ sở (chủ sân không nhập); dùng tính khoảng cách "sân gần tôi"';
ALTER TABLE CoSo MODIFY KinhDo DECIMAL(9,6) NULL COMMENT 'xem ViDo';

-- 2b. CoSo.TienIch (tiện ích): chủ sân không có chỗ nhập, bỏ cả hiển thị ở app.
ALTER TABLE CoSo DROP COLUMN TienIch;

-- 3. ThanhToan: PhuongThuc chỉ có 1 giá trị 'bank_qr'; MaGiaoDichNganHang không có code nào ghi.
ALTER TABLE ThanhToan DROP COLUMN PhuongThuc;
ALTER TABLE ThanhToan DROP COLUMN MaGiaoDichNganHang;

-- 4. ThongBao: bỏ các loại backend không bao giờ gửi (xoá dòng cũ thuộc các loại đó trước).
DELETE FROM ThongBao WHERE Loai IN ('hold_expiring','reminder','refund','payout_paid','payout_rejected',
  'venue_locked','late_payment','owner_submitted','owner_approved','owner_rejected')
  OR LoaiThamChieu IN ('payout','owner');
ALTER TABLE ThongBao
  MODIFY Loai ENUM('booking_created','payment_success','payment_failed','booking_cancelled',
                   'new_booking_for_owner','system','refund_requested','refund_completed',
                   'complaint_received','complaint_resolved','owner_warning','owner_banned',
                   'review_received','review_replied','review_hidden','review_sent','review_reminder') NOT NULL,
  MODIFY LoaiThamChieu ENUM('booking','payment','venue','complaint') NULL
    COMMENT 'để app/web điều hướng khi bấm vào';
DELETE FROM NhatKyHeThong WHERE DoiTuong = 'YeuCauRutTien';
