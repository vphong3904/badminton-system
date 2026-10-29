const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 10,
  timezone: '+07:00',
  dateStrings: true,        // DATE/TIME/DATETIME trả về chuỗi, khỏi lo lệch múi giờ
});

const query = async (sql, params) => (await pool.query(sql, params))[0];

async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
module.exports = { pool, query, withTransaction };