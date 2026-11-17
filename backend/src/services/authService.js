const fs = require('fs/promises');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');
const AppError = require('../utils/AppError');
const { chuanHoaSoDienThoai, kiemTraSoDiDong } = require('../validators/quyTac');
const { timNganHang } = require('../utils/nganHang');
const { thongBaoTheoTrangThai } = require('../utils/hoSoChuSan');
const { ANH_MAC_DINH, luuAnh, xoaAnh } = require('../middlewares/upload');

function taoThongTinNguoiDung(nguoiDung) {
  const thongTin = {
    maNguoiDung: nguoiDung.maNguoiDung,
    vaiTro: nguoiDung.vaiTro,
    hoTen: nguoiDung.hoTen,
    soDienThoai: nguoiDung.soDienThoai,
    email: nguoiDung.email,
    trangThai: nguoiDung.trangThai,
    anhDaiDien: nguoiDung.anhDaiDien ?? ANH_MAC_DINH.avatar,
  };
  if (nguoiDung.vaiTro === 'owner') {
    thongTin.trangThaiDuyet = nguoiDung.trangThaiDuyet;
    thongTin.tenDoanhNghiep = nguoiDung.tenDoanhNghiep ?? null;
    thongTin.lyDoTuChoi = nguoiDung.lyDoTuChoi ?? null;
    // Chưa được duyệt vẫn đăng nhập bình thường; web hiện thông báo này thay cho chức năng quản lý.
    thongTin.thongBaoDuyet = thongBaoTheoTrangThai(nguoiDung.trangThaiDuyet, nguoiDung.lyDoTuChoi);
  }
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
        `INSERT INTO NguoiDung (VaiTro, MatKhauMaHoa, HoTen, SoDienThoai, Email)
         VALUES (?,?,?,?,?)`,
        [
          vaiTro, matKhauMaHoa, duLieuDangKy.hoTen,
          duLieuDangKy.soDienThoai, duLieuDangKy.email,
        ]);
      if (vaiTro === 'owner') await taoHoSoChuSan(ketNoi, ketQua.insertId, duLieuDangKy);
      return ketQua.insertId;
    });
    const nguoiDung = await layNguoiDung(maNguoiDung);
    return { nguoiDung, maTruyCap: taoMaTruyCap(nguoiDung) };
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') {
      throw AppError.biTrung('Email đã được sử dụng', 'EMAIL_EXISTS');
    }
    throw loi;
  }
}

// Đăng ký chủ sân: hồ sơ vào thẳng `pending` (chờ admin duyệt) và điền sẵn thông tin cơ bản:
// tên doanh nghiệp + tài khoản nhận tiền (tên ngân hàng lấy theo mã; chủ tài khoản mặc định = họ tên).
async function taoHoSoChuSan(ketNoi, maNguoiDung, duLieuDangKy) {
  const nganHang = timNganHang(duLieuDangKy.maNganHang);
  if (!nganHang) {
    throw AppError.duLieuKhongHopLe('Dữ liệu không hợp lệ', [
      { truong: 'maNganHang', thongBao: 'Ngân hàng không hợp lệ.' },
    ]);
  }
  await ketNoi.query(
    `INSERT INTO HoSoChuSan
       (MaNguoiDung, TenDoanhNghiep, TenNganHang, MaNganHang, SoTaiKhoan, ChuTaiKhoan,
        TrangThaiDuyet, NgayGuiDuyet)
     VALUES (?,?,?,?,?,?, 'pending', NOW())`,
    [
      maNguoiDung, duLieuDangKy.tenDoanhNghiep, nganHang.tenNganHang, nganHang.maNganHang,
      duLieuDangKy.soTaiKhoan, duLieuDangKy.hoTen,
    ]);
}

