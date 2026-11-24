-- G9.F1 · Xoá mềm sân + cho phép trùng tên với sân đã xoá (kế hoạch 24/11/2026, §9).
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql thì KHÔNG cần.
-- Chạy MỘT lần, theo đúng thứ tự (ADD COLUMN không có IF NOT EXISTS để chạy được cả MySQL lẫn MariaDB).
USE db_sancaulong;

-- 1) Cột xoá mềm + cột sinh TenDangDung: bằng TenSan khi sân chưa xoá, NULL khi đã xoá.
--    UNIQUE không tính NULL → sân đã xoá không chiếm tên. Dùng STORED (không dùng VIRTUAL) để chạy cả MySQL lẫn MariaDB.
--    DaXoa phải khai báo TRƯỚC TenDangDung trong cùng câu lệnh.
ALTER TABLE San
  ADD COLUMN DaXoa       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = đã xoá mềm (G9.F); sân đã xoá không hiện ở truy vấn hiện hành, vẫn giữ để hiện tên cũ trong lịch sử',
  ADD COLUMN NgayXoa     DATETIME   NULL COMMENT 'thời điểm xoá mềm; NULL = chưa xoá',
  ADD COLUMN TenDangDung VARCHAR(50) GENERATED ALWAYS AS (IF(DaXoa = 0, TenSan, NULL)) STORED COMMENT 'cột sinh: tên đang dùng (NULL khi đã xoá) — để UNIQUE chỉ áp cho sân chưa xoá',
  ADD UNIQUE KEY UQ_San_TenDangDung (MaCoSo, TenDangDung);

-- 2) Bỏ khoá unique cũ (MaCoSo, TenSan). FK_San_CoSo đã có UQ_San_TenDangDung (bắt đầu bằng MaCoSo) làm chỉ mục thay thế nên bỏ được.
ALTER TABLE San DROP INDEX UQ_San_Ten;
