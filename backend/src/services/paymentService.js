const fs = require('fs/promises');
const path = require('path');
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { taoAnhQrUrl } = require('../utils/vietqr');
const { thuMucTepTaiLen, layDuongDanTep } = require('../middlewares/upload');

// Luồng thanh toán (không dùng cổng thanh toán tự động):
//  1) khách đặt sân → ThanhToan 'pending', giữ chỗ hold_minutes
//  2) khách quét QR chuyển khoản, chụp màn hình, gửi ảnh → ThanhToan 'confirming' (đợi xác nhận),
//     thời hạn giữ chỗ được kéo dài confirm_minutes để chủ sân kịp xem
//  3) chủ sân HOẶC admin xác nhận → ThanhToan 'success' + đơn 'confirmed';
//     hoặc từ chối (kèm lý do) → quay về 'pending', khách gửi lại ảnh
//  4) hết hạn mà chủ sân chưa xác nhận → 'late_payment' (khách có thể đã chuyển tiền → admin xử lý hoàn)

const PHUT_CHO_XAC_NHAN_MAC_DINH = 60;
const PHUT_GIU_CHO_MAC_DINH = 10;

async function layCauHinhSo(ketNoi, khoa, macDinh) {
  const [[muc]] = await ketNoi.query('SELECT GiaTri AS giaTri FROM CauHinhHeThong WHERE KhoaCauHinh=?', [khoa]);
  const giaTri = Number(muc?.giaTri);
  return Number.isFinite(giaTri) && giaTri > 0 ? giaTri : macDinh;
}

// Điều kiện chọn mọi DatSan cùng một đợt thanh toán (lịch cố định có nhiều buổi dùng chung 1 thanh toán).
function dieuKienCungDot(thanhToan) {
  return thanhToan.maLichCoDinh
    ? { sql: 'MaLichCoDinh=?', thamSo: [thanhToan.maLichCoDinh] }
    : { sql: 'MaDatSan=?', thamSo: [thanhToan.maDatSan] };
}

async function layThanhToanCuaKhach(maNguoiDung, maDatSan, ketNoi = pool, khoa = false) {
  const [[thanhToan]] = await ketNoi.query(
    `SELECT t.MaThanhToan AS maThanhToan,
       t.SoTien AS soTien, t.TrangThai AS trangThai, t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh,
       d.MaKhachHang AS maKhachHang, d.TrangThai AS trangThaiDatSan,
       d.HetHanGiuCho AS hetHanGiuCho
     FROM DatSan d JOIN ThanhToan t ON t.MaDatSan=CASE
       WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
       ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
     END
     WHERE d.MaDatSan=? AND d.MaKhachHang=? ${khoa ? 'FOR UPDATE' : ''}`,
    [maDatSan, maNguoiDung]);
  if (!thanhToan) throw AppError.khongTimThay('Không tìm thấy thanh toán');
  return thanhToan;
}

