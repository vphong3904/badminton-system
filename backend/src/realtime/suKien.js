const { SAN_CHUA_XOA } = require('../utils/sanHienHanh');
// G8.6: phát lại trạng thái các slot bị sự kiện chiếm/nhả sau commit.
const { pool } = require('../config/db');
const { phatLichSan } = require('./phat');

async function layLichSuKien(maSuKien) {
  const [[sk]] = await pool.query('SELECT MaCoSo AS maCoSo,NgaySuKien AS ngay,GioBatDau AS gioBatDau,GioKetThuc AS gioKetThuc FROM SuKien WHERE MaSuKien=?', [maSuKien]);
  return sk || null;
}

async function phatLichTheoSuKien(maSuKien, snapshot = null) {
  if (!maSuKien) return;
  try {
    const sk = snapshot || await layLichSuKien(maSuKien);
    if (!sk) return;
    const [san] = await pool.query(`SELECT MaSan AS maSan FROM San WHERE MaCoSo=? AND ${SAN_CHUA_XOA()} ORDER BY MaSan`, [sk.maCoSo]);
    const cacSlot = [];
    for (const s of san) {
      const [[khoa]] = await pool.query('SELECT MaKhoa FROM KhoaSan WHERE MaSan=? AND NgayKhoa=? AND GioBatDau<? AND GioKetThuc>? LIMIT 1', [s.maSan, sk.ngay, sk.gioKetThuc, sk.gioBatDau]);
      const [[don]] = await pool.query("SELECT MaDatSan FROM DatSan WHERE MaSan=? AND NgayChoi=? AND TrangThai IN ('pending_payment','confirming','confirmed','checked_in') AND GioBatDau<? AND GioKetThuc>? LIMIT 1", [s.maSan, sk.ngay, sk.gioKetThuc, sk.gioBatDau]);
      cacSlot.push({ maSan: Number(s.maSan), gioBatDau: String(sk.gioBatDau).slice(0,8), gioKetThuc: String(sk.gioKetThuc).slice(0,8), trangThai: khoa ? 'locked' : don ? 'booked' : 'available' });
    }
    phatLichSan(sk.maCoSo, String(sk.ngay).slice(0,10), cacSlot);
  } catch (loi) { console.error('[realtime] Không phát được slot sự kiện:', loi.message); }
}
module.exports = { phatLichTheoSuKien, layLichSuKien };
