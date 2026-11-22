-- Chạy 1 lần nếu DB đã import bản cũ (mã ngân hàng đang lưu dạng BIN số).
UPDATE HoSoChuSan SET MaNganHang = CASE MaNganHang
  WHEN '970436' THEN 'VCB' WHEN '970422' THEN 'MB'
  WHEN '970407' THEN 'TCB' WHEN '970416' THEN 'ACB'
  ELSE MaNganHang END
WHERE MaNganHang REGEXP '^[0-9]+$';
