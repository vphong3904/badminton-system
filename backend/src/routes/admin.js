const fs = require('fs');
const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/adminController');
const kiemTraDuLieu = require('../validators/admin');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro } = require('../middlewares/auth');
const { taiTep } = require('../middlewares/upload');

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('admin'));
dinhTuyen.get('/chu-san/cho-duyet', dieuKhien.lietKeHoSoChoDuyet);
dinhTuyen.patch('/chu-san/:maNguoiDung/duyet',
  kiemTraHopLe(kiemTraDuLieu.duyetChuSan), dieuKhien.duyetHoSo);
// Admin cũng duyệt được đơn đã gửi ảnh chuyển khoản (như chủ sân).
dinhTuyen.get('/dat-san/cho-xac-nhan',
  kiemTraHopLe(kiemTraDuLieu.danhSachChoXacNhan), dieuKhien.lietKeThanhToanChoXacNhan);
dinhTuyen.post('/dat-san/:maDatSan/xac-nhan-thanh-toan',
  kiemTraHopLe(kiemTraDuLieu.maDatSan), dieuKhien.xacNhanThanhToan);
dinhTuyen.post('/dat-san/:maDatSan/tu-choi-thanh-toan',
  kiemTraHopLe(kiemTraDuLieu.tuChoiThanhToan), dieuKhien.tuChoiThanhToan);
dinhTuyen.get('/hoan-tien', dieuKhien.lietKeHoanTien);
dinhTuyen.patch('/hoan-tien/:maThanhToan/xu-ly',
  kiemTraHopLe(kiemTraDuLieu.maThanhToan), dieuKhien.xuLyHoanTien);
// Kiểm mã thanh toán TRƯỚC khi nhận file; bắt buộc ảnh chứng từ (field `anhChungTu`).
dinhTuyen.patch('/hoan-tien/:maThanhToan/hoan-tat',
  kiemTraHopLe(kiemTraDuLieu.hoanTien), taiTep.single('anhChungTu'), dieuKhien.hoanTatHoanTien);
// Khiếu nại chủ sân: admin đọc và quyết định (chấp nhận → cảnh cáo / cảnh cáo nghiêm trọng / khoá).
dinhTuyen.get('/khieu-nai', kiemTraHopLe(kiemTraDuLieu.danhSachKhieuNai), dieuKhien.lietKeKhieuNai);
// G8.5b: báo cáo bài/nhóm và quản lý nội dung cộng đồng.
dinhTuyen.get('/cong-dong/bao-cao', kiemTraHopLe(kiemTraDuLieu.danhSachBaoCaoCongDong), dieuKhien.lietKeBaoCaoCongDong);
dinhTuyen.patch('/cong-dong/bao-cao/:maBaoCao/xu-ly', kiemTraHopLe(kiemTraDuLieu.xuLyBaoCaoCongDong), dieuKhien.xuLyBaoCaoCongDong);
dinhTuyen.get('/cong-dong/bai', kiemTraHopLe(kiemTraDuLieu.danhSachNoiDungCongDong), dieuKhien.lietKeBaiCongDong);
dinhTuyen.patch('/cong-dong/bai/:maDoiTuong/an', kiemTraHopLe(kiemTraDuLieu.maNoiDungCongDong), dieuKhien.anBaiCongDong);
dinhTuyen.patch('/cong-dong/bai/:maDoiTuong/bo-an', kiemTraHopLe(kiemTraDuLieu.boAnNoiDungCongDong), dieuKhien.boAnBaiCongDong);
dinhTuyen.delete('/cong-dong/bai/:maDoiTuong', kiemTraHopLe(kiemTraDuLieu.maNoiDungCongDong), dieuKhien.xoaBaiCongDong);
dinhTuyen.get('/cong-dong/doi-nhom', kiemTraHopLe(kiemTraDuLieu.danhSachNoiDungCongDong), dieuKhien.lietKeDoiNhomCongDong);
dinhTuyen.patch('/cong-dong/doi-nhom/:maDoiTuong/an', kiemTraHopLe(kiemTraDuLieu.maNoiDungCongDong), dieuKhien.anDoiNhomCongDong);
dinhTuyen.patch('/cong-dong/doi-nhom/:maDoiTuong/bo-an', kiemTraHopLe(kiemTraDuLieu.boAnNoiDungCongDong), dieuKhien.boAnDoiNhomCongDong);
dinhTuyen.delete('/cong-dong/doi-nhom/:maDoiTuong', kiemTraHopLe(kiemTraDuLieu.maNoiDungCongDong), dieuKhien.xoaDoiNhomCongDong);
// G7.12: báo cáo vi phạm sự kiện + Admin ẩn/bỏ ẩn.
dinhTuyen.get('/bao-cao', kiemTraHopLe(kiemTraDuLieu.danhSachBaoCaoSuKien), dieuKhien.lietKeBaoCaoSuKien);
dinhTuyen.patch('/bao-cao/:maBaoCao/xu-ly', kiemTraHopLe(kiemTraDuLieu.xuLyBaoCaoSuKien), dieuKhien.xuLyBaoCaoSuKien);
dinhTuyen.patch('/su-kien/:maSuKien/an', kiemTraHopLe(kiemTraDuLieu.anSuKien), dieuKhien.anSuKien);
dinhTuyen.patch('/su-kien/:maSuKien/bo-an', kiemTraHopLe(kiemTraDuLieu.boAnSuKien), dieuKhien.boAnSuKien);
// G5.4: nhận JSON hoặc multipart (field `anhBangChung`, ≤3 ảnh). multer chạy TRƯỚC zod để body multipart có dữ liệu;
// lỗi dữ liệu thì xóa ảnh đã tải lên.
dinhTuyen.patch('/khieu-nai/:maKhieuNai/xu-ly',
  taiTep.array('anhBangChung', 3),
  (yeuCau, phanHoi, tiep) => kiemTraHopLe(kiemTraDuLieu.xuLyKhieuNai)(yeuCau, phanHoi, (loi) => {
    if (loi) (yeuCau.files || []).forEach((tep) => fs.unlink(tep.path, () => {}));
    tiep(loi);
  }),
  dieuKhien.xuLyKhieuNai);
