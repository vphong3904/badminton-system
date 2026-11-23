const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/communityChatController');
const { xacThucNguoiDung } = require('../middlewares/auth');

dinhTuyen.use(xacThucNguoiDung);
dinhTuyen.get('/', dieuKhien.lietKePhongCuaToi);
dinhTuyen.get('/:maPhong/tin-nhan', dieuKhien.lietKeTinNhan);
dinhTuyen.post('/:maPhong/tin-nhan', dieuKhien.guiTinNhan);
dinhTuyen.get('/:maPhong/thanh-vien', dieuKhien.lietKeThanhVien);

module.exports = dinhTuyen;
