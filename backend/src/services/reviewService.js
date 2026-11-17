const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { guiThongBao, rutGonVanBan } = require('./notificationService');

// Đánh giá cơ sở: phần của CHỦ SÂN (xem, phản hồi) và ADMIN (xem, ẩn/hiện), cùng hàm tính lại điểm dùng chung.
// Phần KHÁCH (gửi, sửa, xoá) nằm ở customerService.

const SO_DONG_MAC_DINH = 20;

// Tính lại CoSo.DiemTrungBinh và CoSo.SoDanhGia (chỉ tính BiAn=0). PHẢI gọi trong giao dịch, sau khi đã
// khoá dòng cơ sở bằng FOR UPDATE để hai thay đổi cùng lúc không tính điểm chồng nhau.
async function tinhLaiDiemCoSo(ketNoi, maCoSo) {
  await ketNoi.query(
    `UPDATE CoSo SET
       DiemTrungBinh=COALESCE((SELECT ROUND(AVG(SoSao),1) FROM DanhGia WHERE MaCoSo=? AND BiAn=0), 0),
       SoDanhGia=(SELECT COUNT(*) FROM DanhGia WHERE MaCoSo=? AND BiAn=0)
     WHERE MaCoSo=?`,
    [maCoSo, maCoSo, maCoSo]);
  const [[coSo]] = await ketNoi.query(
    'SELECT DiemTrungBinh AS diemTrungBinh, SoDanhGia AS soDanhGia FROM CoSo WHERE MaCoSo=?', [maCoSo]);
  return { diemTrungBinh: Number(coSo.diemTrungBinh), soDanhGia: Number(coSo.soDanhGia) };
}

const COT_DANH_GIA = `
  dg.MaDanhGia AS maDanhGia, dg.MaDatSan AS maDatSan, d.MaDon AS maDon,
  cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, kh.HoTen AS tenKhach,
  dg.SoSao AS soSao, dg.NoiDung AS noiDung, dg.NgayTao AS ngayTao,
  dg.PhanHoiChuSan AS phanHoiChuSan, dg.NgayPhanHoi AS ngayPhanHoi, dg.BiAn AS biAn`;
const TU_BANG = `
  FROM DanhGia dg
  JOIN DatSan d ON d.MaDatSan=dg.MaDatSan
  JOIN CoSo cs ON cs.MaCoSo=dg.MaCoSo
  JOIN NguoiDung kh ON kh.MaNguoiDung=dg.MaKhachHang`;

const chuyenBoolean = (muc) => ({ ...muc, biAn: !!Number(muc.biAn) });

// Điều kiện lọc dùng chung (chuỗi cố định, giá trị luôn đi qua placeholder ?).
function dungBoLoc({ maCoSo, soSao }, dieuKien, thamSo) {
  if (maCoSo) { dieuKien.push('dg.MaCoSo=?'); thamSo.push(maCoSo); }
  if (soSao) { dieuKien.push('dg.SoSao=?'); thamSo.push(soSao); }
}

// ---------------- Chủ sân ----------------
// Đánh giá thuộc các cơ sở của chủ sân (kể cả đánh giá đã bị ẩn, có cờ biAn), mới nhất trước.
async function lietKeDanhGiaChuSan(maChuSan, boLoc = {}) {
  const dieuKien = ['cs.MaChuSan=?'];
  const thamSo = [maChuSan];
  dungBoLoc(boLoc, dieuKien, thamSo);
  if (boLoc.chuaPhanHoi === true) dieuKien.push('dg.PhanHoiChuSan IS NULL');
  if (boLoc.chuaPhanHoi === false) dieuKien.push('dg.PhanHoiChuSan IS NOT NULL');
  const loc = dieuKien.join(' AND ');
  const trang = boLoc.trang || 1;
  const soDong = boLoc.soLuong || SO_DONG_MAC_DINH;

  const [[{ tong }]] = await pool.query(`SELECT COUNT(*) AS tong ${TU_BANG} WHERE ${loc}`, thamSo);
  const [cacDanhGia] = await pool.query(
    `SELECT ${COT_DANH_GIA} ${TU_BANG} WHERE ${loc}
     ORDER BY dg.NgayTao DESC, dg.MaDanhGia DESC LIMIT ? OFFSET ?`,
    [...thamSo, soDong, (trang - 1) * soDong]);
  return { cacDanhGia: cacDanhGia.map(chuyenBoolean), tong: Number(tong), trang, soDongMoiTrang: soDong };
}

