USE db_sancaulong;

CREATE TABLE GiaoDichSePay (
  MaGiaoDichSePay     BIGINT UNSIGNED PRIMARY KEY,
  MaThanhToan         INT UNSIGNED NULL,
  MaGiaoDichNganHang  VARCHAR(100) NULL,
  SoTaiKhoan          VARCHAR(30) NULL,
  LoaiGiaoDich        ENUM('in','out') NOT NULL,
  SoTien              DECIMAL(12,0) NOT NULL,
  NoiDung             VARCHAR(500) NULL,
  MaDoiSoat           VARCHAR(100) NULL,
  NgayGiaoDich        DATETIME NULL,
  TrangThaiDoiSoat    ENUM('matched','unmatched','amount_mismatch','late') NOT NULL DEFAULT 'unmatched',
  DuLieuWebhook       JSON NOT NULL,
  NgayNhan            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_GiaoDichSePay_ThanhToan FOREIGN KEY (MaThanhToan)
    REFERENCES ThanhToan(MaThanhToan) ON DELETE SET NULL,
  KEY IDX_GiaoDichSePay_ThanhToan (MaThanhToan),
  KEY IDX_GiaoDichSePay_TrangThai (TrangThaiDoiSoat, NgayNhan)
) ENGINE=InnoDB;
