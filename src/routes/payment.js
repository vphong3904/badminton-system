const express = require('express');
const dinhTuyen = express.Router();
const dieuKhien = require('../controllers/paymentController');
const kiemTraHopLe = require('../middlewares/validate');
const kiemTraDuLieu = require('../validators/payment');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');
const { taiTep } = require('../middlewares/upload');

dinhTuyen.get('/:maDatSan/qr', xacThucNguoiDung, kiemTraVaiTro('customer'),
  kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.layQr);
// Đăng nhập + kiểm tra mã đơn TRƯỚC khi nhận file để không lưu ảnh của request không hợp lệ.
dinhTuyen.post('/:maDatSan/anh-chuyen-khoan', xacThucNguoiDung, kiemTraVaiTro('customer'),
  kiemTraHopLe(kiemTraDuLieu.maDatSan), taiTep.single('anhChuyenKhoan'), dieuKhien.guiAnhChuyenKhoan);

module.exports = dinhTuyen;
