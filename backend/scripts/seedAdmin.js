// Dùng: ADMIN_USER=admin ADMIN_PASSWORD=xxx npm run seed:admin
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
(async () => {
  const u = process.env.ADMIN_USER || 'admin';
  const p = process.env.ADMIN_PASSWORD;
  if (!p || p.length < 8) { console.error('Cần ADMIN_PASSWORD (>= 8 ký tự)'); process.exit(1); }
  await pool.query(
    `INSERT INTO users (role, username, password_hash, full_name, phone, email) VALUES ('admin',?,?,?,?,?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [u, await bcrypt.hash(p, 10), 'Quản trị viên', '0900000000', `${u}@local.test`]);
  console.log(`Đã tạo/cập nhật admin "${u}"`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
