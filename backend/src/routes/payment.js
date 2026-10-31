const express = require('express');
const dinhTuyen = express.Router();
const dieuKhien = require('../controllers/paymentController');
const kiemTraHopLe = require('../middlewares/validate');
const kiemTraDuLieu = require('../validators/payment');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');
const { taiTep } = require('../middlewares/upload');
const { sepayWebhookSecret } = require('../config/env');

dinhTuyen.get('/:maDatSan/qr', xacThucNguoiDung, kiemTraVaiTro('customer'),
  kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.layQr);
dinhTuyen.post('/:maDatSan/anh-chuyen-khoan',
  xacThucNguoiDung, kiemTraVaiTro('customer'), kiemTraHopLe(kiemTraDuLieu.maDatSan),
  taiTep.single('tepAnh'), dieuKhien.taiAnhChuyenKhoan);

module.exports = dinhTuyen;