// G5.5: kháng nghị của chủ sân (thu hồi / giữ gậy) + khóa/mở khóa nhận đặt mới.
dinhTuyen.get('/khang-nghi', kiemTraHopLe(kiemTraDuLieu.danhSachKhangNghi), dieuKhien.lietKeKhangNghi);
dinhTuyen.patch('/khang-nghi/:maKhangNghi/xu-ly', kiemTraHopLe(kiemTraDuLieu.xuLyKhangNghi), dieuKhien.xuLyKhangNghi);
dinhTuyen.patch('/chu-san/:maNguoiDung/khoa-dat-moi', kiemTraHopLe(kiemTraDuLieu.khoaDatMoi), dieuKhien.khoaDatMoi);
// Đánh giá: admin xem toàn bộ, ẩn đánh giá vi phạm (tính lại điểm cơ sở) hoặc hiện lại.
dinhTuyen.get('/danh-gia', kiemTraHopLe(kiemTraDuLieu.danhSachDanhGia), dieuKhien.lietKeDanhGia);
dinhTuyen.patch('/danh-gia/:maDanhGia/an', kiemTraHopLe(kiemTraDuLieu.anHienDanhGia), dieuKhien.anHienDanhGia);
// Đóng tạm / mở lại / xoá sân & cơ sở (cùng điều kiện với chủ sân: không còn khách đặt; xoá phải đóng trước).
dinhTuyen.patch('/san/:maSan/dong', kiemTraHopLe(kiemTraDuLieu.dongXoaSan), dieuKhien.dongSan);
dinhTuyen.patch('/san/:maSan/mo', kiemTraHopLe(kiemTraDuLieu.maSan), dieuKhien.moSan);
dinhTuyen.delete('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.dongXoaSan), dieuKhien.xoaSan);
dinhTuyen.patch('/co-so/:maCoSo/dong', kiemTraHopLe(kiemTraDuLieu.dongXoaCoSo), dieuKhien.dongCoSo);
dinhTuyen.patch('/co-so/:maCoSo/mo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.moCoSo);
// G7.9: khóa/mở khóa cơ sở trực tiếp; khóa sẽ hủy sự kiện sắp diễn ra và giải phóng sân.
dinhTuyen.patch('/co-so/:maCoSo/khoa', kiemTraHopLe(kiemTraDuLieu.khoaCoSo), dieuKhien.khoaCoSo);
dinhTuyen.patch('/co-so/:maCoSo/mo-khoa', kiemTraHopLe(kiemTraDuLieu.moKhoaCoSo), dieuKhien.moKhoaCoSo);
dinhTuyen.delete('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.dongXoaCoSo), dieuKhien.xoaCoSo);
dinhTuyen.get('/nguoi-dung', kiemTraHopLe(kiemTraDuLieu.danhSachNguoiDung), dieuKhien.lietKeNguoiDung);
dinhTuyen.patch('/nguoi-dung/:maNguoiDung/khoa',
  kiemTraHopLe(kiemTraDuLieu.khoaTaiKhoan), dieuKhien.khoaTaiKhoan);
dinhTuyen.patch('/nguoi-dung/:maNguoiDung/mo-khoa',
  kiemTraHopLe(kiemTraDuLieu.maNguoiDung), dieuKhien.moKhoaTaiKhoan);
dinhTuyen.get('/co-so', kiemTraHopLe(kiemTraDuLieu.danhSachCoSo), dieuKhien.lietKeCoSo);
dinhTuyen.get('/nhat-ky', kiemTraHopLe(kiemTraDuLieu.danhSachNhatKy), dieuKhien.lietKeNhatKy);

module.exports = dinhTuyen;
