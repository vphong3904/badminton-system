const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/ownerController');
const kiemTraDuLieu = require('../validators/owner');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro, kiemTraChuSanDaDuyet } = require('../middlewares/auth');
const { taiAnhCoSo } = require('../middlewares/upload');
const baoCao = require('../controllers/ownerReportController');
const kiemTraBaoCao = require('../validators/ownerReport');
const donDatSan = require('../controllers/ownerBookingController');
const baoCaoKhach = require('../controllers/ownerCustomerReportController');

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('owner'));

// Ho so chu san co the cap nhat khi chua duoc duyet.
dinhTuyen.get('/dang-ky', dieuKhien.layTrangThaiDangKy);
dinhTuyen.put('/dang-ky/co-so', kiemTraHopLe(kiemTraDuLieu.coSo), dieuKhien.luuBuocCoSo);
dinhTuyen.put('/dang-ky/bang-gia', kiemTraHopLe(kiemTraDuLieu.bangGia), dieuKhien.luuBuocBangGia);
dinhTuyen.put('/dang-ky/ngan-hang', kiemTraHopLe(kiemTraDuLieu.nganHang), dieuKhien.luuBuocNganHang);
dinhTuyen.put('/dang-ky/doanh-nghiep', kiemTraHopLe(kiemTraDuLieu.doanhNghiep), dieuKhien.luuBuocDoanhNghiep);
dinhTuyen.post('/dang-ky/gui-duyet', dieuKhien.guiHoSoDuyet);
// Đổi tài khoản nhận tiền: dùng được ở mọi trạng thái hồ sơ (chọn mã ngân hàng + số tài khoản).
dinhTuyen.patch('/ngan-hang', kiemTraHopLe(kiemTraDuLieu.doiNganHang), dieuKhien.doiNganHang);

