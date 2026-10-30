const AppError = require('../utils/AppError');

/** validate({ body, query, params }) với schema zod. Gán kết quả đã parse lại vào req. */
module.exports = (schemas) => (req, _res, next) => {
  for (const key of ['body', 'query', 'params']) {
    if (!schemas[key]) continue;
    const r = schemas[key].safeParse(req[key]);
    if (!r.success) {
      const details = r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(AppError.badRequest('Dữ liệu không hợp lệ', details));
    }
    Object.defineProperty(req, key, { value: r.data, writable: true, configurable: true });
  }
  next();
};
