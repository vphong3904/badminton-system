// routes/index.js
const r = require('express').Router();
r.use('/auth', require('./auth.routes'));
// các nhóm sau mount thêm ở đây
module.exports = r;