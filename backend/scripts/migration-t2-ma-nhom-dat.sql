-- Task 2.1 – DatSan.MaNhomDat: nhóm đặt (đơn tổng) = MaDatSan của đơn con đầu nhóm. Đơn lẻ / dòng cũ = chính MaDatSan.
-- Chạy lại nhiều lần vẫn an toàn (kiểm cột/index trước khi thêm; backfill chỉ chạm dòng còn NULL).
-- DB mới dùng db_sancaulong.sql đã có sẵn cột này. Chạy được cả MySQL 8 và MariaDB.
-- Cột để NULL được: mọi đường tạo đơn trong code tự gán MaNhomDat = MaDatSan ngay sau INSERT; NULL chỉ còn
-- với dòng chèn tay ngoài hệ thống, nên chỗ đọc nhóm về sau nên dùng COALESCE(MaNhomDat, MaDatSan).
-- Không đặt khoá ngoại tự tham chiếu: tránh khoá vòng khi tạo đơn đầu nhóm và khi xoá dữ liệu thử.
USE db_sancaulong;

-- 1. Thêm cột khi chưa có.
SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DatSan' AND COLUMN_NAME = 'MaNhomDat');
SET @sql := IF(@co = 0,
  'ALTER TABLE DatSan ADD COLUMN MaNhomDat INT UNSIGNED NULL COMMENT ''nhóm đặt (đơn tổng) = MaDatSan của đơn con đầu nhóm; đơn lẻ = chính MaDatSan'' AFTER MaLichCoDinh', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;

-- 2. Backfill: dòng cũ là nhóm 1 dòng. Không ghi đè nhóm đã có.
UPDATE DatSan SET MaNhomDat = MaDatSan WHERE MaNhomDat IS NULL;

-- 3. Index tra cứu mọi đơn con của một nhóm (hủy một phần, job hết hạn, check-in từng đơn con).
SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DatSan' AND INDEX_NAME = 'IDX_DatSan_NhomDat');
SET @sql := IF(@co = 0, 'ALTER TABLE DatSan ADD KEY IDX_DatSan_NhomDat (MaNhomDat)', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;
