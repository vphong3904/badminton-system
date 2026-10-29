// controllers/auth.controller.js
const svc = require('../services/auth.service');
const { ok, created } = require('../utils/response');
exports.register = async (req, res) => created(res, await svc.registerCustomer(req.body));
exports.registerOwner = async (req, res) => created(res, await svc.registerOwner(req.body));
exports.login = async (req, res) => ok(res, await svc.login(req.body));

// routes/auth.routes.js
const r = require('express').Router();
const c = require('../controllers/auth.controller');
r.post('/register', c.register);
r.post('/owner/register', c.registerOwner);
r.post('/login', c.login);
module.exports = r;

// routes/index.js
const r = require('express').Router();
r.use('/auth', require('./auth.routes'));
// các nhóm sau mount thêm ở đây
module.exports = r;