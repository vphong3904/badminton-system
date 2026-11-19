const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/adminController');
const kiemTraDuLieu = require('../validators/admin');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('admin'));
dinhTuyen.get('/chu-san/cho-duyet', dieuKhien.lietKeHoSoChoDuyet);
dinhTuyen.patch('/chu-san/:maNguoiDung/duyet',
  kiemTraHopLe(kiemTraDuLieu.duyetChuSan), dieuKhien.duyetHoSo);
// Admin cũng duyệt được đơn đã gửi ảnh chuyển khoản (như chủ sân).
dinhTuyen.get('/dat-san/cho-xac-nhan', dieuKhien.lietKeThanhToanChoXacNhan);
dinhTuyen.post('/dat-san/:maDatSan/xac-nhan-thanh-toan',
  kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.xacNhanThanhToan);
dinhTuyen.post('/dat-san/:maDatSan/tu-choi-thanh-toan',
  kiemTraHopLe(kiemTraDuLieu.tuChoiThanhToan), dieuKhien.tuChoiThanhToan);
dinhTuyen.get('/hoan-tien', dieuKhien.lietKeHoanTien);
dinhTuyen.patch('/hoan-tien/:maThanhToan/xu-ly',
  kiemTraHopLe(kiemTraDuLieu.maThanhToan), dieuKhien.xuLyHoanTien);
dinhTuyen.patch('/hoan-tien/:maThanhToan/hoan-tat',
  kiemTraHopLe(kiemTraDuLieu.hoanTien), dieuKhien.hoanTatHoanTien);
// Khiếu nại chủ sân: admin đọc và quyết định (chấp nhận → cảnh cáo / cảnh cáo nghiêm trọng / khoá).
dinhTuyen.get('/khieu-nai', kiemTraHopLe(kiemTraDuLieu.danhSachKhieuNai), dieuKhien.lietKeKhieuNai);
dinhTuyen.patch('/khieu-nai/:maKhieuNai/xu-ly',
  kiemTraHopLe(kiemTraDuLieu.xuLyKhieuNai), dieuKhien.xuLyKhieuNai);
// Đánh giá: admin xem toàn bộ, ẩn đánh giá vi phạm (tính lại điểm cơ sở) hoặc hiện lại.
dinhTuyen.get('/danh-gia', kiemTraHopLe(kiemTraDuLieu.danhSachDanhGia), dieuKhien.lietKeDanhGia);
dinhTuyen.patch('/danh-gia/:maDanhGia/an', kiemTraHopLe(kiemTraDuLieu.anHienDanhGia), dieuKhien.anHienDanhGia);
// Đóng tạm / mở lại / xoá sân & cơ sở (cùng điều kiện với chủ sân: không còn khách đặt; xoá phải đóng trước).
dinhTuyen.patch('/san/:maSan/dong', kiemTraHopLe(kiemTraDuLieu.dongXoaSan), dieuKhien.dongSan);
dinhTuyen.patch('/san/:maSan/mo', kiemTraHopLe(kiemTraDuLieu.maSan), dieuKhien.moSan);
dinhTuyen.delete('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.dongXoaSan), dieuKhien.xoaSan);
dinhTuyen.patch('/co-so/:maCoSo/dong', kiemTraHopLe(kiemTraDuLieu.dongXoaCoSo), dieuKhien.dongCoSo);
dinhTuyen.patch('/co-so/:maCoSo/mo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.moCoSo);
dinhTuyen.delete('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.dongXoaCoSo), dieuKhien.xoaCoSo);
dinhTuyen.get('/nguoi-dung', kiemTraHopLe(kiemTraDuLieu.danhSachNguoiDung), dieuKhien.lietKeNguoiDung);
dinhTuyen.patch('/nguoi-dung/:maNguoiDung/khoa',
  kiemTraHopLe(kiemTraDuLieu.khoaTaiKhoan), dieuKhien.khoaTaiKhoan);
dinhTuyen.patch('/nguoi-dung/:maNguoiDung/mo-khoa',
  kiemTraHopLe(kiemTraDuLieu.maNguoiDung), dieuKhien.moKhoaTaiKhoan);
dinhTuyen.get('/co-so', kiemTraHopLe(kiemTraDuLieu.danhSachCoSo), dieuKhien.lietKeCoSo);
dinhTuyen.get('/nhat-ky', kiemTraHopLe(kiemTraDuLieu.danhSachNhatKy), dieuKhien.lietKeNhatKy);

module.exports = dinhTuyen;
