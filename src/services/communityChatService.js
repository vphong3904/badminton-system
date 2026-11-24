const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const { phatChoPhong } = require('../realtime/phat');

const CUA_SO_MS = 60_000;
const GIOI_HAN_TIN = 20;
const demTheoNguoiDung = new Map();

function kiemTraMa(ma, ten = 'Mã phòng') {
  const n = Number(ma);
  if (!Number.isSafeInteger(n) || n <= 0) throw AppError.duLieuKhongHopLe(`${ten} không hợp lệ`);
  return n;
}

async function layQuyenPhong(ketNoi, maPhong, maNguoiDung) {
  const [[phong]] = await ketNoi.query(
    `SELECT p.MaPhong AS maPhong, p.Loai AS loai, p.TrangThai AS trangThaiPhong,
       tv.TrangThai AS trangThaiThanhVien, tv.VaiTro AS vaiTro
     FROM PhongChat p
     JOIN ThanhVienPhong tv ON tv.MaPhong=p.MaPhong AND tv.MaNguoiDung=?
     WHERE p.MaPhong=?`,
    [maNguoiDung, maPhong]);
  if (!phong || phong.trangThaiThanhVien === 'removed' || phong.trangThaiThanhVien === 'left') {
    throw AppError.khongDuQuyen('Bạn không còn quyền truy cập phòng chat này');
  }
  return phong;
}

function kiemTraGioiHan(maNguoiDung) {
  const now = Date.now();
  const muc = demTheoNguoiDung.get(maNguoiDung);
  if (!muc || now - muc.batDau >= CUA_SO_MS) {
    demTheoNguoiDung.set(maNguoiDung, { batDau: now, soTin: 1 });
    return;
  }
  if (muc.soTin >= GIOI_HAN_TIN) {
    const conLai = Math.max(1, Math.ceil((CUA_SO_MS - (now - muc.batDau)) / 1000));
    throw new AppError(429, `Bạn gửi quá nhanh. Vui lòng thử lại sau ${conLai} giây.`, 'RATE_LIMITED');
  }
  muc.soTin += 1;
}

async function guiTinNhan({ maPhong: maPhongRaw, maNguoiGui, noiDung }) {
  const maPhong = kiemTraMa(maPhongRaw);
  const nguoiGui = kiemTraMa(maNguoiGui, 'Mã người dùng');
  const noiDungSach = String(noiDung ?? '').trim();
  if (!noiDungSach || Array.from(noiDungSach).length > 1000) {
    throw AppError.duLieuKhongHopLe('Tin nhắn phải có từ 1 đến 1000 ký tự');
  }

  const ketNoi = await pool.getConnection();
  try {
    await ketNoi.beginTransaction();
    const phong = await layQuyenPhong(ketNoi, maPhong, nguoiGui);
    if (phong.trangThaiPhong !== 'open' || phong.trangThaiThanhVien !== 'active') {
      throw AppError.khongDuQuyen('Phòng chat hiện chỉ cho phép xem, không thể gửi tin nhắn');
    }
    kiemTraGioiHan(nguoiGui);
    const [ketQua] = await ketNoi.query(
      'INSERT INTO TinNhan (MaPhong, MaNguoiGui, NoiDung) VALUES (?,?,?)',
      [maPhong, nguoiGui, noiDungSach]);
    const [[tin]] = await ketNoi.query(
      `SELECT t.MaTin AS maTin, t.MaPhong AS maPhong, t.MaNguoiGui AS maNguoiGui,
        nd.HoTen AS tenNguoiGui, nd.AnhDaiDien AS anhDaiDien,
        t.NoiDung AS noiDung, t.NgayTao AS ngayTao
       FROM TinNhan t JOIN NguoiDung nd ON nd.MaNguoiDung=t.MaNguoiGui
       WHERE t.MaTin=?`, [ketQua.insertId]);
    await ketNoi.commit();
    phatChoPhong(maPhong, 'chat:tin-moi', tin);
    return tin;
  } catch (loi) {
    try { await ketNoi.rollback(); } catch {}
    throw loi;
  } finally {
    ketNoi.release();
  }
}

async function kiemTraQuyenDoc(maPhongRaw, maNguoiDung) {
  const maPhong = kiemTraMa(maPhongRaw);
  const phong = await layQuyenPhong(pool, maPhong, maNguoiDung);
  return { maPhong, phong };
}

