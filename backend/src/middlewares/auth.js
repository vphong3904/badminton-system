const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/** Yêu cầu Bearer token hợp lệ; gán req.user = { id, role }. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw AppError.unauthorized();
  let payload;
  try { payload = jwt.verify(m[1], env.jwtSecret); } catch { throw AppError.unauthorized('Token không hợp lệ hoặc đã hết hạn'); }
  const [[u]] = await pool.query('SELECT id, role, status FROM users WHERE id = ?', [payload.sub]);
  if (!u) throw AppError.unauthorized('Tài khoản không tồn tại');
  if (u.status === 'locked') throw AppError.forbidden('Tài khoản đã bị khóa');
  req.user = { id: u.id, role: u.role };
  next();
});

const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(AppError.forbidden());

/** Chủ sân phải được admin duyệt mới được tạo sân/quản lý doanh thu. */
const requireApprovedOwner = asyncHandler(async (req, _res, next) => {
  const [[p]] = await pool.query('SELECT approval_status FROM owner_profiles WHERE user_id = ?', [req.user.id]);
  if (!p || p.approval_status !== 'approved') throw AppError.forbidden('Tài khoản chủ sân chưa được admin duyệt');
  next();
});

module.exports = { authenticate, requireRole, requireApprovedOwner };
