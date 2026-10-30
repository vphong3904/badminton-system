const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');

// Giả lập MySQL trong bộ nhớ
const users = [];
const profiles = [];
const fakeConn = {
  async query(sql, p = []) {
    if (/INSERT INTO users/.test(sql)) {
      if (users.some((u) => u.username === p[1])) { const e = new Error('dup username'); e.code = 'ER_DUP_ENTRY'; throw e; }
      const u = { id: users.length + 1, role: p[0], username: p[1], password_hash: p[2], full_name: p[3], phone: p[4], email: p[5], status: 'active' };
      users.push(u); return [{ insertId: u.id }];
    }
    if (/INSERT INTO owner_profiles/.test(sql)) { profiles.push({ user_id: p[0], approval_status: 'draft' }); return [{}]; }
    if (/FROM users u\s+LEFT JOIN owner_profiles/.test(sql)) {
      const u = users.find((x) => x.id === p[0]);
      return [[u && { ...u, approval_status: profiles.find((o) => o.user_id === u.id)?.approval_status }]];
    }
    if (/SELECT \* FROM users WHERE username/.test(sql)) return [[users.find((u) => u.username === p[0])]];
    if (/SELECT id, role, status FROM users/.test(sql)) return [[users.find((u) => u.id === p[0])]];
    throw new Error('Query chưa mock: ' + sql);
  },
  async getConnection() { return { ...fakeConn, beginTransaction() {}, commit() {}, rollback() {}, release() {} }; },
};
require('../src/config/db');
require.cache[require.resolve('../src/config/db')].exports = {
  pool: fakeConn,
  withTransaction: async (fn) => fn(fakeConn),
};
process.env.NODE_ENV = 'test';
const app = require('../src/app');

let server, base;
test.before(async () => { server = app.listen(0); base = `http://localhost:${server.address().port}/api`; });
test.after(() => server.close());
const post = (path, body, token) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

const cust = { username: 'khach01', password: '123456', full_name: 'Nguyen A', phone: '0901234567', email: 'a@x.com' };

test('đăng ký khách + login mobile + /me', async () => {
  const r = await post('/auth/register', cust);
  assert.equal(r.status, 201);
  assert.equal(r.body.data.user.role, 'customer');
  assert.equal(r.body.data.user.password_hash, undefined);
  const l = await post('/auth/login', { username: 'khach01', password: '123456' });
  assert.equal(l.status, 200);
  const me = await fetch(base + '/auth/me', { headers: { authorization: `Bearer ${l.body.data.token}` } }).then((x) => x.json());
  assert.equal(me.data.username, 'khach01');
});
test('sai mật khẩu → 401; trùng username → 409; validate → 400', async () => {
  assert.equal((await post('/auth/login', { username: 'khach01', password: 'sai' })).status, 401);
  assert.equal((await post('/auth/register', cust)).status, 409);
  assert.equal((await post('/auth/register', { ...cust, phone: '123' })).status, 400);
});
test('chủ sân đăng ký → draft; không login được ở mobile, login được ở web', async () => {
  const r = await post('/auth/register-owner', { ...cust, username: 'chu01', email: 'b@x.com' });
  assert.equal(r.body.data.user.approval_status, 'draft');
  assert.equal((await post('/auth/login', { username: 'chu01', password: '123456' })).status, 403);
  assert.equal((await post('/auth/login-web', { username: 'chu01', password: '123456' })).status, 200);
});
test('không có token → 401', async () => {
  const r = await fetch(base + '/auth/me').then((x) => x.status);
  assert.equal(r, 401);
});
