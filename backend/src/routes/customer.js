const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/customerController');
const kiemTraDuLieu = require('../validators/customer');
const kiemTraHopLe = require('../middlewares/validate');
const checkIn = require('../controllers/checkInController');
const kiemTraCheckIn = require('../validators/checkIn');
const hoanTien = require('../controllers/hoanTienController');
const dieuKhienSuKien = require('../controllers/suKienController');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');

dinhTuyen.get('/co-so', kiemTraHopLe(kiemTraDuLieu.timCoSo), dieuKhien.timCoSo);
// Phải khai báo trước '/co-so/:maCoSo' để 'danh-sach' không bị hiểu là mã cơ sở.
dinhTuyen.get('/co-so/danh-sach', dieuKhien.layDanhSachCoSo);
dinhTuyen.get('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.layChiTietCoSo);
dinhTuyen.get('/co-so/:maCoSo/lich-ngay', kiemTraHopLe(kiemTraDuLieu.lichNgay), dieuKhien.layLichNgay);
// Đánh giá của cơ sở: công khai, không cần đăng nhập (bỏ các đánh giá bị admin ẩn).
dinhTuyen.get('/co-so/:maCoSo/danh-gia',
  kiemTraHopLe(kiemTraDuLieu.danhSachDanhGia), dieuKhien.layDanhSachDanhGia);
dinhTuyen.get('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.maSan), dieuKhien.layChiTietSan);
dinhTuyen.get('/san/:maSan/lich-trong', kiemTraHopLe(kiemTraDuLieu.kiemTraTrong), dieuKhien.kiemTraTrong);

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('customer'));
dinhTuyen.post('/bao-cao', kiemTraHopLe(kiemTraDuLieu.baoCaoSuKien), dieuKhienSuKien.baoCao);
dinhTuyen.get('/yeu-thich', dieuKhien.layDanhSachYeuThich);
dinhTuyen.post('/yeu-thich', kiemTraHopLe(kiemTraDuLieu.themYeuThich), dieuKhien.themYeuThich);
dinhTuyen.delete('/yeu-thich/:maCoSo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.boYeuThich);
dinhTuyen.post('/dat-san', kiemTraHopLe(kiemTraDuLieu.datLe), dieuKhien.datLe);
dinhTuyen.post('/dat-san/co-dinh', kiemTraHopLe(kiemTraDuLieu.datCoDinh), dieuKhien.datCoDinh);
dinhTuyen.post('/dat-san/nhieu', kiemTraHopLe(kiemTraDuLieu.datNhieu), dieuKhien.datNhieu);
dinhTuyen.get('/dat-san', dieuKhien.lietKeDatSan);
dinhTuyen.get('/dat-san/:maDatSan/hoa-don-nhap', kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.layHoaDonNhap);
dinhTuyen.get('/dat-san/:maDatSan/huy-xem-truoc', kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.xemTruocHuy);
// G3: khách quét QR check-in tại sân (mỗi đơn con check-in riêng).
dinhTuyen.post('/dat-san/:maDatSan/check-in', kiemTraHopLe(kiemTraCheckIn.checkIn), checkIn.checkInKhach);
dinhTuyen.post('/dat-san/:maDatSan/huy', kiemTraHopLe(kiemTraDuLieu.huyDatSan), dieuKhien.huyDatSan);
dinhTuyen.post('/dat-san/:maDatSan/danh-gia',
  kiemTraHopLe(kiemTraDuLieu.guiDanhGia), dieuKhien.guiDanhGia);
dinhTuyen.patch('/dat-san/:maDatSan/danh-gia',
  kiemTraHopLe(kiemTraDuLieu.suaDanhGia), dieuKhien.suaDanhGia);
dinhTuyen.delete('/dat-san/:maDatSan/danh-gia',
  kiemTraHopLe(kiemTraDuLieu.xoaDanhGia), dieuKhien.xoaDanhGia);
dinhTuyen.put('/dat-san/:maDatSan/tai-khoan-hoan-tien',
  kiemTraHopLe(kiemTraDuLieu.thongTinHoanTien), dieuKhien.capNhatTaiKhoanHoan);

// G4: khách xác nhận đã nhận lại tiền / báo chưa nhận được (theo maHoanTien trong danh sách đơn).
dinhTuyen.post('/hoan-tien/:maHoanTien/da-nhan', kiemTraHopLe(kiemTraDuLieu.hoanTienKhach), hoanTien.daNhan);
dinhTuyen.post('/hoan-tien/:maHoanTien/chua-nhan', kiemTraHopLe(kiemTraDuLieu.hoanTienKhach), hoanTien.chuaNhan);

dinhTuyen.post('/dat-san/:maDatSan/khieu-nai',
  kiemTraHopLe(kiemTraDuLieu.guiKhieuNai), dieuKhien.guiKhieuNai);
dinhTuyen.post('/hoan-tien/:maHoanTien/khieu-nai',
  kiemTraHopLe(kiemTraDuLieu.khieuNaiHoanTien), dieuKhien.khieuNaiHoanTien);
dinhTuyen.get('/khieu-nai', dieuKhien.lietKeKhieuNai);

module.exports = dinhTuyen;
