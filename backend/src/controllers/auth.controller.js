// controllers/auth.controller.js
const svc = require('../services/auth.service');
const { ok, created } = require('../utils/response');
exports.register = async (req, res) => created(res, await svc.registerCustomer(req.body));
exports.registerOwner = async (req, res) => created(res, await svc.registerOwner(req.body));
exports.login = async (req, res) => ok(res, await svc.login(req.body));