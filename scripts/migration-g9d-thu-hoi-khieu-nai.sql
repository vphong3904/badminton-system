-- G9.D · Huỷ một phần + thu hồi khiếu nại (kế hoạch 24/11/2026).
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql thì KHÔNG cần.
-- Chạy MỘT lần (ADD COLUMN không có IF NOT EXISTS để chạy được cả MySQL lẫn MariaDB).
-- Huỷ một phần (G9.D1) không cần đổi schema.
USE db_sancaulong;

-- 1) KhieuNai: xoá MỀM (không xoá cứng vì Gay.MaKhieuNai có FK + CHK_Gay_Nguon).
--    Dòng DaXoa=1 bị ẩn khỏi mọi danh sách; vẫn giữ UNIQUE (MaDatSan, Loai) nên khách không khiếu nại lại cùng đơn/loại.
ALTER TABLE KhieuNai
  ADD COLUMN DaXoa        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = Admin đã thu hồi (xoá mềm), ẩn khỏi mọi danh sách (G9.D)' AFTER NgayTao,
  ADD COLUMN NgayXoa      DATETIME     NULL AFTER DaXoa,
  ADD COLUMN LyDoXoa      VARCHAR(255) NULL AFTER NgayXoa,
  ADD COLUMN MaQuanTriXoa INT UNSIGNED NULL AFTER LyDoXoa,
  ADD CONSTRAINT FK_KhieuNai_QuanTriXoa FOREIGN KEY (MaQuanTriXoa) REFERENCES NguoiDung(MaNguoiDung);

-- 2) KhangNghi: thêm trạng thái 'cancelled' = kháng nghị bị huỷ vì khiếu nại gốc đã bị thu hồi.
ALTER TABLE KhangNghi
  MODIFY COLUMN TrangThai ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending';
