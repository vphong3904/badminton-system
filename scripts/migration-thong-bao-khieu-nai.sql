-- Migration: thông báo mở rộng + chính sách hoàn tiền 100/50/0 + khiếu nại chủ sân
-- Chạy 1 lần trên DB db_sancaulong đang có dữ liệu (DB mới chỉ cần import db_sancaulong.sql).
USE db_sancaulong;

ALTER TABLE ThongBao
  MODIFY Loai ENUM('booking_created','payment_success','payment_failed','hold_expiring',
                   'booking_cancelled','reminder','refund','new_booking_for_owner',
                   'payout_paid','payout_rejected','venue_locked','system','late_payment',
                   'owner_submitted','owner_approved','owner_rejected',
                   'refund_requested','refund_completed','complaint_received',
                   'complaint_resolved','owner_warning','owner_banned') NOT NULL,
  MODIFY LoaiThamChieu ENUM('booking','payment','payout','venue','owner','complaint') NULL;

ALTER TABLE HoSoChuSan
  ADD COLUMN SoLanViPham TINYINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'số khiếu nại admin xác nhận đúng: 1 cảnh cáo, 2 cảnh cáo nghiêm trọng, 3 khóa tài khoản';

INSERT INTO CauHinhHeThong (KhoaCauHinh, GiaTri, MoTa) VALUES
  ('cancel_half_hours', '12', 'Khách hủy trước giờ chơi từ bấy nhiêu giờ đến dưới cancel_free_hours thì được hoàn một phần; dưới mức này không hoàn')
ON DUPLICATE KEY UPDATE GiaTri = VALUES(GiaTri), MoTa = VALUES(MoTa);
UPDATE CauHinhHeThong SET GiaTri='24', MoTa='Khách hủy trước giờ chơi từ bao nhiêu giờ trở lên thì được hoàn 100%'
  WHERE KhoaCauHinh='cancel_free_hours';
UPDATE CauHinhHeThong SET GiaTri='50', MoTa='Tỷ lệ hoàn (%) khi khách hủy trong khoảng cancel_half_hours đến cancel_free_hours (chủ sân hủy luôn hoàn 100%)'
  WHERE KhoaCauHinh='late_cancel_refund_percent';

-- ---------------------------------------------------------------------
-- 13b. KhieuNai: khách khiếu nại chủ sân (nút "Khiếu nại chủ sân" cạnh thanh toán thành công / hủy / sau hủy)
--      Admin đọc và quyết định: upheld (khiếu nại đúng) -> cộng 1 lần vi phạm cho chủ sân;
--      rejected (không hợp lệ) -> không tính. Tích lũy upheld: 1 = cảnh cáo, 2 = cảnh cáo nghiêm trọng
--      (sắp bị khóa), 3 = khóa tài khoản chủ sân. Mỗi đơn chỉ khiếu nại một lần.
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