async function lietKeTinNhan(maNguoiDung, maPhongRaw, { truocMaTin, sauMaTin } = {}) {
  const { maPhong } = await kiemTraQuyenDoc(maPhongRaw, maNguoiDung);
  if (truocMaTin != null && sauMaTin != null) {
    throw AppError.duLieuKhongHopLe('Chỉ được truyền truocMaTin hoặc sauMaTin');
  }
  const dieuKien = ['MaPhong=?'];
  const thamSo = [maPhong];
  if (truocMaTin != null) {
    const cursor = kiemTraMa(truocMaTin, 'truocMaTin');
    dieuKien.push('MaTin < ?'); thamSo.push(cursor);
  } else if (sauMaTin != null) {
    const cursor = kiemTraMa(sauMaTin, 'sauMaTin');
    dieuKien.push('MaTin > ?'); thamSo.push(cursor);
  }
  const [cacTin] = await pool.query(
    `SELECT t.MaTin AS maTin, t.MaPhong AS maPhong, t.MaNguoiGui AS maNguoiGui,
      nd.HoTen AS tenNguoiGui, nd.AnhDaiDien AS anhDaiDien,
      t.NoiDung AS noiDung, t.NgayTao AS ngayTao
     FROM TinNhan t JOIN NguoiDung nd ON nd.MaNguoiDung=t.MaNguoiGui
     WHERE ${dieuKien.join(' AND ')}
     ORDER BY t.MaTin ${sauMaTin != null ? 'ASC' : 'DESC'} LIMIT 50`,
    thamSo);
  return { tinNhan: sauMaTin != null ? cacTin : cacTin.reverse(), gioiHan: 50 };
}

async function lietKeThanhVien(maNguoiDung, maPhongRaw) {
  const { maPhong, phong } = await kiemTraQuyenDoc(maPhongRaw, maNguoiDung);
  const [thanhVien] = await pool.query(
    `SELECT tv.MaNguoiDung AS maNguoiDung, nd.HoTen AS hoTen,
      nd.AnhDaiDien AS anhDaiDien, tv.VaiTro AS vaiTro,
      tv.TrangThai AS trangThai, tv.NgayVao AS ngayVao
     FROM ThanhVienPhong tv JOIN NguoiDung nd ON nd.MaNguoiDung=tv.MaNguoiDung
     WHERE tv.MaPhong=? AND tv.TrangThai='active'
     ORDER BY (tv.VaiTro='owner') DESC, tv.NgayVao ASC`,
    [maPhong]);
  return { maPhong, trangThaiPhong: phong.trangThaiPhong, thanhVien };
}

async function lietKePhongCuaToi(maNguoiDung) {
  const uid = kiemTraMa(maNguoiDung, 'Mã người dùng');
  const [phong] = await pool.query(
    `SELECT p.MaPhong AS maPhong, p.Loai AS loai,
       COALESCE(b.TieuDe, d.TenNhom, 'Cuộc trò chuyện') AS tieuDe,
       COALESCE(b.MaBai, d.MaDoi) AS maNoiDung,
       CASE WHEN p.Loai='player_post' THEN 'player_post' ELSE 'team' END AS loaiNoiDung,
       p.TrangThai AS trangThaiPhong,
       (SELECT t.NoiDung FROM TinNhan t WHERE t.MaPhong=p.MaPhong ORDER BY t.MaTin DESC LIMIT 1) AS tinNhanCuoi,
       (SELECT t.NgayTao FROM TinNhan t WHERE t.MaPhong=p.MaPhong ORDER BY t.MaTin DESC LIMIT 1) AS ngayTinCuoi,
       (SELECT COUNT(*) FROM ThanhVienPhong tv2 WHERE tv2.MaPhong=p.MaPhong AND tv2.TrangThai='active') AS soThanhVien
     FROM ThanhVienPhong tv
     JOIN PhongChat p ON p.MaPhong=tv.MaPhong
     LEFT JOIN BaiTimNguoi b ON b.MaPhong=p.MaPhong
     LEFT JOIN DoiNhom d ON d.MaPhong=p.MaPhong
     WHERE tv.MaNguoiDung=? AND tv.TrangThai='active'
       AND p.Loai IN ('player_post','team')
       AND ((p.Loai='player_post' AND b.MaBai IS NOT NULL AND b.TrangThai NOT IN ('removed','hidden'))
         OR (p.Loai='team' AND d.MaDoi IS NOT NULL AND d.TrangThai NOT IN ('removed','hidden')))
     ORDER BY COALESCE((SELECT MAX(t.NgayTao) FROM TinNhan t WHERE t.MaPhong=p.MaPhong), p.NgayTao) DESC`,
    [uid]);
  return { phongChat: phong };
}

module.exports = {
  guiTinNhan, lietKeTinNhan, lietKeThanhVien, lietKePhongCuaToi, kiemTraQuyenDoc,
  kiemTraMa, GIOI_HAN_TIN,
};
