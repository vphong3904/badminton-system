const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

const sign = (u) => jwt.sign({ id: u.MaNguoiDung, role: u.VaiTro }, process.env.JWT_SECRET, { expiresIn: '7d' });

exports.registerCustomer = async ({ hoTen, email, soDienThoai, matKhau }) => {
  const dup = await query('SELECT 1 FROM NguoiDung WHERE Email=?', [email]);
  if (dup.length) throw new AppError('DUPLICATE', 409, 'Email đã tồn tại');
  const hash = await bcrypt.hash(matKhau, 10);
  const r = await query(
    `INSERT INTO NguoiDung (HoTen, Email, SoDienThoai, MatKhauMaHoa, VaiTro) VALUES (?,?,?,?, 'customer')`,
    [hoTen, email, soDienThoai, hash]);            // VaiTro cố định ở backend
  return { maNguoiDung: r.insertId, hoTen, email, vaiTro: 'customer' };
};

exports.registerOwner = ({ tenDangNhap, matKhau, hoTen, soDienThoai, email }) =>
  withTransaction(async (conn) => {
    const [dup] = await conn.query('SELECT 1 FROM NguoiDung WHERE Email=? OR TenDangNhap=?', [email, tenDangNhap]);
    if (dup.length) throw new AppError('DUPLICATE', 409, 'Email hoặc tên đăng nhập đã tồn tại');
    const hash = await bcrypt.hash(matKhau, 10);
    const [r] = await conn.query(
      `INSERT INTO NguoiDung (TenDangNhap, HoTen, Email, SoDienThoai, MatKhauMaHoa, VaiTro) VALUES (?,?,?,?,?, 'owner')`,
      [tenDangNhap, hoTen, email, soDienThoai, hash]);
    await conn.query('INSERT INTO HoSoChuSan (MaNguoiDung) VALUES (?)', [r.insertId]); // mặc định draft
    return { maNguoiDung: r.insertId, tenDangNhap, vaiTro: 'owner', trangThaiDuyet: 'draft' };
  });

exports.login = async ({ taiKhoan, matKhau }) => {
  const [u] = await query('SELECT * FROM NguoiDung WHERE Email=? OR TenDangNhap=?', [taiKhoan, taiKhoan]);
  if (!u || !(await bcrypt.compare(matKhau, u.MatKhauMaHoa)))
    throw new AppError('UNAUTHORIZED', 401, 'Sai tài khoản hoặc mật khẩu');
  if (u.TrangThai === 'locked') throw new AppError('ACCOUNT_LOCKED', 403, 'Tài khoản đã bị khóa');
  const res = {
    accessToken: sign(u),
    nguoiDung: { maNguoiDung: u.MaNguoiDung, hoTen: u.HoTen, vaiTro: u.VaiTro, anhDaiDien: u.AnhDaiDien },
  };
  if (u.VaiTro === 'owner') {
    const [h] = await query('SELECT TrangThaiDuyet FROM HoSoChuSan WHERE MaNguoiDung=?', [u.MaNguoiDung]);
    res.trangThaiDuyet = h.TrangThaiDuyet;
  }
  return res;
};