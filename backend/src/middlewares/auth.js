// auth.js
const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
module.exports = (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED', 401, 'Thiếu token');
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); }   // { id, role }
  catch { throw new AppError('UNAUTHORIZED', 401, 'Token không hợp lệ hoặc hết hạn'); }
  next();
};