async function dangNhap(email, matKhau, cacVaiTroDuocPhep) {
  const [[nguoiDung]] = await pool.query(
    `SELECT MaNguoiDung AS maNguoiDung,
       HoTen AS hoTen, SoDienThoai AS soDienThoai, Email AS email,
       MatKhauMaHoa AS matKhauMaHoa, VaiTro AS vaiTro, TrangThai AS trangThai
     FROM NguoiDung WHERE Email = ? LIMIT 1`,
    [email]);
  const matKhauHopLe = await bcrypt.compare(
    matKhau,
    nguoiDung ? nguoiDung.matKhauMaHoa : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!nguoiDung || !matKhauHopLe) throw AppError.chuaDangNhap('Sai email hoặc mật khẩu');
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
  const [[nguoiDung]] = await pool.query(
    `SELECT nd.MaNguoiDung AS maNguoiDung, nd.VaiTro AS vaiTro,
       nd.HoTen AS hoTen, nd.SoDienThoai AS soDienThoai, nd.Email AS email,
       nd.TrangThai AS trangThai, nd.AnhDaiDien AS anhDaiDien, hs.TrangThaiDuyet AS trangThaiDuyet,
       hs.TenDoanhNghiep AS tenDoanhNghiep, hs.LyDoTuChoi AS lyDoTuChoi
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
  if (duLieuCapNhat.soDienThoai !== undefined) {
    // Chỉ khi ĐỔI số mới bắt buộc số di động (FE: edit_profile_screen). Giữ nguyên số cũ thì không kiểm lại.
    const [[hienTai]] = await pool.query(
      'SELECT SoDienThoai AS soDienThoai FROM NguoiDung WHERE MaNguoiDung = ?', [maNguoiDung]);
    const soDaDoi = !hienTai
      || chuanHoaSoDienThoai(hienTai.soDienThoai) !== chuanHoaSoDienThoai(duLieuCapNhat.soDienThoai);
    const loiSoDienThoai = soDaDoi ? kiemTraSoDiDong(duLieuCapNhat.soDienThoai) : null;
    if (loiSoDienThoai) {
      throw AppError.duLieuKhongHopLe('Dữ liệu không hợp lệ', [
        { truong: 'soDienThoai', thongBao: loiSoDienThoai },
      ]);
    }
  }
  try {
    await pool.query(
      `UPDATE NguoiDung SET ${cacTruongCapNhat.map((truong) => `${cotDuocCapNhat[truong]} = ?`).join(', ')}
       WHERE MaNguoiDung = ?`,
      [...cacTruongCapNhat.map((truong) => duLieuCapNhat[truong]), maNguoiDung]);
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.biTrung('Email đã được sử dụng', 'EMAIL_EXISTS');
    throw loi;
  }
  return layNguoiDung(maNguoiDung);
}

async function doiMatKhau(maNguoiDung, matKhauCu, matKhauMoi) {
  const [[nguoiDung]] = await pool.query(
    'SELECT MatKhauMaHoa AS matKhauMaHoa FROM NguoiDung WHERE MaNguoiDung = ?',
    [maNguoiDung]);
  if (!nguoiDung || !(await bcrypt.compare(matKhauCu, nguoiDung.matKhauMaHoa))) {
    throw AppError.duLieuKhongHopLe('Mật khẩu cũ không đúng');
  }
  await pool.query(
    'UPDATE NguoiDung SET MatKhauMaHoa = ? WHERE MaNguoiDung = ?',
    [await bcrypt.hash(matKhauMoi, 10), maNguoiDung]);
}

// Ảnh đại diện: uploads/avatar/u<maNguoiDung>-<ms>-<4hex>.<đuôi>; ảnh cũ bị xoá (trừ ảnh mặc định).
async function capNhatAnhDaiDien(maNguoiDung, tep) {
  const [[cu]] = await pool.query('SELECT AnhDaiDien AS anh FROM NguoiDung WHERE MaNguoiDung=?', [maNguoiDung]);
  if (!cu) {
    await fs.unlink(tep.path).catch(() => {});
    throw AppError.khongTimThay('Không tìm thấy người dùng');
  }
  const duongDan = await luuAnh(tep, 'avatar', `u${maNguoiDung}`);
  try {
    await pool.query('UPDATE NguoiDung SET AnhDaiDien=? WHERE MaNguoiDung=?', [duongDan, maNguoiDung]);
  } catch (loi) {
    await xoaAnh(duongDan);
    throw loi;
  }
  await xoaAnh(cu.anh);
  return { anhDaiDien: duongDan };
}

module.exports = { dangKy, dangNhap, layNguoiDung, capNhatThongTin, doiMatKhau, capNhatAnhDaiDien };