// Cac chuc nang quan ly chi dung sau khi ho so duoc duyet.
dinhTuyen.use(kiemTraChuSanDaDuyet);
// Cơ sở: một chủ sân có NHIỀU cơ sở.
dinhTuyen.get('/co-so', dieuKhien.lietKeCoSo);
dinhTuyen.post('/co-so', kiemTraHopLe(kiemTraDuLieu.coSo), dieuKhien.taoCoSo);
// API cũ (không có maCoSo → áp dụng cho cơ sở đầu tiên). Phải khai báo TRƯỚC '/co-so/:maCoSo'.
dinhTuyen.put('/co-so', kiemTraHopLe(kiemTraDuLieu.coSo), dieuKhien.capNhatCoSo);
dinhTuyen.put('/co-so/bang-gia', kiemTraHopLe(kiemTraDuLieu.bangGia), dieuKhien.capNhatBangGia);
dinhTuyen.post('/co-so/anh', taiAnhCoSo.single('tepAnh'), dieuKhien.capNhatAnhCoSo);
// API theo từng cơ sở.
dinhTuyen.get('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.layCoSo);
dinhTuyen.put('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.capNhatCoSoTheoMa), dieuKhien.capNhatCoSo);
dinhTuyen.put('/co-so/:maCoSo/bang-gia', kiemTraHopLe(kiemTraDuLieu.bangGiaTheoMa), dieuKhien.capNhatBangGia);
dinhTuyen.post('/co-so/:maCoSo/anh', kiemTraHopLe(kiemTraDuLieu.maCoSo), taiAnhCoSo.single('tepAnh'), dieuKhien.capNhatAnhCoSo);
// Đóng tạm / mở lại / xoá cơ sở: đóng & xoá chỉ khi không còn khách đặt (đơn hiện tại, lịch cố định); xoá phải đóng trước.
dinhTuyen.patch('/co-so/:maCoSo/dong', kiemTraHopLe(kiemTraDuLieu.dongXoaCoSo), dieuKhien.dongCoSo);
dinhTuyen.patch('/co-so/:maCoSo/mo', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.moCoSo);
dinhTuyen.delete('/co-so/:maCoSo', kiemTraHopLe(kiemTraDuLieu.dongXoaCoSo), dieuKhien.xoaCoSo);
dinhTuyen.get('/san', kiemTraHopLe(kiemTraDuLieu.danhSachSan), dieuKhien.lietKeSan);
dinhTuyen.post('/san', kiemTraHopLe(kiemTraDuLieu.san), dieuKhien.taoSan);
dinhTuyen.patch('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.capNhatSan), dieuKhien.capNhatSan);
dinhTuyen.patch('/san/:maSan/dong', kiemTraHopLe(kiemTraDuLieu.dongXoaSan), dieuKhien.dongSan);
dinhTuyen.patch('/san/:maSan/mo', kiemTraHopLe(kiemTraDuLieu.maSan), dieuKhien.moSan);
dinhTuyen.delete('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.dongXoaSan), dieuKhien.xoaSan);
dinhTuyen.get('/khoa-san', kiemTraHopLe(kiemTraDuLieu.danhSachKhoaSan), dieuKhien.lietKeKhoaSan);
dinhTuyen.post('/khoa-san', kiemTraHopLe(kiemTraDuLieu.khoaSan), dieuKhien.taoKhoaSan);
dinhTuyen.delete('/khoa-san/:maKhoa', kiemTraHopLe(kiemTraDuLieu.maKhoaSan), dieuKhien.xoaKhoaSan);
dinhTuyen.post('/dat-san', kiemTraHopLe(kiemTraBaoCao.taoDon), donDatSan.taoDon);
dinhTuyen.get('/dat-san', kiemTraHopLe(kiemTraBaoCao.danhSachDon), donDatSan.lietKeDon);
dinhTuyen.get('/dat-san/:maDatSan', kiemTraHopLe(kiemTraBaoCao.maDon), donDatSan.layChiTietDon);
dinhTuyen.post('/dat-san/:maDatSan/xac-nhan-thanh-toan', kiemTraHopLe(kiemTraBaoCao.maDon), donDatSan.xacNhanThanhToan);
dinhTuyen.post('/dat-san/:maDatSan/tu-choi-thanh-toan', kiemTraHopLe(kiemTraBaoCao.tuChoiThanhToan), donDatSan.tuChoiThanhToan);
dinhTuyen.get('/hoan-tien', kiemTraHopLe(kiemTraBaoCao.danhSachHoanTien), donDatSan.lietKeHoanTien);
dinhTuyen.post('/hoan-tien/:maThanhToan/hoan-thanh', kiemTraHopLe(kiemTraBaoCao.hoanThanhHoanTien), donDatSan.hoanThanhHoanTien);
dinhTuyen.get('/bao-cao/doanh-thu', kiemTraHopLe(kiemTraBaoCao.doanhThu), baoCao.layDoanhThu);
dinhTuyen.get('/bao-cao/top-khach', kiemTraHopLe(kiemTraBaoCao.topKhach), baoCao.layTopKhach);
dinhTuyen.get('/bao-cao/top-san', kiemTraHopLe(kiemTraBaoCao.topSan), baoCao.layTopSan);
dinhTuyen.get('/bao-cao/cong-no', baoCao.layCongNo);
// Thống kê khách hàng đặt sân.
dinhTuyen.get('/bao-cao/khach-hang/tong-quan', kiemTraHopLe(kiemTraBaoCao.thongKeKhach), baoCaoKhach.layTongQuanKhach);
dinhTuyen.get('/bao-cao/khach-hang/chi-tiet', kiemTraHopLe(kiemTraBaoCao.chiTietKhach), baoCaoKhach.layChiTietKhach);
dinhTuyen.get('/bao-cao/khach-hang', kiemTraHopLe(kiemTraBaoCao.danhSachKhach), baoCaoKhach.lietKeKhach);
// Đánh giá của cơ sở: xem + phản hồi (ghi đè được phản hồi cũ).
dinhTuyen.get('/danh-gia', kiemTraHopLe(kiemTraDuLieu.danhSachDanhGia), dieuKhien.lietKeDanhGia);
dinhTuyen.patch('/danh-gia/:maDanhGia/phan-hoi', kiemTraHopLe(kiemTraDuLieu.phanHoiDanhGia), dieuKhien.phanHoiDanhGia);

module.exports = dinhTuyen;
