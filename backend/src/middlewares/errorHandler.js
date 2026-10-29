const AppError = require('../utils/AppError');
module.exports = (err, req, res, next) => {
  if (err instanceof AppError)
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
  console.error(err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } });
};