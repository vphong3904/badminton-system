-- G3.1 – QR check-in: token QR của từng sân, lịch sử đổi QR, bảng check-in, trạng thái đơn 'checked_in'.
-- Chạy lại nhiều lần vẫn an toàn (kiểm cột trước khi thêm, CREATE ... IF NOT EXISTS, MODIFY ENUM idempotent).
-- DB mới dùng db_sancaulong.sql đã có sẵn. Chạy được cả MySQL 8 và MariaDB.
USE db_sancaulong;

-- 1. San.QrToken / QrPhienBan. QrToken NULL = chưa tạo; backend tạo lười lần đầu chủ sân mở trang QR
--    (crypto.randomBytes(32) → 64 ký tự hex). Đổi QR = token mới + QrPhienBan + 1, QR cũ mất hiệu lực ngay.
SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'San' AND COLUMN_NAME = 'QrToken');
SET @sql := IF(@co = 0,
  'ALTER TABLE San ADD COLUMN QrToken CHAR(64) NULL COMMENT ''token QR check-in (ngẫu nhiên 32 byte hex); NULL = chưa tạo'' AFTER TrangThai', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;

SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'San' AND COLUMN_NAME = 'QrPhienBan');
SET @sql := IF(@co = 0,
  'ALTER TABLE San ADD COLUMN QrPhienBan INT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''tăng 1 mỗi lần chủ sân đổi QR'' AFTER QrToken', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;

-- 2. Lịch sử đổi QR (không lưu token, chỉ phiên bản + ai đổi + lúc nào).
CREATE TABLE IF NOT EXISTS LichSuQrSan (
  MaLichSu     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaSan        INT UNSIGNED NOT NULL,
  PhienBan     INT UNSIGNED NOT NULL COMMENT 'phiên bản QR được tạo ở lần này',
  MaNguoiDoi   INT UNSIGNED NULL,
  NgayDoi      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_LichSuQr_San FOREIGN KEY (MaSan) REFERENCES San(MaSan) ON DELETE CASCADE,
  CONSTRAINT FK_LichSuQr_NguoiDoi FOREIGN KEY (MaNguoiDoi) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  KEY IDX_LichSuQr_San (MaSan, NgayDoi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Check-in: mỗi đơn con tối đa 1 lần (UNIQUE chặn quét hai lần ở mức DB).
--    PhuongThuc 'qr' = khách quét QR; 'manual' = chủ sân check-in thủ công (ghi người xác nhận + lý do).
CREATE TABLE IF NOT EXISTS CheckIn (
  MaCheckIn       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan        INT UNSIGNED NOT NULL,
  MaKhachHang     INT UNSIGNED NULL COMMENT 'NULL với đơn khách vãng lai do chủ sân tạo',
  MaSan           INT UNSIGNED NOT NULL,
  ThoiDiem        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'giờ máy chủ, không lấy giờ thiết bị',
  PhuongThuc      ENUM('qr','manual') NOT NULL,
  PhienBanToken   INT UNSIGNED NULL,
  ViDo            DECIMAL(9,6) NULL,
  KinhDo          DECIMAL(9,6) NULL,
  MaNguoiXacNhan  INT UNSIGNED NULL COMMENT 'chủ sân bấm check-in thủ công',
  LyDo            VARCHAR(255) NULL COMMENT 'lý do check-in thủ công (QR lỗi, mất mạng, hết pin...)',
  CONSTRAINT FK_CheckIn_DatSan FOREIGN KEY (MaDatSan) REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_CheckIn_Khach FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_CheckIn_San FOREIGN KEY (MaSan) REFERENCES San(MaSan),
  CONSTRAINT FK_CheckIn_NguoiXN FOREIGN KEY (MaNguoiXacNhan) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  UNIQUE KEY UQ_CheckIn_DatSan (MaDatSan),
  KEY IDX_CheckIn_San (MaSan, ThoiDiem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Trạng thái đơn 'checked_in' (slot.js đã coi là bận). MODIFY ENUM giữ nguyên dữ liệu cũ.
ALTER TABLE DatSan
  MODIFY TrangThai ENUM('pending_payment','confirmed','checked_in','completed','cancelled','expired')
  NOT NULL DEFAULT 'pending_payment';
