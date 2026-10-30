// Dùng: ADMIN_USER=admin ADMIN_PASSWORD=xxx npm run seed:admin
const bcrypt = require('bcryptjs');
const { hoBoi } = require('../src/config/db');

async function taoTaiKhoanQuanTri() {
  const tenDangNhap = process.env.ADMIN_USER || 'admin';
  const matKhau = process.env.ADMIN_PASSWORD;
  if (!matKhau || matKhau.length < 8) {
    throw new Error('Cần ADMIN_PASSWORD (ít nhất 8 ký tự)');
  }
  const matKhauMaHoa = await bcrypt.hash(matKhau, 10);
  await hoBoi.query(
    `INSERT INTO NguoiDung (VaiTro, TenDangNhap, MatKhauMaHoa, HoTen, SoDienThoai, Email)
     VALUES ('admin',?,?,?,?,?)
     ON DUPLICATE KEY UPDATE MatKhauMaHoa = VALUES(MatKhauMaHoa)`,
    [tenDangNhap, matKhauMaHoa, 'Quản trị viên', '0900000000', `${tenDangNhap}@local.test`]);
  console.log(`Đã tạo/cập nhật tài khoản quản trị "${tenDangNhap}"`);
}

taoTaiKhoanQuanTri()
  .catch((loi) => {
    console.error(loi);
    process.exitCode = 1;
  })
  .finally(() => hoBoi.end());
