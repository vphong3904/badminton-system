-- Chủ sân: thông tin doanh nghiệp / tài khoản nhận tiền / SĐT liên hệ KHÔNG được NULL; sân mới mặc định chưa hoạt động;
-- bỏ cột Zalo cũ (nếu DB cũ còn). Chạy lại nhiều lần vẫn an toàn; DB mới dùng db_sancaulong.sql đã có sẵn.
-- Chạy được cả MySQL 8 và MariaDB.
USE db_sancaulong;

-- ---------------------------------------------------------------------
-- 0. KIỂM TRA TRƯỚC: mỗi truy vấn dưới phải trả 0 dòng. Còn dòng nào thì bổ sung dữ liệu cho dòng đó rồi mới chạy tiếp
--    (nếu không, các lệnh ALTER bên dưới sẽ báo lỗi "Data truncated / cannot be null").
-- ---------------------------------------------------------------------
SELECT MaNguoiDung, 'HoSoChuSan thiếu thông tin' AS van_de FROM HoSoChuSan
WHERE TenDoanhNghiep IS NULL OR TRIM(TenDoanhNghiep) = ''
   OR TenNganHang IS NULL OR MaNganHang IS NULL
   OR SoTaiKhoan IS NULL OR ChuTaiKhoan IS NULL;
SELECT MaNguoiDung, 'Chủ sân chưa có SĐT' AS van_de FROM NguoiDung
WHERE VaiTro = 'owner' AND (SoDienThoai IS NULL OR TRIM(SoDienThoai) = '');
SELECT MaCoSo, 'Cơ sở chưa có SĐT' AS van_de FROM CoSo
WHERE SoDienThoai IS NULL OR TRIM(SoDienThoai) = '';

-- ---------------------------------------------------------------------
-- 1. HoSoChuSan: toàn bộ thông tin doanh nghiệp + tài khoản nhận tiền là bắt buộc
-- ---------------------------------------------------------------------
ALTER TABLE HoSoChuSan
  MODIFY TenDoanhNghiep VARCHAR(150) NOT NULL,
  MODIFY TenNganHang    VARCHAR(100) NOT NULL COMMENT 'tài khoản nhận tiền khách chuyển; điền ngay lúc đăng ký',
  MODIFY MaNganHang     VARCHAR(20)  NOT NULL COMMENT 'mã VietQR viết tắt (VCB, MB, TCB, ACB…) khớp backend/src/utils/nganHang.js',
  MODIFY SoTaiKhoan     VARCHAR(30)  NOT NULL,
  MODIFY ChuTaiKhoan    VARCHAR(100) NOT NULL;

-- ---------------------------------------------------------------------
-- 2. NguoiDung: chủ sân bắt buộc có SĐT liên hệ (khách/admin giữ nguyên)
-- ---------------------------------------------------------------------
SET @daCoCheck := (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS
                   WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'CHK_NguoiDung_ChuSanCoSdt');
SET @lenh := IF(@daCoCheck = 0,
  'ALTER TABLE NguoiDung ADD CONSTRAINT CHK_NguoiDung_ChuSanCoSdt CHECK (VaiTro <> ''owner'' OR SoDienThoai IS NOT NULL)',
  'SELECT ''CHK_NguoiDung_ChuSanCoSdt đã có'' AS ghi_chu');
PREPARE lenhCheck FROM @lenh; EXECUTE lenhCheck; DEALLOCATE PREPARE lenhCheck;

-- ---------------------------------------------------------------------
-- 3. CoSo: SĐT liên hệ bắt buộc (thay hẳn Zalo)
-- ---------------------------------------------------------------------
ALTER TABLE CoSo
  MODIFY SoDienThoai VARCHAR(20) NOT NULL COMMENT 'SĐT liên hệ của cơ sở (khách liên hệ chủ sân qua số này)';

-- Bỏ cột Zalo nếu DB cũ còn (backend không còn gửi/đọc cột này; cột NOT NULL còn sót sẽ làm tạo cơ sở bị lỗi).
SET @coZalo := (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'coso' AND LOWER(COLUMN_NAME) = 'zalo');
SET @lenh := IF(@coZalo > 0, 'ALTER TABLE CoSo DROP COLUMN Zalo', 'SELECT ''CoSo.Zalo đã được bỏ từ trước'' AS ghi_chu');
PREPARE lenhBoZalo FROM @lenh; EXECUTE lenhBoZalo; DEALLOCATE PREPARE lenhBoZalo;

-- ---------------------------------------------------------------------
-- 4. San: sân mới mặc định chưa hoạt động (chủ sân bật thì mới nhận khách)
-- ---------------------------------------------------------------------
ALTER TABLE San
  MODIFY TrangThai ENUM('active','maintenance') NOT NULL DEFAULT 'maintenance'
  COMMENT 'maintenance = chưa hoạt động/đã đóng; sân mới tạo ở maintenance, chủ sân bật thì mới nhận khách';
