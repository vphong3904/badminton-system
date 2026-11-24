-- G9.H · Khách "Đồng ý chuyển sân" (bên cạnh "Từ chối chuyển sân").
-- Chạy trên DB đã có dữ liệu. DB import mới từ db_sancaulong.sql thì KHÔNG cần. Chạy MỘT lần.
USE db_sancaulong;

ALTER TABLE DatSan
  ADD COLUMN NgayKhachDongYChuyen DATETIME NULL
    COMMENT 'khách bấm Đồng ý chuyển sân (G9.H); NULL = chưa phản hồi; chủ sân chuyển lại thì reset NULL' AFTER NgayChuyenSan;
