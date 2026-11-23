const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/ownerController');
const kiemTraDuLieu = require('../validators/owner');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro, kiemTraChuSanDaDuyet } = require('../middlewares/auth');
const { taiAnhCoSo, taiTep } = require('../middlewares/upload');
const baoCao = require('../controllers/ownerReportController');
const kiemTraBaoCao = require('../validators/ownerReport');
const donDatSan = require('../controllers/ownerBookingController');
const baoCaoKhach = require('../controllers/ownerCustomerReportController');
const checkIn = require('../controllers/checkInController');
const kiemTraCheckIn = require('../validators/checkIn');

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
// Bảng giá theo cơ sở: GET xem danh sách khung giá; POST thêm một khung tuỳ chỉnh; PUT thay cả bảng giá.
dinhTuyen.get('/co-so/:maCoSo/bang-gia', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.layBangGiaCoSo);
dinhTuyen.post('/co-so/:maCoSo/bang-gia', kiemTraHopLe(kiemTraDuLieu.themKhungGia), dieuKhien.themKhungGia);
dinhTuyen.post('/co-so/:maCoSo/anh', kiemTraHopLe(kiemTraDuLieu.maCoSo), taiAnhCoSo.single('tepAnh'), dieuKhien.capNhatAnhCoSo);
// Thư viện ảnh: ảnh bìa + nhiều ảnh sân. POST /anh = đổi ảnh bìa (giữ ảnh cũ trong thư viện); POST /anh-san = thêm ảnh sân.
dinhTuyen.get('/co-so/:maCoSo/anh', kiemTraHopLe(kiemTraDuLieu.maCoSo), dieuKhien.layAnhCoSo);
dinhTuyen.post('/co-so/:maCoSo/anh-san', kiemTraHopLe(kiemTraDuLieu.maCoSo), taiAnhCoSo.single('tepAnh'), dieuKhien.themAnhSan);
dinhTuyen.patch('/co-so/:maCoSo/anh/:maAnh/bia', kiemTraHopLe(kiemTraDuLieu.anhCoSo), dieuKhien.datAnhBia);
dinhTuyen.delete('/co-so/:maCoSo/anh/:maAnh', kiemTraHopLe(kiemTraDuLieu.anhCoSo), dieuKhien.xoaAnhCoSo);
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
// G3: QR check-in của sân (xem / đổi / tải PNG / trang in) + check-in thủ công cho đơn.
dinhTuyen.get('/san/:maSan/qr-check-in', kiemTraHopLe(kiemTraCheckIn.maSan), checkIn.xemQr);
dinhTuyen.post('/san/:maSan/qr-check-in/doi', kiemTraHopLe(kiemTraCheckIn.maSan), checkIn.doiQr);
dinhTuyen.get('/san/:maSan/qr-check-in/anh.png', kiemTraHopLe(kiemTraCheckIn.maSan), checkIn.anhQr);
dinhTuyen.get('/san/:maSan/qr-check-in/in', kiemTraHopLe(kiemTraCheckIn.trangIn), checkIn.trangInQr);
dinhTuyen.post('/dat-san/:maDatSan/check-in-thu-cong',
  kiemTraHopLe(kiemTraCheckIn.checkInThuCong), checkIn.checkInThuCong);
