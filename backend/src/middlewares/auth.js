const jwt = require('jsonwebtoken');
const cauHinh = require('../config/env');
const { hoBoi } = require('../config/db');
const AppError = require('../utils/AppError');
const xuLyBatDongBo = require('../utils/asyncHandler');

const xacThucNguoiDung = xuLyBatDongBo(async (yeuCau, _phanHoi, goiTiep) => {
  const ketQuaUyQuyen = /^Bearer\s+(.+)$/i.exec(yeuCau.headers.authorization || '');
  if (!ketQuaUyQuyen) throw AppError.chuaDangNhap();
  let thongTinToken;
  try {
    thongTinToken = jwt.verify(ketQuaUyQuyen[1], cauHinh.khoaBiMat);
  } catch {
    throw AppError.chuaDangNhap('Token không hợp lệ hoặc đã hết hạn');
  }
  const [[nguoiDung]] = await hoBoi.query(
    `SELECT MaNguoiDung AS maNguoiDung, VaiTro AS vaiTro, TrangThai AS trangThai
     FROM NguoiDung WHERE MaNguoiDung = ?`,
    [thongTinToken.sub]);
  if (!nguoiDung) throw AppError.chuaDangNhap('Tài khoản không tồn tại');
  if (nguoiDung.trangThai === 'locked') throw AppError.khongDuQuyen('Tài khoản đã bị khóa');
  yeuCau.nguoiDung = nguoiDung;
  goiTiep();
});

const kiemTraVaiTro = (...cacVaiTro) => (yeuCau, _phanHoi, goiTiep) =>
  cacVaiTro.includes(yeuCau.nguoiDung?.vaiTro)
    ? goiTiep()
    : goiTiep(AppError.khongDuQuyen());

const kiemTraChuSanDaDuyet = xuLyBatDongBo(async (yeuCau, _phanHoi, goiTiep) => {
  const [[hoSo]] = await hoBoi.query(
    'SELECT TrangThaiDuyet AS trangThaiDuyet FROM HoSoChuSan WHERE MaNguoiDung = ?',
    [yeuCau.nguoiDung.maNguoiDung]);
  if (!hoSo || hoSo.trangThaiDuyet !== 'approved') {
    throw AppError.khongDuQuyen('Tài khoản chủ sân chưa được admin duyệt');
  }
  goiTiep();
});

module.exports = { xacThucNguoiDung, kiemTraVaiTro, kiemTraChuSanDaDuyet };
