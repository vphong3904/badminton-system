const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/authController');
const kiemTraDuLieu = require('../validators/auth');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung } = require('../middlewares/auth');

dinhTuyen.post('/dang-ky', kiemTraHopLe(kiemTraDuLieu.dangKy), dieuKhien.dangKyKhachHang);
dinhTuyen.post('/dang-ky-chu-san', kiemTraHopLe(kiemTraDuLieu.dangKy), dieuKhien.dangKyChuSan);
dinhTuyen.post('/dang-nhap', kiemTraHopLe(kiemTraDuLieu.dangNhap), dieuKhien.dangNhapDiDong);
dinhTuyen.post('/dang-nhap-web', kiemTraHopLe(kiemTraDuLieu.dangNhap), dieuKhien.dangNhapWeb);
dinhTuyen.get('/ca-nhan', xacThucNguoiDung, dieuKhien.layThongTinCaNhan);
dinhTuyen.patch('/ca-nhan', xacThucNguoiDung, kiemTraHopLe(kiemTraDuLieu.capNhatThongTinCaNhan), dieuKhien.capNhatThongTinCaNhan);
dinhTuyen.post('/doi-mat-khau', xacThucNguoiDung, kiemTraHopLe(kiemTraDuLieu.doiMatKhau), dieuKhien.doiMatKhau);

module.exports = dinhTuyen;