dinhTuyen.get('/khoa-san', kiemTraHopLe(kiemTraDuLieu.danhSachKhoaSan), dieuKhien.lietKeKhoaSan);
dinhTuyen.post('/khoa-san', kiemTraHopLe(kiemTraDuLieu.khoaSan), dieuKhien.taoKhoaSan);
dinhTuyen.delete('/khoa-san/:maKhoa', kiemTraHopLe(kiemTraDuLieu.maKhoaSan), dieuKhien.xoaKhoaSan);
dinhTuyen.post('/dat-san', kiemTraHopLe(kiemTraBaoCao.taoDon), donDatSan.taoDon);
dinhTuyen.get('/dat-san', kiemTraHopLe(kiemTraBaoCao.danhSachDon), donDatSan.lietKeDon);
dinhTuyen.get('/dat-san/:maDatSan', kiemTraHopLe(kiemTraBaoCao.maDon), donDatSan.layChiTietDon);
dinhTuyen.post('/dat-san/:maDatSan/xac-nhan-thanh-toan', kiemTraHopLe(kiemTraBaoCao.maDon), donDatSan.xacNhanThanhToan);
dinhTuyen.post('/dat-san/:maDatSan/tu-choi-thanh-toan', kiemTraHopLe(kiemTraBaoCao.tuChoiThanhToan), donDatSan.tuChoiThanhToan);
dinhTuyen.post('/dat-san/:maDatSan/huy', kiemTraHopLe(kiemTraBaoCao.huyDon), donDatSan.huyDon);
// Đơn chủ sân tự tạo (Nguon='owner', thanh toán ngoài hệ thống): đánh dấu đã thu / huỷ (không hoàn tiền).
dinhTuyen.patch('/dat-san/:maDatSan/da-thu', kiemTraHopLe(kiemTraBaoCao.daThuDon), donDatSan.daThuDon);
dinhTuyen.patch('/dat-san/:maDatSan/huy', kiemTraHopLe(kiemTraBaoCao.huyDonOwner), donDatSan.huyDonOwner);
dinhTuyen.get('/hoan-tien', kiemTraHopLe(kiemTraBaoCao.danhSachHoanTien), donDatSan.lietKeHoanTien);
// G4: kèm ảnh chứng từ chuyển khoản hoàn (multipart, field `anhChungTu`, bắt buộc).
dinhTuyen.post('/hoan-tien/:maThanhToan/hoan-thanh', kiemTraHopLe(kiemTraBaoCao.hoanThanhHoanTien),
  taiTep.single('anhChungTu'), donDatSan.hoanThanhHoanTien);
dinhTuyen.get('/bao-cao/doanh-thu', kiemTraHopLe(kiemTraBaoCao.doanhThu), baoCao.layDoanhThu);
dinhTuyen.get('/bao-cao/top-khach', kiemTraHopLe(kiemTraBaoCao.topKhach), baoCao.layTopKhach);
dinhTuyen.get('/bao-cao/top-san', kiemTraHopLe(kiemTraBaoCao.topSan), baoCao.layTopSan);
dinhTuyen.get('/bao-cao/cong-no', kiemTraHopLe(kiemTraBaoCao.congNo), baoCao.layCongNo);
// Thống kê khách hàng đặt sân.
dinhTuyen.get('/bao-cao/khach-hang/tong-quan', kiemTraHopLe(kiemTraBaoCao.thongKeKhach), baoCaoKhach.layTongQuanKhach);
dinhTuyen.get('/bao-cao/khach-hang/chi-tiet', kiemTraHopLe(kiemTraBaoCao.chiTietKhach), baoCaoKhach.layChiTietKhach);
dinhTuyen.get('/bao-cao/khach-hang', kiemTraHopLe(kiemTraBaoCao.danhSachKhach), baoCaoKhach.lietKeKhach);
// Đánh giá của cơ sở: xem (lọc sao, sắp xếp) + phản hồi (ghi đè được phản hồi cũ) + xoá phản hồi.
dinhTuyen.get('/danh-gia', kiemTraHopLe(kiemTraDuLieu.danhSachDanhGia), dieuKhien.lietKeDanhGia);
dinhTuyen.patch('/danh-gia/:maDanhGia/phan-hoi', kiemTraHopLe(kiemTraDuLieu.phanHoiDanhGia), dieuKhien.phanHoiDanhGia);
dinhTuyen.delete('/danh-gia/:maDanhGia/phan-hoi', kiemTraHopLe(kiemTraDuLieu.xoaPhanHoiDanhGia), dieuKhien.xoaPhanHoiDanhGia);

module.exports = dinhTuyen;
