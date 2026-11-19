const jwt = require('jsonwebtoken');
const cauHinh = require('../config/env');
const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thongBaoTheoTrangThai, MA_LOI_THEO_TRANG_THAI } = require('../utils/hoSoChuSan');
const { thongBaoTaiKhoanBiKhoa, MA_LOI_BI_KHOA } = require('../utils/taiKhoanBiKhoa');

const xacThucNguoiDung = xuLyBatDongBo(async (yeuCau, _phanHoi, goiTiep) => {
  const ketQuaUyQuyen = /^Bearer\s+(.+)$/i.exec(yeuCau.headers.authorization || '');
  if (!ketQuaUyQuyen) throw AppError.chuaDangNhap();
  let thongTinToken;
  try {
    thongTinToken = jwt.verify(ketQuaUyQuyen[1], cauHinh.khoaBiMat);
  } catch {
    throw AppError.chuaDangNhap('Token không hợp lệ hoặc đã hết hạn');
  }
  const [[nguoiDung]] = await pool.query(
    `SELECT MaNguoiDung AS maNguoiDung, VaiTro AS vaiTro, TrangThai AS trangThai, LyDoKhoa AS lyDoKhoa
     FROM NguoiDung WHERE MaNguoiDung = ?`,
    [thongTinToken.sub]);
  if (!nguoiDung) throw AppError.chuaDangNhap('Tài khoản không tồn tại');
  if (nguoiDung.trangThai === 'locked') {
    throw new AppError(403, thongBaoTaiKhoanBiKhoa(nguoiDung.lyDoKhoa), MA_LOI_BI_KHOA);
  }
  yeuCau.nguoiDung = nguoiDung;
  goiTiep();
});

const kiemTraVaiTro = (...cacVaiTro) => (yeuCau, _phanHoi, goiTiep) =>
  cacVaiTro.includes(yeuCau.nguoiDung?.vaiTro)
    ? goiTiep()
    : goiTiep(AppError.khongDuQuyen());

const kiemTraChuSanDaDuyet = xuLyBatDongBo(async (yeuCau, _phanHoi, goiTiep) => {
  const [[hoSo]] = await pool.query(
    `SELECT TrangThaiDuyet AS trangThaiDuyet, LyDoTuChoi AS lyDoTuChoi
     FROM HoSoChuSan WHERE MaNguoiDung = ?`,
    [yeuCau.nguoiDung.maNguoiDung]);
  if (!hoSo) throw AppError.khongDuQuyen('Tài khoản chủ sân chưa có hồ sơ');
  if (hoSo.trangThaiDuyet !== 'approved') {
    // 403 kèm mã riêng (OWNER_PENDING / OWNER_REJECTED) để web hiện đúng màn thông báo.
    throw new AppError(
      403,
      thongBaoTheoTrangThai(hoSo.trangThaiDuyet, hoSo.lyDoTuChoi),
      MA_LOI_THEO_TRANG_THAI[hoSo.trangThaiDuyet] || 'FORBIDDEN');
  }
  goiTiep();
});

module.exports = { xacThucNguoiDung, kiemTraVaiTro, kiemTraChuSanDaDuyet };
