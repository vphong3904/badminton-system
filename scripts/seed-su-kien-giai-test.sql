-- Dữ liệu thử: 1 giải đấu CÓ PHÍ, duyệt tự động (auto) → đăng ký xong phải vào thẳng màn thanh toán.
-- Cơ sở 1 (Cầu Lông Thành Công) của chủ sân 2. Chạy lại được nhiều lần (xóa bản cũ cùng tiêu đề trước).
-- Chạy: mysql -u root -p db_sancaulong < backend/scripts/seed-su-kien-giai-test.sql
DELETE FROM SuKien WHERE TieuDe = '[TEST] Giải cầu lông mở rộng Thành Công' AND MaChuSan = 2;

INSERT INTO SuKien
  (MaCoSo, MaChuSan, Loai, TieuDe, MoTa, DieuLe, NgaySuKien, GioBatDau, GioKetThuc, HanDangKy,
   SoLuongToiDa, TrinhDoTu, TrinhDoDen, CheDoDuyet, Phi, GhiChuPhi, TrangThai)
VALUES
  (1, 2, 'tournament', '[TEST] Giải cầu lông mở rộng Thành Công',
   'Giải thử nghiệm: kiểm tra đăng ký theo hạng mục Nam/Nữ và luồng thanh toán phí.',
   'Thi đấu loại trực tiếp, 21 điểm, 3 set.',
   DATE_ADD(CURDATE(), INTERVAL 10 DAY), '08:00:00', '17:00:00',
   TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 8 DAY), '23:59:00'),
   NULL, 1, 8, 'auto', 150000, 'Lệ phí mỗi người / hạng mục', 'open');

SET @ma_su_kien = LAST_INSERT_ID();

INSERT INTO HangMucSuKien (MaSuKien, TenHangMuc, LaDoi, SoLuongToiDa) VALUES
  (@ma_su_kien, 'Đơn nam',     0, 16),
  (@ma_su_kien, 'Đơn nữ',      0, 16),
  (@ma_su_kien, 'Đôi nam nữ',  1, 16);
