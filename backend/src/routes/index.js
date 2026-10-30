const router = require('express').Router();
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

router.get('/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));
router.get('/health/db', asyncHandler(async (_req, res) => {
  await pool.query('SELECT 1');
  ok(res, { db: 'ok' });
}));

router.use('/auth', require('./auth'));
router.use('/owner', require('./owner'));

// Các nhóm sau sẽ được mount tại đây.
module.exports = router;
