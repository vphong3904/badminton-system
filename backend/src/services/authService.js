const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, withTransaction } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const publicUser = (u) => ({
  id: u.id, role: u.role, username: u.username, full_name: u.full_name,
  phone: u.phone, email: u.email, status: u.status,
});

const signToken = (u) =>
  jwt.sign({ sub: u.id, role: u.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

async function register(role, data) {
  const hash = await bcrypt.hash(data.password, 10);
  try {
    const id = await withTransaction(async (conn) => {
      const [r] = await conn.query(
        'INSERT INTO users (role, username, password_hash, full_name, phone, email) VALUES (?,?,?,?,?,?)',
        [role, data.username, hash, data.full_name, data.phone, data.email]);
      if (role === 'owner') await conn.query('INSERT INTO owner_profiles (user_id) VALUES (?)', [r.insertId]);
      return r.insertId;
    });
    return getUser(id).then((user) => ({ user, token: signToken(user) }));
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      throw AppError.conflict(/email/i.test(e.message) ? 'Email đã được sử dụng' : 'Tên đăng nhập đã tồn tại');
    }
    throw e;
  }
}

async function login(username, password, allowedRoles) {
  const [[u]] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  // So sánh hash kể cả khi không có user để tránh lộ timing
  const ok = await bcrypt.compare(password, u ? u.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!u || !ok) throw AppError.unauthorized('Sai tên đăng nhập hoặc mật khẩu');
  if (u.status === 'locked') throw AppError.forbidden('Tài khoản đã bị khóa');
  if (allowedRoles && !allowedRoles.includes(u.role)) throw AppError.forbidden('Tài khoản không dùng được ở nền tảng này');
  const user = await getUser(u.id);
  return { user, token: signToken(u) };
}

/** Trả user kèm approval_status nếu là owner. */
async function getUser(id) {
  const [[u]] = await pool.query(
    `SELECT u.*, op.approval_status FROM users u
     LEFT JOIN owner_profiles op ON op.user_id = u.id WHERE u.id = ?`, [id]);
  if (!u) throw AppError.notFound('Không tìm thấy người dùng');
  const out = publicUser(u);
  if (u.role === 'owner') out.approval_status = u.approval_status;
  return out;
}

async function updateMe(id, data) {
  const keys = Object.keys(data);
  try {
    await pool.query(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), id]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw AppError.conflict('Email đã được sử dụng');
    throw e;
  }
  return getUser(id);
}

async function changePassword(id, oldPw, newPw) {
  const [[u]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [id]);
  if (!(await bcrypt.compare(oldPw, u.password_hash))) throw AppError.badRequest('Mật khẩu cũ không đúng');
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPw, 10), id]);
}

module.exports = { register, login, getUser, updateMe, changePassword };
