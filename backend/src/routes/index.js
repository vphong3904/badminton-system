// routes/index.js
const r = require('express').Router();
r.use('/auth', require('./auth.route'));
// các nhóm sau mount thêm ở đây
module.exports = r;