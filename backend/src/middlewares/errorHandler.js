const AppError = require('../utils/AppError');
const env = require('../config/env');

const notFound = (req, _res, next) => next(AppError.notFound(`Không có route ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  let e = err;
  if (err.code === 'ER_DUP_ENTRY') e = AppError.conflict('Dữ liệu đã tồn tại');
  else if (err.code === 'LIMIT_FILE_SIZE') e = AppError.badRequest('File quá lớn (tối đa 5MB)');
  else if (err.type === 'entity.parse.failed') e = AppError.badRequest('JSON không hợp lệ');
  if (!(e instanceof AppError)) {
    console.error(err);
    e = new AppError(500, 'Lỗi máy chủ', 'INTERNAL');
  }
  res.status(e.status).json({
    success: false,
    error: { code: e.code, message: e.message, details: e.details,
      ...(env.nodeEnv !== 'production' && e.status === 500 ? { stack: err.stack } : {}) },
  });
};
module.exports = { notFound, errorHandler };
