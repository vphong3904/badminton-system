const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/ownerController');
const kiemTraDuLieu = require('../validators/owner');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro, kiemTraChuSanDaDuyet } = require('../middlewares/auth');
const { taiTep } = require('../middlewares/upload');
const baoCao = require('../controllers/ownerReportController');
const kiemTraBaoCao = require('../validators/ownerReport');

dinhTuyen.use(xacThucNguoiDung, kiemTraVaiTro('owner'));

// Ho so chu san co the cap nhat khi chua duoc duyet.
dinhTuyen.get('/dang-ky', dieuKhien.layTrangThaiDangKy);
dinhTuyen.put('/dang-ky/co-so', kiemTraHopLe(kiemTraDuLieu.coSo), dieuKhien.luuBuocCoSo);
dinhTuyen.put('/dang-ky/bang-gia', kiemTraHopLe(kiemTraDuLieu.bangGia), dieuKhien.luuBuocBangGia);
dinhTuyen.put('/dang-ky/ngan-hang', kiemTraHopLe(kiemTraDuLieu.nganHang), dieuKhien.luuBuocNganHang);
dinhTuyen.post('/dang-ky/gui-duyet', dieuKhien.guiHoSoDuyet);

// Cac chuc nang quan ly chi dung sau khi ho so duoc duyet.
dinhTuyen.use(kiemTraChuSanDaDuyet);
dinhTuyen.get('/co-so', dieuKhien.layCoSo);
dinhTuyen.put('/co-so', kiemTraHopLe(kiemTraDuLieu.coSo), dieuKhien.capNhatCoSo);
dinhTuyen.put('/co-so/bang-gia', kiemTraHopLe(kiemTraDuLieu.bangGia), dieuKhien.capNhatBangGia);
dinhTuyen.post('/co-so/anh', taiTep.single('tepAnh'), dieuKhien.capNhatAnhCoSo);
dinhTuyen.get('/san', dieuKhien.lietKeSan);
dinhTuyen.post('/san', kiemTraHopLe(kiemTraDuLieu.san), dieuKhien.taoSan);
dinhTuyen.patch('/san/:maSan', kiemTraHopLe(kiemTraDuLieu.capNhatSan), dieuKhien.capNhatSan);
dinhTuyen.get('/khoa-san', kiemTraHopLe(kiemTraDuLieu.danhSachKhoaSan), dieuKhien.lietKeKhoaSan);
dinhTuyen.post('/khoa-san', kiemTraHopLe(kiemTraDuLieu.khoaSan), dieuKhien.taoKhoaSan);
dinhTuyen.delete('/khoa-san/:maKhoa', kiemTraHopLe(kiemTraDuLieu.maKhoaSan), dieuKhien.xoaKhoaSan);
dinhTuyen.get('/bao-cao/doanh-thu', kiemTraHopLe(kiemTraBaoCao.doanhThu), baoCao.layDoanhThu);
dinhTuyen.get('/bao-cao/top-khach', kiemTraHopLe(kiemTraBaoCao.topKhach), baoCao.layTopKhach);
dinhTuyen.get('/bao-cao/top-san', kiemTraHopLe(kiemTraBaoCao.topSan), baoCao.layTopSan);
dinhTuyen.get('/bao-cao/cong-no', baoCao.layCongNo);
dinhTuyen.get('/rut-tien/so-du', baoCao.laySoDuRutTien);
dinhTuyen.post('/rut-tien', baoCao.taoYeuCauRutTien);

module.exports = dinhTuyen;
