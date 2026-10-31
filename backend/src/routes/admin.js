const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/adminController');
const kiemTraDuLieu = require('../validators/admin');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('admin'));
dinhTuyen.get('/chu-san/cho-duyet', dieuKhien.lietKeHoSoChoDuyet);
dinhTuyen.patch('/chu-san/:maNguoiDung/duyet',
  kiemTraHopLe(kiemTraDuLieu.duyetChuSan), dieuKhien.duyetHoSo);
dinhTuyen.get('/hoan-tien', dieuKhien.lietKeHoanTien);
dinhTuyen.get('/giao-dich/sepay', dieuKhien.lietKeGiaoDichSePay);
dinhTuyen.patch('/hoan-tien/:maThanhToan/xu-ly',
  kiemTraHopLe(kiemTraDuLieu.maThanhToan), dieuKhien.xuLyHoanTien);
dinhTuyen.patch('/hoan-tien/:maThanhToan/hoan-tat',
  kiemTraHopLe(kiemTraDuLieu.hoanTien), dieuKhien.hoanTatHoanTien);
dinhTuyen.get('/rut-tien', dieuKhien.lietKeRutTien);
dinhTuyen.patch('/rut-tien/:maYeuCau/da-chi',
  kiemTraHopLe(kiemTraDuLieu.daChiRutTien), dieuKhien.xacNhanChiRutTien);
dinhTuyen.patch('/rut-tien/:maYeuCau/tu-choi',
  kiemTraHopLe(kiemTraDuLieu.tuChoiRutTien), dieuKhien.tuChoiRutTien);
dinhTuyen.get('/nhat-ky', kiemTraHopLe(kiemTraDuLieu.danhSachNhatKy), dieuKhien.lietKeNhatKy);

module.exports = dinhTuyen;
