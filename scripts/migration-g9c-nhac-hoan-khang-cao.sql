-- G9.C · Cấu hình, nhắc theo mốc, duyệt thanh toán, hoàn tiền, kháng cáo (kế hoạch 24/11/2026).
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql + db_sancaulong_data.sql thì KHÔNG cần.
-- Chạy MỘT lần (ADD COLUMN không có IF NOT EXISTS để chạy được cả MySQL lẫn MariaDB).
USE db_sancaulong;

-- 1) ThongBao.Loai: viết lại ENUM đầy đủ, thêm refund_expiring, booking_moved (dùng ở G9.E), payment_auto_confirmed
ALTER TABLE ThongBao
  MODIFY COLUMN Loai ENUM('booking_created','payment_success','payment_failed',
                          'booking_cancelled','new_booking_for_owner','system',
                          'refund_requested','refund_completed','complaint_received',
                          'complaint_resolved','owner_warning','owner_banned',
                          'review_received','review_replied','review_hidden','review_sent',
                          'review_reminder',
                          'refund_reminder','refund_escalated','refund_received','refund_not_received',
                          'hold_expiring','confirm_expiring','checkin_success',
                          'event_registered','event_accepted','event_rejected','event_removed',
                          'event_updated','event_cancelled','event_reminder','event_hidden',
                          'event_payment_submitted','event_payment_confirmed','event_payment_rejected',
                          'event_payment_expired',
                          'refund_expiring','booking_moved','payment_auto_confirmed')
  NOT NULL;

-- 2) KhangNghi.BangChung: JSON mảng đường dẫn ảnh (1–3 ảnh)
ALTER TABLE KhangNghi
  ADD COLUMN BangChung VARCHAR(1500) NULL COMMENT 'JSON mảng đường dẫn 1–3 ảnh bằng chứng chủ sân đính kèm khi kháng nghị (G9.C)'
  AFTER NoiDung;

-- 3) CauHinhHeThong: khoá mới (INSERT IGNORE: chạy lại không ghi đè giá trị Admin đã chỉnh)
INSERT IGNORE INTO CauHinhHeThong (KhoaCauHinh, GiaTri, MoTa) VALUES
  ('confirm_reminder_steps', '20,10,5', 'Mốc nhắc chủ sân (phút còn lại đến HanXacNhan) khi chờ duyệt thanh toán, mốc lớn hơn hạn thì bỏ (G9.C)'),
  ('refund_deadline_minutes_customer_cancel', '4320', 'Hạn chủ sân hoàn tiền (phút) khi khách huỷ đơn = 3 ngày, cũng tạm dùng cho khoản hoàn chuyển dư (overpay) (G9.C)'),
  ('refund_deadline_minutes_owner_cancel', '30', 'Hạn chủ sân hoàn tiền (phút) khi chủ sân huỷ / đóng sân / sự cố tại sân (owner_cancel, closure, incident) (G9.C)'),
  ('refund_reminder_steps_short', '20,10,5', 'Mốc nhắc hoàn tiền (phút còn lại đến HanHoan) cho khoản hoàn hạn ngắn, mốc lớn hơn hạn thì bỏ (G9.C)'),
  ('refund_reminder_steps_long', '1440,360,60', 'Mốc nhắc hoàn tiền (phút còn lại đến HanHoan) cho khoản hoàn hạn dài (G9.C)'),
  ('refund_overdue_grace_minutes', '0', 'Số phút sau HanHoan trước khi khoản hoàn chuyển escalated, 0 = ngay khi quá hạn (G9.C)');

-- Kháng nghị: 48h -> 24h (chỉ đổi khi còn đúng giá trị mặc định cũ, không đè giá trị Admin đã tự chỉnh)
UPDATE CauHinhHeThong SET GiaTri = '24', MoTa = 'Hạn kháng nghị quyết định của Admin (giờ)'
WHERE KhoaCauHinh = 'appeal_hours' AND GiaTri = '48';

-- Khoá thay thế / bị bỏ: confirm_reminder_minutes, refund_deadline_hours, refund_complaint_wait_minutes, complaint_slow_confirm_minutes
DELETE FROM CauHinhHeThong
WHERE KhoaCauHinh IN ('confirm_reminder_minutes','refund_deadline_hours','refund_complaint_wait_minutes','complaint_slow_confirm_minutes');
-- Giữ nguyên: refund_grace_hours=24, confirm_minutes=30, confirm_urgent_minutes=15, urgent_threshold_minutes=60, complaint_owner_reply_hours=24.
