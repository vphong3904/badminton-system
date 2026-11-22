-- Task 1.1 – CoSo.SoPhutTreToiDa: số phút khách được đến trễ tối đa (chủ sân chọn 15/20/30; mặc định 15).
-- Chạy lại nhiều lần vẫn an toàn. DB mới dùng db_sancaulong.sql đã có sẵn cột này. Chạy được cả MySQL 8 và MariaDB.
-- Cơ sở cũ nhận giá trị mặc định 15 (DEFAULT) nên không cần backfill.
USE db_sancaulong;

SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CoSo' AND COLUMN_NAME = 'SoPhutTreToiDa');
SET @sql := IF(@co = 0,
  'ALTER TABLE CoSo ADD COLUMN SoPhutTreToiDa SMALLINT UNSIGNED NOT NULL DEFAULT 15 COMMENT ''số phút khách được đến trễ tối đa, do chủ sân chọn: 15/20/30'' AFTER SoPhutDatToiThieu', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;

SET @co := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CoSo' AND CONSTRAINT_NAME = 'CHK_CoSo_SoPhutTre');
SET @sql := IF(@co = 0,
  'ALTER TABLE CoSo ADD CONSTRAINT CHK_CoSo_SoPhutTre CHECK (SoPhutTreToiDa IN (15, 20, 30))', 'DO 0');
PREPARE cau FROM @sql; EXECUTE cau; DEALLOCATE PREPARE cau;
