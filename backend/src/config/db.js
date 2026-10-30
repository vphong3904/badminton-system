const mysql = require('mysql2/promise');
const cauHinh = require('./env');

const hoBoi = mysql.createPool({
  host: cauHinh.coSoDuLieu.mayChu,
  port: cauHinh.coSoDuLieu.cong,
  user: cauHinh.coSoDuLieu.nguoiDung,
  password: cauHinh.coSoDuLieu.matKhau,
  database: cauHinh.coSoDuLieu.ten,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
  dateStrings: true,
  namedPlaceholders: true,
});

async function thucHienGiaoDich(hamThucThi) {
  const ketNoi = await hoBoi.getConnection();
  try {
    await ketNoi.beginTransaction();
    const ketQua = await hamThucThi(ketNoi);
    await ketNoi.commit();
    return ketQua;
  } catch (loi) {
    await ketNoi.rollback();
    throw loi;
  } finally {
    ketNoi.release();
  }
}

module.exports = { hoBoi, thucHienGiaoDich };
