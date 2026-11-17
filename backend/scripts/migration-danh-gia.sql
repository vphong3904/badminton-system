-- Migration: luồng đánh giá sân (chủ sân phản hồi, admin ẩn/hiện, thông báo đánh giá, nhắc đánh giá).
-- Chạy 1 lần trên DB db_sancaulong đang có dữ liệu (DB mới chỉ cần import db_sancaulong.sql).
-- Có thể chạy lại nhiều lần: MODIFY ENUM giữ nguyên giá trị cũ, chỉ mục chỉ thêm khi chưa có.
USE db_sancaulong;

-- 1) Mở rộng ThongBao.Loai (giữ nguyên mọi giá trị cũ, chỉ thêm 5 loại mới).
ALTER TABLE ThongBao
  MODIFY Loai ENUM('booking_created','payment_success','payment_failed','hold_expiring',
                   'booking_cancelled','reminder','refund','new_booking_for_owner',
                   'payout_paid','payout_rejected','venue_locked','system','late_payment',
                   'owner_submitted','owner_approved','owner_rejected',
                   'refund_requested','refund_completed','complaint_received',
                   'complaint_resolved','owner_warning','owner_banned',
                   'review_received','review_replied','review_hidden','review_sent',
                   'review_reminder') NOT NULL;

-- 2) Chỉ mục cho truy vấn điểm trung bình / danh sách công khai (chỉ BiAn=0).
SET @da_co_chi_muc = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DanhGia' AND INDEX_NAME = 'IDX_DanhGia_BiAn');
SET @cau_lenh = IF(@da_co_chi_muc = 0,
  'ALTER TABLE DanhGia ADD KEY IDX_DanhGia_BiAn (MaCoSo, BiAn, NgayTao)',
  'SELECT ''IDX_DanhGia_BiAn đã có'' AS ghiChu');
PREPARE lenh FROM @cau_lenh;
EXECUTE lenh;
DEALLOCATE PREPARE lenh;
