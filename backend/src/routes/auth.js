const router = require('express').Router();
const c = require('../controllers/authController');
const v = require('../validators/auth');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');

router.post('/register', validate(v.register), c.registerCustomer);          // mobile - khách
router.post('/register-owner', validate(v.register), c.registerOwner);       // web - chủ sân
router.post('/login', validate(v.login), c.loginMobile);                     // mobile
router.post('/login-web', validate(v.login), c.loginWeb);                    // web owner/admin
router.get('/me', authenticate, c.me);
router.patch('/me', authenticate, validate(v.updateMe), c.updateMe);
router.post('/change-password', authenticate, validate(v.changePassword), c.changePassword);
module.exports = router;
