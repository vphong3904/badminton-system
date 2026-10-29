// routes/auth.routes.js
const r = require('express').Router();
const c = require('../controllers/auth.controller');
r.post('/register', c.register);
r.post('/owner/register', c.registerOwner);
r.post('/login', c.login);
module.exports = r;