const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { hoBoi, thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');
const AppError = require('../utils/AppError');

function taoThongTinNguoiDung(nguoiDung) {
  const thongTin = {
    maNguoiDung: nguoiDung.maNguoiDung,
    vaiTro: nguoiDung.vaiTro,
    tenDangNhap: nguoiDung.tenDangNhap,
    hoTen: nguoiDung.hoTen,
    soDienThoai: nguoiDung.soDienThoai,
    email: nguoiDung.email,
    trangThai: nguoiDung.trangThai,
  };
  if (nguoiDung.vaiTro === 'owner') thongTin.trangThaiDuyet = nguoiDung.trangThaiDuyet;
  return thongTin;
}

function taoMaTruyCap(nguoiDung) {
  return jwt.sign(
    { sub: nguoiDung.maNguoiDung, vaiTro: nguoiDung.vaiTro },
    cauHinh.khoaBiMat,
    { expiresIn: cauHinh.thoiHanMaTruyCap });
}

async function dangKy(vaiTro, duLieuDangKy) {
  const matKhauMaHoa = await bcrypt.hash(duLieuDangKy.matKhau, 10);
  try {
    const maNguoiDung = await thucHienGiaoDich(async (ketNoi) => {
      const [ketQua] = await ketNoi.query(
        `INSERT INTO NguoiDung (VaiTro, TenDangNhap, MatKhauMaHoa, HoTen, SoDienThoai, Email)
         VALUES (?,?,?,?,?,?)`,
        [
          vaiTro, duLieuDangKy.tenDangNhap, matKhauMaHoa, duLieuDangKy.hoTen,
          duLieuDangKy.soDienThoai, duLieuDangKy.email,
        ]);
      if (vaiTro === 'owner') {
        await ketNoi.query('INSERT INTO HoSoChuSan (MaNguoiDung) VALUES (?)', [ketQua.insertId]);
      }
      return ketQua.insertId;
    });
    const nguoiDung = await layNguoiDung(maNguoiDung);
    return { nguoiDung, maTruyCap: taoMaTruyCap(nguoiDung) };
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') {
      throw AppError.biTrung(/email/i.test(loi.message) ? 'Email đã được sử dụng' : 'Tên đăng nhập đã tồn tại');
    }
    throw loi;
  }
}

async function dangNhap(tenDangNhap, matKhau, cacVaiTroDuocPhep) {
  const [[nguoiDung]] = await hoBoi.query(
    `SELECT MaNguoiDung AS maNguoiDung, TenDangNhap AS tenDangNhap,
       HoTen AS hoTen, SoDienThoai AS soDienThoai, Email AS email,
       MatKhauMaHoa AS matKhauMaHoa, VaiTro AS vaiTro, TrangThai AS trangThai
     FROM NguoiDung WHERE TenDangNhap = ? OR Email = ? LIMIT 1`,
    [tenDangNhap, tenDangNhap]);
  const matKhauHopLe = await bcrypt.compare(
    matKhau,
    nguoiDung ? nguoiDung.matKhauMaHoa : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!nguoiDung || !matKhauHopLe) throw AppError.chuaDangNhap('Sai tên đăng nhập hoặc mật khẩu');
  if (nguoiDung.trangThai === 'locked') throw AppError.khongDuQuyen('Tài khoản đã bị khóa');
  if (cacVaiTroDuocPhep && !cacVaiTroDuocPhep.includes(nguoiDung.vaiTro)) {
    throw AppError.khongDuQuyen('Tài khoản không dùng được ở nền tảng này');
  }
  const thongTinNguoiDungDayDu = await layNguoiDung(nguoiDung.maNguoiDung);
  return {
    nguoiDung: thongTinNguoiDungDayDu,
    maTruyCap: taoMaTruyCap(nguoiDung),
  };
}

async function layNguoiDung(maNguoiDung) {
  const [[nguoiDung]] = await hoBoi.query(
    `SELECT nd.MaNguoiDung AS maNguoiDung, nd.VaiTro AS vaiTro, nd.TenDangNhap AS tenDangNhap,
       nd.HoTen AS hoTen, nd.SoDienThoai AS soDienThoai, nd.Email AS email,
       nd.TrangThai AS trangThai, hs.TrangThaiDuyet AS trangThaiDuyet
     FROM NguoiDung nd
     LEFT JOIN HoSoChuSan hs ON hs.MaNguoiDung = nd.MaNguoiDung
     WHERE nd.MaNguoiDung = ?`,
    [maNguoiDung]);
  if (!nguoiDung) throw AppError.khongTimThay('Không tìm thấy người dùng');
  return taoThongTinNguoiDung(nguoiDung);
}

async function capNhatThongTin(maNguoiDung, duLieuCapNhat) {
  const cotDuocCapNhat = {
    hoTen: 'HoTen',
    soDienThoai: 'SoDienThoai',
    email: 'Email',
  };
  const cacTruongCapNhat = Object.keys(duLieuCapNhat)
    .filter((truong) => cotDuocCapNhat[truong]);
  try {
    await hoBoi.query(
      `UPDATE NguoiDung SET ${cacTruongCapNhat.map((truong) => `${cotDuocCapNhat[truong]} = ?`).join(', ')}
       WHERE MaNguoiDung = ?`,
      [...cacTruongCapNhat.map((truong) => duLieuCapNhat[truong]), maNguoiDung]);
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.biTrung('Email đã được sử dụng');
    throw loi;
  }
  return layNguoiDung(maNguoiDung);
}

async function doiMatKhau(maNguoiDung, matKhauCu, matKhauMoi) {
  const [[nguoiDung]] = await hoBoi.query(
    'SELECT MatKhauMaHoa AS matKhauMaHoa FROM NguoiDung WHERE MaNguoiDung = ?',
    [maNguoiDung]);
  if (!nguoiDung || !(await bcrypt.compare(matKhauCu, nguoiDung.matKhauMaHoa))) {
    throw AppError.duLieuKhongHopLe('Mật khẩu cũ không đúng');
  }
  await hoBoi.query(
    'UPDATE NguoiDung SET MatKhauMaHoa = ? WHERE MaNguoiDung = ?',
    [await bcrypt.hash(matKhauMoi, 10), maNguoiDung]);
}

module.exports = { dangKy, dangNhap, layNguoiDung, capNhatThongTin, doiMatKhau };
