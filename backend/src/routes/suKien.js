const fs = require('fs/promises');
const dinhTuyen = require('express').Router();
const dieuKhien = require('../controllers/suKienController');
const kiemTraDuLieu = require('../validators/suKien');
const kiemTraHopLe = require('../middlewares/validate');
const { xacThucNguoiDung, kiemTraVaiTro, kiemTraChuSanDaDuyet } = require('../middlewares/auth');
const { taiTep, taiAnhSuKien } = require('../middlewares/upload');
const kiemTraChungTu = kiemTraHopLe(kiemTraDuLieu.thoiDiemChuyen);
const kiemTraChungTuVaDonDep = (req, res, next) => kiemTraChungTu(req, res, (loi) => {
  if (!loi) return next();
  if (!req.file?.path) return next(loi);
  fs.unlink(req.file.path).catch(() => {}).finally(() => next(loi));
});

// /api/chu-san/su-kien/* — chỉ chủ sân đã được duyệt.
const chuSan = require('express').Router();
chuSan.use(xacThucNguoiDung, kiemTraVaiTro('owner'), kiemTraChuSanDaDuyet);
chuSan.get('/su-kien', kiemTraHopLe(kiemTraDuLieu.danhSachChu), dieuKhien.lietKeCuaChu);
chuSan.post('/su-kien', kiemTraHopLe(kiemTraDuLieu.taoSuKien), dieuKhien.tao);
chuSan.get('/su-kien/:maSuKien', kiemTraHopLe(kiemTraDuLieu.maSuKien), dieuKhien.chiTietCuaChu);
chuSan.patch('/su-kien/:maSuKien', kiemTraHopLe(kiemTraDuLieu.suaSuKien), dieuKhien.sua);
chuSan.post('/su-kien/:maSuKien/anh-bia', kiemTraHopLe(kiemTraDuLieu.maSuKien),
  taiAnhSuKien.single('tepAnh'), dieuKhien.capNhatAnhBia);
chuSan.post('/su-kien/:maSuKien/dong', kiemTraHopLe(kiemTraDuLieu.dongMoSuKien), dieuKhien.dong);
chuSan.post('/su-kien/:maSuKien/mo', kiemTraHopLe(kiemTraDuLieu.dongMoSuKien), dieuKhien.mo);
chuSan.post('/su-kien/:maSuKien/huy', kiemTraHopLe(kiemTraDuLieu.huySuKien), dieuKhien.huy);
chuSan.get('/su-kien/:maSuKien/dang-ky', kiemTraHopLe(kiemTraDuLieu.danhSachDangKy), dieuKhien.lietKeDangKy);
chuSan.post('/dang-ky-su-kien/:maDangKy/chap-nhan', kiemTraHopLe(kiemTraDuLieu.maDangKy), dieuKhien.chapNhanDangKy);
chuSan.post('/dang-ky-su-kien/:maDangKy/tu-choi', kiemTraHopLe(kiemTraDuLieu.tuChoiDangKy), dieuKhien.tuChoiDangKy);
chuSan.post('/dang-ky-su-kien/:maDangKy/loai', kiemTraHopLe(kiemTraDuLieu.loaiDangKy), dieuKhien.loaiDangKy);
chuSan.post('/dang-ky-su-kien/:maDangKy/thanh-toan/xac-nhan', kiemTraHopLe(kiemTraDuLieu.maDangKy), dieuKhien.xacNhanThanhToan);
chuSan.post('/dang-ky-su-kien/:maDangKy/thanh-toan/tu-choi', kiemTraHopLe(kiemTraDuLieu.lyDoThanhToan), dieuKhien.tuChoiThanhToan);
chuSan.post('/dang-ky-su-kien/:maDangKy/thanh-toan/hoan-phi', kiemTraHopLe(kiemTraDuLieu.maDangKy), dieuKhien.hoanPhi);

// /api/khach/su-kien/* — danh sách/chi tiết cũng yêu cầu token customer theo hợp đồng API.
const khach = require('express').Router();

khach.use(
  '/su-kien',
  xacThucNguoiDung,
  kiemTraVaiTro('customer')
);

khach.use(
  '/dang-ky-su-kien',
  xacThucNguoiDung,
  kiemTraVaiTro('customer')
);
khach.get('/su-kien', kiemTraHopLe(kiemTraDuLieu.danhSachKhach), dieuKhien.lietKeCongKhai);
khach.get('/su-kien/:maSuKien', kiemTraHopLe(kiemTraDuLieu.chiTietKhach), dieuKhien.chiTietCongKhai);
khach.post('/su-kien/:maSuKien/dang-ky', kiemTraHopLe(kiemTraDuLieu.dangKyKhach), dieuKhien.dangKy);
khach.delete('/dang-ky-su-kien/:maDangKy', kiemTraHopLe(kiemTraDuLieu.rutDangKy), dieuKhien.rutDangKy);
khach.get('/dang-ky-su-kien', kiemTraHopLe(kiemTraDuLieu.dangKyCuaToi), dieuKhien.dangKyCuaToi);
khach.get('/dang-ky-su-kien/:maDangKy/thanh-toan', kiemTraHopLe(kiemTraDuLieu.rutDangKy), dieuKhien.hoaDon);
khach.post('/dang-ky-su-kien/:maDangKy/thanh-toan/chung-tu',
  taiTep.single('anhChungTu'), kiemTraChungTuVaDonDep, dieuKhien.guiChungTu);

dinhTuyen.use('/chu-san', chuSan);
dinhTuyen.use('/khach', khach);
module.exports = dinhTuyen;
