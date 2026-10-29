const AppError = require('../utils/AppError');
module.exports = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError('FORBIDDEN', 403, 'Không đủ quyền');
  next();
};