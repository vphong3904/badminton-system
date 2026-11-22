-- G2.1 – Chứng từ thanh toán nhiều ảnh + hạn chủ sân/Admin xác nhận (ThanhToan.HanXacNhan).
-- Chạy lại nhiều lần vẫn an toàn (CREATE ... IF NOT EXISTS, kiểm cột trước khi thêm, backfill chỉ chạm dòng còn thiếu).
-- DB mới dùng db_sancaulong.sql đã có sẵn. Chạy được cả MySQL 8 và MariaDB.
USE db_sancaulong;

-- 1. Bảng chứng từ: mỗi lần khách gửi ảnh = 1 dòng, KHÔNG xoá/ghi đè ảnh cũ.
--    MaBamAnh = SHA-256 nội dung ảnh (backend tính). Trùng hash với đơn khác chỉ là CẢNH BÁO cho chủ sân/Admin.
CREATE TABLE IF NOT EXISTS ChungTuThanhToan (
  MaChungTu       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaThanhToan     INT UNSIGNED NOT NULL,
  Loai            ENUM('main','topup','overpay','deducted','late','refund') NOT NULL DEFAULT 'main',
  SoTien          DECIMAL(12,0) NULL COMMENT 'số tiền khách phải chuyển của lần gửi này (backend lấy từ đơn, không nhận từ client)',
  ThoiDiemChuyen  DATETIME NULL COMMENT 'giờ chuyển khoản trên biên lai/sao kê (khách nhập, tuỳ chọn, ≤ giờ máy chủ)',
  NgayGui         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Anh             VARCHAR(255) NOT NULL COMMENT 'đường dẫn tương đối /tep-tai-len/<tên file>',
  MaBamAnh        CHAR(64) NOT NULL COMMENT 'SHA-256 nội dung ảnh',
  KetQua          ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  MaNguoiDuyet    INT UNSIGNED NULL,
  VaiTroDuyet     ENUM('owner','admin') NULL,
  NgayDuyet       DATETIME NULL,
  LyDo            VARCHAR(255) NULL COMMENT 'lý do từ chối',
  CONSTRAINT FK_ChungTu_ThanhToan FOREIGN KEY (MaThanhToan)  REFERENCES ThanhToan(MaThanhToan),
  CONSTRAINT FK_ChungTu_NguoiDuyet FOREIGN KEY (MaNguoiDuyet) REFERENCES NguoiDung(MaNguoiDung),
  KEY IDX_ChungTu_ThanhToan (MaThanhToan),
  KEY IDX_ChungTu_Bam (MaBamAnh)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. ThanhToan.HanXacNhan: hạn chủ sân/Admin xác nhận (+confirm_minutes, +confirm_urgent_minutes nếu đặt gấp).
--    Quá hạn KHÔNG tự nhả slot; chỉ hiện ở tab Admin "Chờ xác nhận / quá hạn" để xử lý tay.
SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ThanhToan' AND COLUMN_NAME = 'HanXacNhan');
SET @sql := IF(@co = 0,
  'ALTER TABLE ThanhToan ADD COLUMN HanXacNhan DATETIME NULL COMMENT ''hạn chủ sân/Admin xác nhận sau khi khách gửi ảnh; NULL khi chưa gửi ảnh'' AFTER NgayGuiAnh', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;

-- 3. Backfill đơn đang `confirming` từ trước G2:
--    a) ảnh hiện có → 1 dòng chứng từ (hash = SHA-256 của ĐƯỜNG DẪN vì không đọc được nội dung từ SQL: không bao giờ trùng đơn khác);
--    b) HanXacNhan = ngày gửi + confirm_minutes (mặc định 30);
--    c) HetHanGiuCho = NULL (đơn đã gửi ảnh không tự nhả slot; slot.js coi NULL là đang giữ).
INSERT INTO ChungTuThanhToan (MaThanhToan, Loai, SoTien, NgayGui, Anh, MaBamAnh)
SELECT t.MaThanhToan, 'main', t.SoTien, COALESCE(t.NgayGuiAnh, NOW()), t.AnhChuyenKhoan, SHA2(t.AnhChuyenKhoan, 256)
FROM ThanhToan t
WHERE t.TrangThai = 'confirming' AND t.AnhChuyenKhoan IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ChungTuThanhToan c WHERE c.MaThanhToan = t.MaThanhToan);

UPDATE ThanhToan
SET HanXacNhan = DATE_ADD(COALESCE(NgayGuiAnh, NOW()),
  INTERVAL COALESCE((SELECT CAST(GiaTri AS UNSIGNED) FROM CauHinhHeThong WHERE KhoaCauHinh = 'confirm_minutes'), 30) MINUTE)
WHERE TrangThai = 'confirming' AND HanXacNhan IS NULL;

-- Đơn lẻ / nhóm đặt: ThanhToan gắn đơn đầu nhóm.
UPDATE DatSan d JOIN ThanhToan t ON t.MaDatSan = COALESCE(d.MaNhomDat, d.MaDatSan)
SET d.HetHanGiuCho = NULL
WHERE t.TrangThai = 'confirming' AND d.TrangThai = 'pending_payment' AND d.MaLichCoDinh IS NULL;
-- Lịch cố định: ThanhToan gắn buổi đầu của lịch.
UPDATE DatSan d
JOIN (SELECT MaLichCoDinh, MIN(MaDatSan) AS MaDauLich FROM DatSan WHERE MaLichCoDinh IS NOT NULL GROUP BY MaLichCoDinh) g
  ON g.MaLichCoDinh = d.MaLichCoDinh
JOIN ThanhToan t ON t.MaDatSan = g.MaDauLich
SET d.HetHanGiuCho = NULL
WHERE t.TrangThai = 'confirming' AND d.TrangThai = 'pending_payment';