// Chốt đơn đã quá hạn giữ chỗ (gọi trong giao dịch). Đã gửi ảnh (confirming) → late_payment để admin
// xử lý hoàn tiền nếu khách thật sự đã chuyển; chưa gửi ảnh (pending) → expired.
async function chotHetHan(ketNoi, thanhToan) {
  const cungDot = dieuKienCungDot(thanhToan);
  await ketNoi.query(
    `UPDATE DatSan SET TrangThai='expired' WHERE ${cungDot.sql} AND TrangThai='pending_payment'`,
    cungDot.thamSo);
  if (thanhToan.maLichCoDinh) {
    await ketNoi.query(
      "UPDATE LichCoDinh SET TrangThai='ended' WHERE MaLichCoDinh=?", [thanhToan.maLichCoDinh]);
  }
  if (thanhToan.trangThai === 'confirming') {
    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThai='late_payment', TrangThaiHoanTien='waiting_info',
         SoTienHoan=SoTien, LyDoLoi='Het han giu cho khi chu san chua xac nhan'
       WHERE MaThanhToan=? AND TrangThai='confirming'`,
      [thanhToan.maThanhToan]);
  } else {
    await ketNoi.query(
      "UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan=? AND TrangThai='pending'",
      [thanhToan.maThanhToan]);
  }
}

// Kiểm tra đơn còn chờ thanh toán và còn hạn. Hết hạn thì chốt rồi trả cờ (ném lỗi SAU khi commit).
async function kiemTraConHan(ketNoi, thanhToan) {
  if (thanhToan.trangThai === 'success') {
    throw AppError.biTrung('Đơn đã được xác nhận thanh toán');
  }
  if (!['pending', 'confirming'].includes(thanhToan.trangThai)
    || thanhToan.trangThaiDatSan !== 'pending_payment') {
    throw AppError.biTrung('Đơn không còn trong thời hạn chờ thanh toán');
  }
  const [[hanGiu]] = await ketNoi.query('SELECT ? > NOW() AS conHan', [thanhToan.hetHanGiuCho]);
  if (!hanGiu.conHan) {
    await chotHetHan(ketNoi, thanhToan);
    return false;
  }
  return true;
}

async function layQr(maNguoiDung, maDatSan) {
  const thanhToan = await layThanhToanCuaKhach(maNguoiDung, maDatSan);
  if (!['pending', 'confirming'].includes(thanhToan.trangThai)
    || thanhToan.trangThaiDatSan !== 'pending_payment') {
    throw AppError.biTrung('Đơn không còn trong thời hạn chờ thanh toán');
  }
  const [[hanGiu]] = await pool.query('SELECT ? > NOW() AS conHan', [thanhToan.hetHanGiuCho]);
  if (!hanGiu.conHan) {
    await thucHienGiaoDich((ketNoi) => chotHetHan(ketNoi, thanhToan));
    throw AppError.biTrung('Thời gian giữ chỗ đã hết hạn');
  }
  return {
    maThanhToan: thanhToan.maThanhToan,
    soTien: Number(thanhToan.soTien),
    noiDungChuyenKhoan: thanhToan.noiDungChuyenKhoan,
    trangThai: thanhToan.trangThai,
    anhQrUrl: taoAnhQrUrl(thanhToan.noiDungChuyenKhoan, Number(thanhToan.soTien)),
  };
}

// Chữ ký đầu file: chặn file không phải ảnh dù đổi đuôi/mime.
async function laAnhThat(duongDanTep) {
  const tep = await fs.open(duongDanTep, 'r');
  try {
    const dem = Buffer.alloc(12);
    await tep.read(dem, 0, 12, 0);
    const laJpeg = dem[0] === 0xff && dem[1] === 0xd8 && dem[2] === 0xff;
    const laPng = dem.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const laWebp = dem.subarray(0, 4).toString('ascii') === 'RIFF' && dem.subarray(8, 12).toString('ascii') === 'WEBP';
    return laJpeg || laPng || laWebp;
  } finally {
    await tep.close();
  }
}

async function xoaTepNeuCo(duongDanTuongDoi) {
  if (!duongDanTuongDoi) return;
  const ten = path.basename(duongDanTuongDoi);
  await fs.unlink(path.join(thuMucTepTaiLen, ten)).catch(() => {});
}

// Khách gửi ảnh chuyển khoản. Mã đơn, tên, SĐT, số tiền đã nằm sẵn trong đơn nên chủ sân xem được
// cùng ảnh; không nhận từ client để khỏi bị sửa.
async function guiAnhChuyenKhoan(maNguoiDung, maDatSan, tep) {
  if (!tep) {
    throw AppError.duLieuKhongHopLe('Vui lòng tải ảnh chuyển khoản.', [
      { truong: 'anhChuyenKhoan', thongBao: 'Vui lòng tải ảnh chuyển khoản.' }]);
  }
  try {
    if (!await laAnhThat(tep.path)) {
      throw AppError.duLieuKhongHopLe('Chỉ nhận ảnh JPG, PNG, WEBP.', [
        { truong: 'anhChuyenKhoan', thongBao: 'Chỉ nhận ảnh JPG, PNG, WEBP.' }]);
    }
    const duongDanMoi = layDuongDanTep(tep);
    const ketQua = await thucHienGiaoDich(async (ketNoi) => {
      const thanhToan = await layThanhToanCuaKhach(maNguoiDung, maDatSan, ketNoi, true);
      if (!await kiemTraConHan(ketNoi, thanhToan)) return { hetHan: true };
      const [[cu]] = await ketNoi.query(
        'SELECT AnhChuyenKhoan AS anh FROM ThanhToan WHERE MaThanhToan=?', [thanhToan.maThanhToan]);
      await ketNoi.query(
        `UPDATE ThanhToan SET TrangThai='confirming', AnhChuyenKhoan=?, NgayGuiAnh=NOW(),
           LyDoLoi=NULL, MaNguoiXacNhan=NULL, VaiTroXacNhan=NULL
         WHERE MaThanhToan=?`,
        [duongDanMoi, thanhToan.maThanhToan]);
      // Kéo dài giữ chỗ để chủ sân kịp xác nhận.
      const phut = await layCauHinhSo(ketNoi, 'confirm_minutes', PHUT_CHO_XAC_NHAN_MAC_DINH);
      const cungDot = dieuKienCungDot(thanhToan);
      await ketNoi.query(
        `UPDATE DatSan SET HetHanGiuCho=DATE_ADD(NOW(), INTERVAL ? MINUTE)
         WHERE ${cungDot.sql} AND TrangThai='pending_payment'`,
        [phut, ...cungDot.thamSo]);
      return { maThanhToan: thanhToan.maThanhToan, anhCu: cu?.anh || null, phut };
    });
    if (ketQua.hetHan) throw AppError.biTrung('Thời gian giữ chỗ đã hết hạn');
    if (ketQua.anhCu) await xoaTepNeuCo(ketQua.anhCu);
    return {
      maThanhToan: ketQua.maThanhToan,
      trangThaiThanhToan: 'confirming',
      anhChuyenKhoanUrl: duongDanMoi,
      thongBao: 'Đã gửi ảnh chuyển khoản. Vui lòng chờ chủ sân xác nhận.',
    };
  } catch (loi) {
    await fs.unlink(tep.path).catch(() => {}); // không giữ file mồ côi khi gửi thất bại
    throw loi;
  }
}

// Đơn (+ thanh toán) cần duyệt, khoá để đổi trạng thái. Chủ sân chỉ duyệt đơn thuộc cơ sở của mình;
// admin duyệt được mọi đơn.
async function layThanhToanDeDuyet(ketNoi, maNguoiDung, vaiTro, maDatSan) {
  const laAdmin = vaiTro === 'admin';
  const [[thanhToan]] = await ketNoi.query(
    `SELECT t.MaThanhToan AS maThanhToan, t.MaDatSan AS maDatSanThanhToan, t.TrangThai AS trangThai,
       t.AnhChuyenKhoan AS anhChuyenKhoan,
       d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh, d.TrangThai AS trangThaiDatSan
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
     WHERE d.MaDatSan=? AND d.Nguon='app' ${laAdmin ? '' : 'AND cs.MaChuSan=?'}
     FOR UPDATE OF d, t`,
    laAdmin ? [maDatSan] : [maDatSan, maNguoiDung]);
  if (!thanhToan) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
  if (thanhToan.trangThai !== 'confirming') {
    const thongBao = {
      success: 'Đơn đã được xác nhận trước đó',
      pending: 'Khách chưa gửi ảnh chuyển khoản',
    }[thanhToan.trangThai] || 'Đơn không còn ở trạng thái chờ xác nhận';
    throw AppError.biTrung(thongBao);
  }
  const cungDot = dieuKienCungDot({
    maLichCoDinh: thanhToan.maLichCoDinh, maDatSan: thanhToan.maDatSan });
  const [cacDon] = await ketNoi.query(
    `SELECT TrangThai AS trangThai FROM DatSan WHERE ${cungDot.sql} FOR UPDATE`, cungDot.thamSo);
  if (!cacDon.length || cacDon.some((don) => don.trangThai !== 'pending_payment')) {
    throw AppError.biTrung('Đơn đã hết hạn giữ chỗ hoặc đã bị huỷ');
  }
  return { ...thanhToan, cungDot };
}

async function ghiNhatKyAdmin(ketNoi, vaiTro, maNguoiDung, hanhDong, maThanhToan, chiTiet) {
  if (vaiTro !== 'admin') return;
  await ketNoi.query(
    `INSERT INTO NhatKyHeThong (MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet)
     VALUES (?,?,?,?,?)`,
    [maNguoiDung, hanhDong, 'ThanhToan', maThanhToan, chiTiet || null]);
}

// Chủ sân/admin xác nhận đã nhận đủ tiền → đơn thành công, khách giữ được sân.
async function xacNhanThanhToan(maNguoiDung, maDatSan, vaiTro = 'owner') {
  return thucHienGiaoDich(async (ketNoi) => {
    const thanhToan = await layThanhToanDeDuyet(ketNoi, maNguoiDung, vaiTro, maDatSan);
    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThai='success', NgayThanhToan=NOW(), LyDoLoi=NULL,
         MaNguoiXacNhan=?, VaiTroXacNhan=?
       WHERE MaThanhToan=?`,
      [maNguoiDung, vaiTro, thanhToan.maThanhToan]);
    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='confirmed', HetHanGiuCho=NULL
       WHERE ${thanhToan.cungDot.sql} AND TrangThai='pending_payment'`,
      thanhToan.cungDot.thamSo);
    await ghiNhatKyAdmin(ketNoi, vaiTro, maNguoiDung, 'xac_nhan_thanh_toan', thanhToan.maThanhToan);
    return {
      maDatSan: Number(maDatSan),
      maThanhToan: thanhToan.maThanhToan,
      trangThaiThanhToan: 'success',
      trangThaiDatSan: 'confirmed',
      nguoiXacNhan: vaiTro,
    };
  });
}

// Không thấy tiền / ảnh sai → từ chối kèm lý do; khách gửi lại ảnh trong thời gian giữ chỗ mới.
async function tuChoiThanhToan(maNguoiDung, maDatSan, lyDo, vaiTro = 'owner') {
  return thucHienGiaoDich(async (ketNoi) => {
    const thanhToan = await layThanhToanDeDuyet(ketNoi, maNguoiDung, vaiTro, maDatSan);
    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThai='pending', LyDoLoi=?, AnhChuyenKhoan=NULL, NgayGuiAnh=NULL,
         MaNguoiXacNhan=NULL, VaiTroXacNhan=NULL
       WHERE MaThanhToan=?`,
      [lyDo, thanhToan.maThanhToan]);
    const phut = await layCauHinhSo(ketNoi, 'hold_minutes', PHUT_GIU_CHO_MAC_DINH);
    await ketNoi.query(
      `UPDATE DatSan SET HetHanGiuCho=DATE_ADD(NOW(), INTERVAL ? MINUTE)
       WHERE ${thanhToan.cungDot.sql} AND TrangThai='pending_payment'`,
      [phut, ...thanhToan.cungDot.thamSo]);
    await ghiNhatKyAdmin(ketNoi, vaiTro, maNguoiDung, 'tu_choi_thanh_toan', thanhToan.maThanhToan, lyDo);
    return {
      maDatSan: Number(maDatSan),
      maThanhToan: thanhToan.maThanhToan,
      trangThaiThanhToan: 'pending',
      lyDo,
    };
  });
}

module.exports = {
  layQr,
  guiAnhChuyenKhoan,
  xacNhanThanhToan,
  tuChoiThanhToan,
};
