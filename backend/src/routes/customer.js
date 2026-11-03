const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/customerController');
const kiemTraDuLieu = require('../validators/customer');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');

dinhTuyen.get('/co-so', kiemTraHopLe(kiemTraDuLieu.timCoSo), dieuKhien.timCoSo);
// Phải khai báo trước '/co-so/:maCoSo' để 'danh-sach' không bị hiểu là mã cơ sở.
dinhTuyen.get('/co-so/danh-sach', dieuKhien.layDanhSachCoSo);
dinhTuyen.get('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.layChiTietCoSo);
dinhTuyen.get('/co-so/:maCoSo/lich-ngay', kiemTraHopLe(kiemTraDuLieu.lichNgay), dieuKhien.layLichNgay);
dinhTuyen.get('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.maSan), dieuKhien.layChiTietSan);
dinhTuyen.get('/san/:maSan/lich-trong', kiemTraHopLe(kiemTraDuLieu.kiemTraTrong), dieuKhien.kiemTraTrong);

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('customer'));
dinhTuyen.get('/yeu-thich', dieuKhien.layDanhSachYeuThich);
dinhTuyen.post('/yeu-thich', kiemTraHopLe(kiemTraDuLieu.themYeuThich), dieuKhien.themYeuThich);
dinhTuyen.delete('/yeu-thich/:maCoSo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.boYeuThich);
dinhTuyen.post('/dat-san', kiemTraHopLe(kiemTraDuLieu.datLe), dieuKhien.datLe);
dinhTuyen.post('/dat-san/co-dinh', kiemTraHopLe(kiemTraDuLieu.datCoDinh), dieuKhien.datCoDinh);
dinhTuyen.get('/dat-san', dieuKhien.lietKeDatSan);
dinhTuyen.get('/dat-san/:maDatSan/hoa-don-nhap', kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.layHoaDonNhap);
dinhTuyen.post('/dat-san/:maDatSan/huy', kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.huyDatSan);
dinhTuyen.put('/dat-san/:maDatSan/tai-khoan-hoan-tien',
  kiemTraHopLe(kiemTraDuLieu.thongTinHoanTien), dieuKhien.capNhatTaiKhoanHoan);

module.exports = dinhTuyen;