// Chủ sân phản hồi (hoặc sửa phản hồi) đánh giá của cơ sở mình. Ghi đè phản hồi cũ; không giới hạn thời gian sửa.
async function phanHoiDanhGia(maChuSan, maDanhGia, noiDung) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[danhGia]] = await ketNoi.query(
      `SELECT dg.MaDanhGia AS maDanhGia, dg.MaKhachHang AS maKhachHang, dg.MaCoSo AS maCoSo,
         dg.BiAn AS biAn, dg.PhanHoiChuSan AS phanHoiCu, cs.MaChuSan AS maChuSan, cs.TenCoSo AS tenCoSo
       FROM DanhGia dg JOIN CoSo cs ON cs.MaCoSo=dg.MaCoSo
       WHERE dg.MaDanhGia=? FOR UPDATE`, [maDanhGia]);
    if (!danhGia) throw AppError.khongTimThay('Không tìm thấy đánh giá');
    if (Number(danhGia.maChuSan) !== Number(maChuSan)) {
      throw AppError.khongDuQuyen('Bạn không có quyền phản hồi đánh giá của cơ sở khác');
    }
    if (Number(danhGia.biAn)) {
      throw AppError.biTrung('Đánh giá đã bị ẩn nên không thể phản hồi.', 'REVIEW_HIDDEN');
    }
    const laSua = danhGia.phanHoiCu != null;
    const khongDoi = laSua && danhGia.phanHoiCu === noiDung;
    await ketNoi.query(
      'UPDATE DanhGia SET PhanHoiChuSan=?, NgayPhanHoi=NOW() WHERE MaDanhGia=?', [noiDung, maDanhGia]);
    const [[moi]] = await ketNoi.query(
      'SELECT NgayPhanHoi AS ngayPhanHoi FROM DanhGia WHERE MaDanhGia=?', [maDanhGia]);

    // Báo khách. Lần đầu có khoá chống trùng; các lần sửa sau để NULL (mỗi lần sửa nội dung báo 1 lần).
    // Nội dung không đổi thì không báo lại.
    if (!khongDoi) {
      await guiThongBao(ketNoi, {
        maNguoiDung: danhGia.maKhachHang,
        loai: 'review_replied',
        tieuDe: 'Chủ sân đã phản hồi đánh giá của bạn',
        noiDung: `${danhGia.tenCoSo}: "${rutGonVanBan(noiDung, 120)}"`,
        loaiThamChieu: 'venue',
        maThamChieu: danhGia.maCoSo,
        khoa: laSua ? null : `review_replied:${maDanhGia}:1`,
      });
    }
    return { maDanhGia: Number(maDanhGia), phanHoiChuSan: noiDung, ngayPhanHoi: moi.ngayPhanHoi };
  });
}

// ---------------- Admin ----------------
async function lietKeDanhGiaQuanTri(boLoc = {}) {
  const dieuKien = ['1=1'];
  const thamSo = [];
  dungBoLoc(boLoc, dieuKien, thamSo);
  if (boLoc.trangThai === 'hien') dieuKien.push('dg.BiAn=0');
  if (boLoc.trangThai === 'an') dieuKien.push('dg.BiAn=1');
  const loc = dieuKien.join(' AND ');
  const trang = boLoc.trang || 1;
  const soDong = boLoc.soLuong || SO_DONG_MAC_DINH;

  const tuBang = `${TU_BANG} JOIN NguoiDung cu ON cu.MaNguoiDung=cs.MaChuSan`;
  const [[{ tong }]] = await pool.query(`SELECT COUNT(*) AS tong ${tuBang} WHERE ${loc}`, thamSo);
  const [cacDanhGia] = await pool.query(
    `SELECT ${COT_DANH_GIA}, dg.MaKhachHang AS maKhach, cu.MaNguoiDung AS maChuSan, cu.HoTen AS tenChuSan
     ${tuBang} WHERE ${loc}
     ORDER BY dg.NgayTao DESC, dg.MaDanhGia DESC LIMIT ? OFFSET ?`,
    [...thamSo, soDong, (trang - 1) * soDong]);
  return { cacDanhGia: cacDanhGia.map(chuyenBoolean), tong: Number(tong), trang, soDongMoiTrang: soDong };
}

