// G8.6: phát tín hiệu đơn đặt sân + các slot vừa đổi. Chỉ gọi sau khi service đã commit.
const { pool } = require('../config/db');
const { phatChoNguoiDung, phatLichSan } = require('./phat');

async function phatCapNhatDatSan(maDatSan) {
  if (!maDatSan) return { soDon: 0 };
  try {
    const [[goc]] = await pool.query('SELECT MaNhomDat,MaLichCoDinh FROM DatSan WHERE MaDatSan=?', [maDatSan]);
    if (!goc) return { soDon: 0 };
    const [rows] = await pool.query(
      `SELECT d.MaDatSan AS maDatSan,d.MaDon AS maDon,d.MaKhachHang AS maKhachHang,
         d.MaSan AS maSan,d.NgayChoi AS ngay,d.GioBatDau AS gioBatDau,d.GioKetThuc AS gioKetThuc,
         d.TrangThai AS trangThai,cs.MaCoSo AS maCoSo,cs.MaChuSan AS maChuSan,
         CASE WHEN EXISTS (SELECT 1 FROM KhoaSan k WHERE k.MaSan=d.MaSan AND k.NgayKhoa=d.NgayChoi AND k.MaSuKien IS NOT NULL AND k.GioBatDau<d.GioKetThuc AND k.GioKetThuc>d.GioBatDau) THEN 'event'
              WHEN EXISTS (SELECT 1 FROM KhoaSan k WHERE k.MaSan=d.MaSan AND k.NgayKhoa=d.NgayChoi AND k.GioBatDau<d.GioKetThuc AND k.GioKetThuc>d.GioBatDau) THEN 'locked'
              WHEN EXISTS (SELECT 1 FROM DatSan d2 WHERE d2.MaSan=d.MaSan AND d2.NgayChoi=d.NgayChoi AND d2.TrangThai IN ('pending_payment','confirming','confirmed','checked_in') AND d2.GioBatDau<d.GioKetThuc AND d2.GioKetThuc>d.GioBatDau) THEN 'booked' ELSE 'available' END AS trangThaiSlot
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       WHERE (d.MaLichCoDinh IS NOT NULL AND d.MaLichCoDinh=?) OR d.MaNhomDat=COALESCE(?,?) OR d.MaDatSan=?`, [goc.MaLichCoDinh, goc.MaNhomDat, maDatSan, maDatSan]);
    const theoLich = new Map();
    for (const row of rows) {
      const payload = { maDatSan: Number(row.maDatSan), maDon: row.maDon, trangThai: row.trangThai };
      if (row.maKhachHang) phatChoNguoiDung(row.maKhachHang, 'dat-san:cap-nhat', payload);
      if (row.maChuSan) phatChoNguoiDung(row.maChuSan, 'dat-san:cap-nhat', payload);
      const key = `${row.maCoSo}:${String(row.ngay).slice(0,10)}`;
      if (!theoLich.has(key)) theoLich.set(key, { maCoSo: row.maCoSo, ngay: String(row.ngay).slice(0,10), cacSlot: [] });
      const slot = { maSan: Number(row.maSan), gioBatDau: String(row.gioBatDau).slice(0,8), gioKetThuc: String(row.gioKetThuc).slice(0,8), trangThai: row.trangThaiSlot };
      theoLich.get(key).cacSlot.push(slot);
    }
    for (const lich of theoLich.values()) phatLichSan(lich.maCoSo, lich.ngay, lich.cacSlot);
    return { soDon: rows.length };
  } catch (loi) {
    console.error('[realtime] Không phát được cập nhật đơn/sân:', loi.message);
    return { soDon: 0 };
  }
}

async function phatMotSlot(maSan, ngay, gioBatDau, gioKetThuc) {
  try {
    const [[san]] = await pool.query('SELECT MaCoSo AS maCoSo FROM San WHERE MaSan=?', [maSan]);
    if (!san) return;
    const [[khoa]] = await pool.query('SELECT MaKhoa, MaSuKien FROM KhoaSan WHERE MaSan=? AND NgayKhoa=? AND GioBatDau<? AND GioKetThuc>? ORDER BY (MaSuKien IS NOT NULL) DESC LIMIT 1', [maSan, ngay, gioKetThuc, gioBatDau]);
    const [[don]] = await pool.query("SELECT MaDatSan FROM DatSan WHERE MaSan=? AND NgayChoi=? AND TrangThai IN ('pending_payment','confirming','confirmed','checked_in') AND GioBatDau<? AND GioKetThuc>? LIMIT 1", [maSan, ngay, gioKetThuc, gioBatDau]);
    phatLichSan(san.maCoSo, String(ngay).slice(0,10), [{ maSan: Number(maSan), gioBatDau: String(gioBatDau).slice(0,8), gioKetThuc: String(gioKetThuc).slice(0,8), trangThai: khoa ? (khoa.MaSuKien ? 'event' : 'locked') : don ? 'booked' : 'available' }]);
  } catch (loi) { console.error('[realtime] Không phát được slot khóa sân:', loi.message); }
}

async function phatNhieuCapNhatDatSan(cacMaDatSan = []) {
  for (const id of [...new Set((cacMaDatSan || []).map(Number).filter(Number.isInteger))]) await phatCapNhatDatSan(id);
}
module.exports = { phatCapNhatDatSan, phatNhieuCapNhatDatSan, phatMotSlot };
