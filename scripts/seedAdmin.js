// Dùng: ADMIN_EMAIL=admin@badminton.local ADMIN_PASSWORD=xxx npm run seed:admin
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

async function taoTaiKhoanQuanTri() {
  const email = (process.env.ADMIN_EMAIL || 'admin@badminton.local').trim().toLowerCase();
  const matKhau = process.env.ADMIN_PASSWORD;
  if (!matKhau || matKhau.length < 8) {
    throw new Error('Cần ADMIN_PASSWORD (ít nhất 8 ký tự)');
  }
  const matKhauMaHoa = await bcrypt.hash(matKhau, 10);
  await pool.query(
    `INSERT INTO NguoiDung (VaiTro, MatKhauMaHoa, HoTen, SoDienThoai, Email)
     VALUES ('admin',?,?,?,?)
     ON DUPLICATE KEY UPDATE MatKhauMaHoa = VALUES(MatKhauMaHoa)`,
    [matKhauMaHoa, 'Quản trị viên', '0900000000', email]);
  console.log(`Đã tạo/cập nhật tài khoản quản trị "${email}"`);
}

taoTaiKhoanQuanTri()
  .catch((loi) => {
    console.error(loi);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