// Admin ẩn / hiện lại một đánh giá. Một giao dịch: đổi BiAn + tính lại điểm cơ sở + nhật ký + thông báo.
async function anHienDanhGia(maQuanTri, maDanhGia, { an, lyDo }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[danhGia]] = await ketNoi.query(
      `SELECT dg.MaDanhGia AS maDanhGia, dg.MaKhachHang AS maKhachHang, dg.MaCoSo AS maCoSo,
         dg.BiAn AS biAn, cs.MaChuSan AS maChuSan, cs.TenCoSo AS tenCoSo
       FROM DanhGia dg JOIN CoSo cs ON cs.MaCoSo=dg.MaCoSo
       WHERE dg.MaDanhGia=? FOR UPDATE`, [maDanhGia]);
    if (!danhGia) throw AppError.khongTimThay('Không tìm thấy đánh giá');
    if (!!Number(danhGia.biAn) === !!an) {
      throw AppError.biTrung(
        an ? 'Đánh giá này đã bị ẩn rồi.' : 'Đánh giá này đang hiển thị.', 'REVIEW_STATE_UNCHANGED');
    }
    // Khoá dòng cơ sở trước khi tính lại điểm.
    await ketNoi.query('SELECT MaCoSo FROM CoSo WHERE MaCoSo=? FOR UPDATE', [danhGia.maCoSo]);
    await ketNoi.query('UPDATE DanhGia SET BiAn=? WHERE MaDanhGia=?', [an ? 1 : 0, maDanhGia]);
    const diem = await tinhLaiDiemCoSo(ketNoi, danhGia.maCoSo);
    await ketNoi.query(
      `INSERT INTO NhatKyHeThong (MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet)
       VALUES (?,?,?,?,?)`,
      [maQuanTri, an ? 'an_danh_gia' : 'hien_danh_gia', 'DanhGia', maDanhGia, an ? lyDo : (lyDo || null)]);

    if (an) {
      await guiThongBao(ketNoi, {
        maNguoiDung: danhGia.maKhachHang,
        loai: 'review_hidden',
        tieuDe: 'Đánh giá của bạn đã bị ẩn',
        noiDung: `Đánh giá của bạn về ${danhGia.tenCoSo} đã bị quản trị viên ẩn. Lý do: ${lyDo}`,
        loaiThamChieu: 'venue',
        maThamChieu: danhGia.maCoSo,
      });
      await guiThongBao(ketNoi, {
        maNguoiDung: danhGia.maChuSan,
        loai: 'review_hidden',
        tieuDe: 'Một đánh giá về cơ sở của bạn đã bị ẩn',
        noiDung: `Quản trị viên đã ẩn một đánh giá về ${danhGia.tenCoSo}. Lý do: ${lyDo}`,
        loaiThamChieu: 'venue',
        maThamChieu: danhGia.maCoSo,
      });
    } else {
      await guiThongBao(ketNoi, {
        maNguoiDung: danhGia.maKhachHang,
        loai: 'system',
        tieuDe: 'Đánh giá của bạn đã được hiển thị lại',
        noiDung: `Đánh giá của bạn về ${danhGia.tenCoSo} đã được quản trị viên hiển thị lại.`,
        loaiThamChieu: 'venue',
        maThamChieu: danhGia.maCoSo,
      });
    }
    return { maDanhGia: Number(maDanhGia), biAn: !!an, maCoSo: danhGia.maCoSo, ...diem };
  });
}

module.exports = {
  tinhLaiDiemCoSo, lietKeDanhGiaChuSan, phanHoiDanhGia, lietKeDanhGiaQuanTri, anHienDanhGia,
};
