-- Bổ sung bảng/cột còn thiếu: DanhGia (+ BiAn, PhanHoiChuSan, NgayPhanHoi) và KhieuNai.
-- Chạy được nhiều lần (idempotent). Dùng khi DB đã có dữ liệu và không muốn import lại.
USE db_sancaulong;

-- 1) DanhGia: tạo nếu chưa có
CREATE TABLE IF NOT EXISTS DanhGia (
  MaDanhGia      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan       INT UNSIGNED NOT NULL,
  MaKhachHang    INT UNSIGNED NOT NULL,
  MaCoSo         INT UNSIGNED NOT NULL,
  SoSao          TINYINT UNSIGNED NOT NULL,
  NoiDung        VARCHAR(1000) NULL,
  BiAn           TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'admin ẩn đánh giá vi phạm',
  PhanHoiChuSan  VARCHAR(1000) NULL COMMENT '(tùy chọn) phản hồi của chủ sân',
  NgayPhanHoi    DATETIME NULL,
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_DanhGia_DatSan    FOREIGN KEY (MaDatSan)    REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_DanhGia_KhachHang FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_DanhGia_CoSo      FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  CONSTRAINT CHK_DanhGia_SoSao    CHECK (SoSao BETWEEN 1 AND 5),
  UNIQUE KEY UQ_DanhGia_DatSan (MaDatSan),
  KEY IDX_DanhGia_CoSo (MaCoSo, NgayTao),
  KEY IDX_DanhGia_BiAn (MaCoSo, BiAn, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Nếu DanhGia đã có từ trước nhưng thiếu cột: thêm từng cột còn thiếu
DROP PROCEDURE IF EXISTS them_cot_danhgia;
DELIMITER $$
CREATE PROCEDURE them_cot_danhgia()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DanhGia' AND COLUMN_NAME = 'BiAn') THEN
    ALTER TABLE DanhGia ADD COLUMN BiAn TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'admin ẩn đánh giá vi phạm' AFTER NoiDung;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DanhGia' AND COLUMN_NAME = 'PhanHoiChuSan') THEN
    ALTER TABLE DanhGia ADD COLUMN PhanHoiChuSan VARCHAR(1000) NULL COMMENT '(tùy chọn) phản hồi của chủ sân' AFTER BiAn;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DanhGia' AND COLUMN_NAME = 'NgayPhanHoi') THEN
    ALTER TABLE DanhGia ADD COLUMN NgayPhanHoi DATETIME NULL AFTER PhanHoiChuSan;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DanhGia' AND INDEX_NAME = 'IDX_DanhGia_BiAn') THEN
    ALTER TABLE DanhGia ADD KEY IDX_DanhGia_BiAn (MaCoSo, BiAn, NgayTao);
  END IF;
END$$
DELIMITER ;
CALL them_cot_danhgia();
DROP PROCEDURE them_cot_danhgia;

-- 3) KhieuNai: tạo nếu chưa có
CREATE TABLE IF NOT EXISTS KhieuNai (
  MaKhieuNai     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan       INT UNSIGNED NOT NULL,
  MaKhachHang    INT UNSIGNED NOT NULL,
  MaChuSan       INT UNSIGNED NOT NULL,
  MaCoSo         INT UNSIGNED NOT NULL,
  GiaiDoan       ENUM('after_payment','at_cancel','after_cancel') NOT NULL COMMENT 'khách bấm khiếu nại ở màn nào',
  NoiDung        VARCHAR(1000) NOT NULL,
  TrangThai      ENUM('pending','upheld','rejected') NOT NULL DEFAULT 'pending',
  GhiChuQuanTri  VARCHAR(500) NULL,
  MucXuLy        ENUM('none','warning','severe_warning','banned') NOT NULL DEFAULT 'none',
  MaQuanTri      INT UNSIGNED NULL,
  NgayXuLy       DATETIME NULL,
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_KhieuNai_DatSan   FOREIGN KEY (MaDatSan)    REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_KhieuNai_Khach    FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_ChuSan   FOREIGN KEY (MaChuSan)    REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_CoSo     FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  CONSTRAINT FK_KhieuNai_QuanTri  FOREIGN KEY (MaQuanTri)   REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_KhieuNai_DatSan (MaDatSan),
  KEY IDX_KhieuNai_TrangThai (TrangThai, NgayTao),
  KEY IDX_KhieuNai_ChuSan (MaChuSan, TrangThai),
  KEY IDX_KhieuNai_Khach (MaKhachHang, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kiểm tra
SHOW COLUMNS FROM DanhGia;
SHOW COLUMNS FROM KhieuNai;
