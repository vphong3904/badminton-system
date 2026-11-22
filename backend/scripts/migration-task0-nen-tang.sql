-- Task 0.1 – Nền tảng: thêm khoá cấu hình (mục D của TAI_LIEU_THUC_HIEN.md), đổi confirm_minutes 60→30,
-- thêm NhatKyHeThong.DuLieuTruoc/DuLieuSau (TEXT, tương thích MariaDB).
-- Chạy lại nhiều lần vẫn an toàn; DB mới dùng db_sancaulong.sql đã có sẵn. Chạy được cả MySQL 8 và MariaDB.
USE db_sancaulong;

-- ---------------------------------------------------------------------
-- 1. CauHinhHeThong: khoá mới. INSERT IGNORE ⇒ không ghi đè giá trị admin đã chỉnh.
--    Các giá trị "đề xuất / cần chốt" (task 0.8) chỉnh được ở đây, không viết cứng trong code.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO CauHinhHeThong (KhoaCauHinh, GiaTri, MoTa) VALUES
  ('confirm_urgent_minutes',  '15',  'Hạn chủ sân xác nhận (phút) với đơn đặt gấp'),
  ('urgent_threshold_minutes','60',  'Còn dưới số phút này đến giờ chơi thì coi là đặt gấp'),
  ('reconcile_hold_minutes',  '30',  'Thời gian giữ chỗ/đối soát (phút) khi khách báo bị trừ tiền mà chưa ghi nhận (đề xuất, cần chốt)'),
  ('topup_minutes',           '30',  'Hạn khách bổ sung tiền chuyển thiếu (phút) (đề xuất, cần chốt)'),
  ('overpay_refund_hours',    '48',  'Hạn hoàn khoản chuyển dư/trùng (giờ) (đề xuất, cần chốt)'),
  ('refund_deadline_hours',   '24',  'Hạn chủ sân chuyển khoản hoàn tiền (giờ) (đề xuất, cần chốt)'),
  ('refund_grace_hours',      '24',  'Gia hạn (giờ) sau hạn hoàn trước khi khoá nhận đặt mới'),
  ('owner_cancel_reply_hours','24',  'Hạn khách phản hồi khi chủ sân huỷ lịch (giờ); rút ngắn khi sát giờ (đề xuất)'),
  ('noshow_wait_minutes',     '30',  'Chờ khách đến trễ bao lâu (phút) thì chủ sân được đánh dấu không đến (đề xuất 15–30)'),
  ('checkin_open_minutes',    '30',  'Mở check-in trước giờ chơi (phút)'),
  ('incident_admin_minutes',  '30',  'Chủ sân không phản hồi sự cố tại sân sau bao lâu (phút) thì Admin hỗ trợ (đề xuất 15–30)'),
  ('complaint_days',          '7',   'Số ngày khách được khiếu nại sau giờ chơi'),
  ('owner_response_hours',    '24',  'Hạn chủ sân giải trình khiếu nại (giờ) (đề xuất 24–48)'),
  ('appeal_hours',            '48',  'Hạn kháng nghị quyết định của Admin (giờ) (đề xuất)'),
  ('strike_lock_count',       '3',   'Số "gậy" tích luỹ thì khoá nhận đặt mới'),
  ('abuse_threshold',         '5',   'Số lần huỷ/hết hạn giữ chỗ trong abuse_window_hours bị coi là giữ sân ảo (đề xuất)'),
  ('abuse_window_hours',      '24',  'Cửa sổ thời gian (giờ) để đếm giữ sân ảo (đề xuất)'),
  ('reschedule_min_hours',    '24',  'Đổi lịch: phải cách giờ chơi ít nhất bao nhiêu giờ (đã chốt 0.8 #3)'),
  ('reschedule_max_count',    '1',   'Đổi lịch: số lần đổi tối đa mỗi đơn (đã chốt 0.8 #3)'),
  ('reschedule_range_days',   '7',   'Đổi lịch: được dời trong ±bao nhiêu ngày so với ngày cũ (đã chốt 0.8 #3)');

-- confirm_minutes: 60 → 30. Chỉ đổi khi còn đúng giá trị cũ (không ghi đè giá trị admin đã chỉnh khác).
UPDATE CauHinhHeThong SET GiaTri = '30'
WHERE KhoaCauHinh = 'confirm_minutes' AND GiaTri = '60';

-- ---------------------------------------------------------------------
-- 2. NhatKyHeThong: lưu dữ liệu trước/sau khi đổi (TEXT, ghi JSON dạng chuỗi). Thêm khi chưa có.
-- ---------------------------------------------------------------------
SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NhatKyHeThong' AND COLUMN_NAME = 'DuLieuTruoc');
SET @sql := IF(@co = 0,
  'ALTER TABLE NhatKyHeThong ADD COLUMN DuLieuTruoc TEXT NULL COMMENT ''dữ liệu trước khi đổi (JSON dạng chuỗi)'' AFTER ChiTiet', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;

SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'NhatKyHeThong' AND COLUMN_NAME = 'DuLieuSau');
SET @sql := IF(@co = 0,
  'ALTER TABLE NhatKyHeThong ADD COLUMN DuLieuSau TEXT NULL COMMENT ''dữ liệu sau khi đổi (JSON dạng chuỗi)'' AFTER DuLieuTruoc', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;
