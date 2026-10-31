const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/customerController');
const kiemTraDuLieu = require('../validators/customer');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');

dinhTuyen.get('/co-so', kiemTraHopLe(kiemTraDuLieu.timCoSo), dieuKhien.timCoSo);
dinhTuyen.get('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.layChiTietCoSo);
dinhTuyen.get('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.maSan), dieuKhien.layChiTietSan);
dinhTuyen.get('/san/:maSan/lich-trong', kiemTraHopLe(kiemTraDuLieu.kiemTraTrong), dieuKhien.kiemTraTrong);

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('customer'));
dinhTuyen.post('/dat-san', kiemTraHopLe(kiemTraDuLieu.datLe), dieuKhien.datLe);
dinhTuyen.post('/dat-san/co-dinh', kiemTraHopLe(kiemTraDuLieu.datCoDinh), dieuKhien.datCoDinh);
dinhTuyen.get('/dat-san', dieuKhien.lietKeDatSan);
dinhTuyen.get('/dat-san/:maDatSan/hoa-don-nhap', kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.layHoaDonNhap);
dinhTuyen.post('/dat-san/:maDatSan/huy', kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.huyDatSan);
dinhTuyen.put('/dat-san/:maDatSan/tai-khoan-hoan-tien',
  kiemTraHopLe(kiemTraDuLieu.thongTinHoanTien), dieuKhien.capNhatTaiKhoanHoan);

module.exports = dinhTuyen;
