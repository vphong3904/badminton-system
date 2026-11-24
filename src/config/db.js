
const mysql = require('mysql2/promise');
const cauHinh = require('./env');

const pool = mysql.createPool({
  host: cauHinh.coSoDuLieu.mayChu,
  port: cauHinh.coSoDuLieu.cong,
  user: cauHinh.coSoDuLieu.nguoiDung,
  password: cauHinh.coSoDuLieu.matKhau,
  database: cauHinh.coSoDuLieu.ten,

  // [TiDB] TiDB Cloud bắt buộc TLS. Đặt DB_SSL=false chỉ khi chạy DB local không TLS.
  ssl: process.env.DB_SSL === 'false' ? undefined : { minVersion: 'TLSv1.2', rejectUnauthorized: true },

  waitForConnections: true,
  connectionLimit: 10,
  // [TiDB] TiDB Cloud ngắt kết nối nhàn rỗi -> giữ kết nối sống và tự dọn kết nối idle
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  maxIdle: 10,
  idleTimeout: 60000,
  timezone: '+07:00',
  dateStrings: true,
  decimalNumbers: true,
  namedPlaceholders: true,
});

// [TiDB] TiDB Cloud mặc định múi giờ UTC. Option `timezone` của mysql2 KHÔNG đổi NOW()/CURDATE()/CURRENT_TIMESTAMP
// trong SQL, nên phải ép time_zone cho TỪNG kết nối, nếu không hạn giữ chỗ/hạn hoàn/giờ chơi lệch 7 tiếng.
pool.pool.on('connection', (ketNoi) => {
  ketNoi.query("SET time_zone = '+07:00'");
});

async function thucHienGiaoDich(hamThucThi) {
  const ketNoi = await pool.getConnection();

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

module.exports = { pool, thucHienGiaoDich };
