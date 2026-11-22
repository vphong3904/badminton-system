-- G4.1 – Hoàn tiền dùng chung: bảng HoanTien (chứng từ hoàn = ẢNH, không dùng mã giao dịch) + trạng thái 'received'
-- + 4 loại thông báo mới. GIỮ các cột hoàn cũ trong ThanhToan (TrangThaiHoanTien, SoTienHoan, ...TaiKhoanHoan): backend
-- ghi đồng bộ để màn danh sách đơn / báo cáo doanh thu cũ vẫn đọc được; nguồn sự thật mới là HoanTien.
-- Chạy lại nhiều lần vẫn an toàn. DB mới dùng db_sancaulong.sql đã có sẵn. MySQL 8 / MariaDB.
USE db_sancaulong;

-- 1. ThanhToan.TrangThaiHoanTien thêm 'received' (khách xác nhận đã nhận lại tiền).
ALTER TABLE ThanhToan
  MODIFY TrangThaiHoanTien ENUM('none','waiting_info','processing','refunded','received','failed') NOT NULL DEFAULT 'none';

-- 2. Bảng HoanTien.
--    TrangThai: waiting_info (chờ khách nhập TK nhận hoàn) → processing (chờ chủ sân/Admin chuyển) → refunded (đã chuyển,
--    có ảnh chứng từ) → received (khách xác nhận đã nhận, đóng) | not_received (khách báo chưa nhận, vẫn tính HanHoan cũ)
--    | escalated (quá HanHoan + refund_grace_hours chưa xử lý → báo Admin).
CREATE TABLE IF NOT EXISTS HoanTien (
  MaHoanTien        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaThanhToan       INT UNSIGNED NOT NULL,
  MaDatSan          INT UNSIGNED NOT NULL COMMENT 'đơn gây ra khoản hoàn (đơn khách bấm hủy / đơn bị chủ sân hủy)',
  Loai              ENUM('cancel','owner_cancel','closure','incident','overpay','late_proof') NOT NULL,
  LyDo              VARCHAR(255) NULL,
  TyLe              TINYINT UNSIGNED NULL COMMENT 'phần trăm hoàn (100/50/0...)',
  SoTien            DECIMAL(12,0) NOT NULL,
  TrangThai         ENUM('waiting_info','processing','refunded','received','not_received','escalated') NOT NULL,
  TenNganHang       VARCHAR(100) NULL,
  MaNganHang        VARCHAR(20)  NULL,
  SoTaiKhoan        VARCHAR(30)  NULL,
  ChuTaiKhoan       VARCHAR(100) NULL,
  HanHoan           DATETIME NULL COMMENT 'hạn chuyển hoàn = lúc tạo + refund_deadline_hours (giờ máy chủ)',
  AnhChungTu        VARCHAR(255) NULL COMMENT 'ảnh chuyển khoản hoàn (bắt buộc khi đánh dấu đã hoàn): /tep-tai-len/<tên>',
  MaNguoiHoan       INT UNSIGNED NULL COMMENT 'chủ sân hoặc Admin bấm đã hoàn',
  VaiTroHoan        ENUM('owner','admin') NULL,
  NgayHoan          DATETIME NULL,
  NgayKhachXacNhan  DATETIME NULL,
  SoLanChuaNhan     TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'số lần khách bấm chưa nhận được',
  GhiChuKhach       VARCHAR(255) NULL,
  NgayNhacHan       DATETIME NULL COMMENT 'đã nhắc chủ sân quá hạn lúc nào (nhắc 1 lần)',
  NgayLeoThang      DATETIME NULL,
  NgayTao           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_HoanTien_ThanhToan FOREIGN KEY (MaThanhToan) REFERENCES ThanhToan(MaThanhToan),
  CONSTRAINT FK_HoanTien_DatSan    FOREIGN KEY (MaDatSan)    REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_HoanTien_NguoiHoan FOREIGN KEY (MaNguoiHoan) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  KEY IDX_HT_ThanhToan (MaThanhToan),
  KEY IDX_HT_TrangThai (TrangThai, HanHoan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Thông báo mới: nhắc quá hạn, leo thang Admin, khách đã nhận / chưa nhận.
ALTER TABLE ThongBao
  MODIFY Loai ENUM('booking_created','payment_success','payment_failed',
                   'booking_cancelled','new_booking_for_owner','system',
                   'refund_requested','refund_completed','complaint_received',
                   'complaint_resolved','owner_warning','owner_banned',
                   'review_received','review_replied','review_hidden','review_sent',
                   'review_reminder',
                   'refund_reminder','refund_escalated','refund_received','refund_not_received') NOT NULL;

-- 4. Dữ liệu cũ: ThanhToan đang có hoàn tiền (≠ none) mà chưa có HoanTien → tạo 1 dòng tương ứng (không có ảnh chứng từ).
INSERT INTO HoanTien (MaThanhToan, MaDatSan, Loai, SoTien, TrangThai, TenNganHang, MaNganHang, SoTaiKhoan, ChuTaiKhoan,
                      HanHoan, NgayHoan, NgayTao)
SELECT t.MaThanhToan, t.MaDatSan,
       CASE WHEN t.TrangThai = 'late_payment' THEN 'late_proof' ELSE 'cancel' END,
       t.SoTienHoan,
       CASE t.TrangThaiHoanTien WHEN 'failed' THEN 'processing' ELSE t.TrangThaiHoanTien END,
       t.TenNganHangHoan, t.MaNganHangHoan, t.SoTaiKhoanHoan, t.ChuTaiKhoanHoan,
       NOW() + INTERVAL 24 HOUR, t.NgayHoan, t.NgayCapNhat
FROM ThanhToan t
WHERE t.TrangThaiHoanTien IN ('waiting_info','processing','refunded')
  AND NOT EXISTS (SELECT 1 FROM HoanTien h WHERE h.MaThanhToan = t.MaThanhToan);
