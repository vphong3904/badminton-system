const svc = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

exports.registerCustomer = asyncHandler(async (req, res) => created(res, await svc.register('customer', req.body)));
exports.registerOwner = asyncHandler(async (req, res) => created(res, await svc.register('owner', req.body)));
// Mobile chỉ cho customer; web cho owner/admin
exports.loginMobile = asyncHandler(async (req, res) => ok(res, await svc.login(req.body.username, req.body.password, ['customer'])));
exports.loginWeb = asyncHandler(async (req, res) => ok(res, await svc.login(req.body.username, req.body.password, ['owner', 'admin'])));
exports.me = asyncHandler(async (req, res) => ok(res, await svc.getUser(req.user.id)));
exports.updateMe = asyncHandler(async (req, res) => ok(res, await svc.updateMe(req.user.id, req.body)));
exports.changePassword = asyncHandler(async (req, res) => {
  await svc.changePassword(req.user.id, req.body.old_password, req.body.new_password);
  ok(res, { message: 'Đổi mật khẩu thành công' });
});
