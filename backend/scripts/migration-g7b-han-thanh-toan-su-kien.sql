-- G7.B · Sự kiện có phí: khách có 10 phút để thanh toán; chủ sân quên duyệt quá hạn → hoàn 100% + khiếu nại chậm duyệt.
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql + db_sancaulong_data.sql thì KHÔNG cần.
USE db_sancaulong;

UPDATE CauHinhHeThong SET GiaTri = '10' WHERE KhoaCauHinh = 'event_payment_hold_minutes';
INSERT INTO CauHinhHeThong (KhoaCauHinh, GiaTri, MoTa)
VALUES ('event_payment_accept_minutes', '30', 'Thời gian khách được giữ chỗ để mở màn thanh toán sau khi được nhận (phút); bấm Xác nhận & thanh toán thì chuyển sang đếm ngược event_payment_hold_minutes (G7)')
ON DUPLICATE KEY UPDATE MoTa = VALUES(MoTa);

ALTER TABLE ThanhToanSuKien
  ADD COLUMN NgayBatDauThanhToan DATETIME NULL COMMENT 'lúc khách bấm Xác nhận & thanh toán: bắt đầu đếm ngược event_payment_hold_minutes (10 phút); NULL = chưa bắt đầu' AFTER HanXacNhan;

ALTER TABLE BaoCaoViPham
  MODIFY LyDo ENUM('misleading','fraud','inappropriate','other','slow_approval') NOT NULL
  COMMENT 'slow_approval = khách khiếu nại chủ sân duyệt chậm phí sự kiện';
