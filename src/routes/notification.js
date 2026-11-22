const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/notificationController');
const kiemTraDuLieu = require('../validators/notification');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung } = require('../middlewares/auth');

// Thông báo của chính người đăng nhập (khách / chủ sân / admin đều dùng chung).
dinhTuyen.use(xacThucNguoiDung);
dinhTuyen.get('/', kiemTraHopLe(kiemTraDuLieu.danhSach), dieuKhien.lietKe);
dinhTuyen.get('/chua-doc', dieuKhien.demChuaDoc);
dinhTuyen.post('/da-doc-tat-ca', dieuKhien.danhDauTatCaDaDoc);
dinhTuyen.patch('/:maThongBao/da-doc', kiemTraHopLe(kiemTraDuLieu.maThongBao), dieuKhien.danhDauDaDoc);

module.exports = dinhTuyen;
