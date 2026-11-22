// Chứng từ thanh toán (G2): mỗi lần khách gửi ảnh chuyển khoản = 1 dòng ChungTuThanhToan, KHÔNG xoá ảnh cũ.
// Dùng chung cho paymentService (khách gửi / chủ sân-Admin duyệt), ownerBookingService và adminService (xem).
// ketNoi: pool hoặc connection trong giao dịch.
const crypto = require('crypto');
const fs = require('fs/promises');
const AppError = require('../utils/AppError');
const { layCauHinhSo } = require('./cauHinhService');

// Chặn gửi ảnh vô hạn làm đầy ổ đĩa: tối đa số ảnh trên 1 thanh toán (kể cả ảnh đã bị từ chối).
const TOI_DA_CHUNG_TU_MOI_DON = 5;
const PHUT_XAC_NHAN_MAC_DINH = 30;
const PHUT_XAC_NHAN_GAP_MAC_DINH = 15;
const NGUONG_GAP_MAC_DINH = 60;

// SHA-256 nội dung ảnh (ảnh ≤ 5MB nên đọc cả file là đủ).
async function bamTep(duongDanTep) {
  const noiDung = await fs.readFile(duongDanTep);
  return crypto.createHash('sha256').update(noiDung).digest('hex');
}

// Giờ chuyển khoản khách nhập (tuỳ chọn). Nhận ISO 8601 (có Z/±hh:mm) hoặc "YYYY-MM-DD HH:mm[:ss]" (hiểu là giờ VN +07:00).
// Trả Date | null. Sai định dạng → 400. Việc "≤ giờ máy chủ" kiểm bằng NOW() của DB trong giao dịch (xem kiemTraThoiDiemChuyen).
function docThoiDiemChuyen(giaTriTho) {
  if (giaTriTho === undefined || giaTriTho === null) return null;
  const chuoi = String(giaTriTho).trim();
  if (!chuoi) return null;
  const loi = () => AppError.duLieuKhongHopLe('Giờ chuyển khoản không hợp lệ.', [
    { truong: 'thoiDiemChuyen', thongBao: 'Giờ chuyển khoản không hợp lệ.' }]);
  const khop = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(chuoi);
  if (!khop) throw loi();
  const [, nam, thang, ngay, gio, phut, giay = '00', muiGio] = khop;
  const so = [nam, thang, ngay, gio, phut, giay].map(Number);
  const kiemTra = new Date(Date.UTC(so[0], so[1] - 1, so[2], so[3], so[4], so[5]));
  // Date.UTC tự cuộn ngày sai (31/02 → 03/03): so lại từng thành phần để bắt ngày không có thật.
  if (kiemTra.getUTCFullYear() !== so[0] || kiemTra.getUTCMonth() !== so[1] - 1 || kiemTra.getUTCDate() !== so[2]
    || kiemTra.getUTCHours() !== so[3] || kiemTra.getUTCMinutes() !== so[4]) throw loi();
  let hauTo = muiGio || '+07:00';
  if (/^[+-]\d{4}$/.test(hauTo)) hauTo = `${hauTo.slice(0, 3)}:${hauTo.slice(3)}`;
  const thoiDiem = new Date(`${nam}-${thang}-${ngay}T${gio}:${phut}:${giay}${hauTo}`);
  if (Number.isNaN(thoiDiem.getTime())) throw loi();
  return thoiDiem;
}

// Giờ chuyển khoản không được ở tương lai (so với giờ máy chủ DB, cho lệch 1 phút).
async function kiemTraThoiDiemChuyen(ketNoi, thoiDiemChuyen) {
  if (!thoiDiemChuyen) return;
  const [[kq]] = await ketNoi.query('SELECT ? <= DATE_ADD(NOW(), INTERVAL 1 MINUTE) AS hopLe', [thoiDiemChuyen]);
  if (!Number(kq.hopLe)) {
    throw AppError.duLieuKhongHopLe('Giờ chuyển khoản không được ở tương lai.', [
      { truong: 'thoiDiemChuyen', thongBao: 'Giờ chuyển khoản không được ở tương lai.' }]);
  }
}

// Số phút chủ sân/Admin có để xác nhận: confirm_minutes (30); đặt gấp (buổi sớm nhất còn < urgent_threshold_minutes
// đến giờ chơi) thì confirm_urgent_minutes (15). `cungDot` = { sql, thamSo } như paymentService.dieuKienCungDot.
async function tinhPhutXacNhan(ketNoi, cungDot) {
  const [[dong]] = await ketNoi.query(
    `SELECT MIN(TIMESTAMPDIFF(MINUTE, NOW(), TIMESTAMP(NgayChoi, GioBatDau))) AS conPhut
     FROM DatSan WHERE ${cungDot.sql} AND TrangThai='pending_payment'`,
    cungDot.thamSo);
  const nguong = await layCauHinhSo(ketNoi, 'urgent_threshold_minutes', NGUONG_GAP_MAC_DINH);
  const gap = dong && dong.conPhut !== null && dong.conPhut !== undefined && Number(dong.conPhut) < nguong;
  return gap
    ? { phut: await layCauHinhSo(ketNoi, 'confirm_urgent_minutes', PHUT_XAC_NHAN_GAP_MAC_DINH), gap: true }
    : { phut: await layCauHinhSo(ketNoi, 'confirm_minutes', PHUT_XAC_NHAN_MAC_DINH), gap: false };
}

async function demChungTu(ketNoi, maThanhToan) {
  const [[kq]] = await ketNoi.query(
    'SELECT COUNT(*) AS so FROM ChungTuThanhToan WHERE MaThanhToan=?', [maThanhToan]);
  return Number(kq.so);
}

async function themChungTu(ketNoi, { maThanhToan, soTien, thoiDiemChuyen, anh, maBamAnh, loai = 'main' }) {
  const [kq] = await ketNoi.query(
    `INSERT INTO ChungTuThanhToan (MaThanhToan, Loai, SoTien, ThoiDiemChuyen, Anh, MaBamAnh)
     VALUES (?,?,?,?,?,?)`,
    [maThanhToan, loai, soTien, thoiDiemChuyen, anh, maBamAnh]);
  return kq.insertId;
}

// Chủ sân/Admin duyệt hoặc từ chối: mọi chứng từ đang chờ của thanh toán chuyển cùng kết quả (+ ai, lúc nào, lý do).
async function chotKetQuaChungTu(ketNoi, maThanhToan, ketQua, { maNguoiDuyet, vaiTro, lyDo = null }) {
  await ketNoi.query(
    `UPDATE ChungTuThanhToan SET KetQua=?, MaNguoiDuyet=?, VaiTroDuyet=?, NgayDuyet=NOW(), LyDo=?
     WHERE MaThanhToan=? AND KetQua='pending'`,
    [ketQua, maNguoiDuyet, vaiTro, lyDo, maThanhToan]);
}

// Mọi chứng từ trùng hash với chứng từ của ĐƠN KHÁC (không tính các dòng của chính thanh toán này).
// Chỉ phục vụ cảnh báo cho chủ sân/Admin: KHÔNG dùng để từ chối (hash không phải bằng chứng duy nhất).
async function timChungTuTrungHash(ketNoi, maThanhToan, cacMaBam) {
  if (!cacMaBam.length) return [];
  const [cacDong] = await ketNoi.query(
    `SELECT c.MaBamAnh AS maBamAnh, c.NgayGui AS ngayGui, d.MaDatSan AS maDatSan, d.MaDon AS maDon,
       cs.MaChuSan AS maChuSan
     FROM ChungTuThanhToan c JOIN ThanhToan t ON t.MaThanhToan=c.MaThanhToan
       JOIN DatSan d ON d.MaDatSan=t.MaDatSan JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE c.MaBamAnh IN (${cacMaBam.map(() => '?').join(',')}) AND c.MaThanhToan<>?
     ORDER BY c.NgayGui DESC`,
    [...cacMaBam, maThanhToan]);
  return cacDong;
}

// Danh sách chứng từ của 1 thanh toán, mới nhất trước.
//   goc 'khach' : chỉ thông tin của chính khách (KHÔNG có cảnh báo trùng ảnh — không lộ cho khách).
//   goc 'owner' : + canhBaoTrungAnh; đơn của chủ sân KHÁC chỉ báo "ở cơ sở khác", không lộ mã đơn.
//   goc 'admin' : + canhBaoTrungAnh đầy đủ.
async function layChungTu(ketNoi, maThanhToan, { goc = 'khach', maChuSan = null } = {}) {
  const [cacDong] = await ketNoi.query(
    `SELECT MaChungTu AS maChungTu, Loai AS loai, SoTien AS soTien, ThoiDiemChuyen AS thoiDiemChuyen,
       NgayGui AS ngayGui, Anh AS anhUrl, MaBamAnh AS maBamAnh, KetQua AS ketQua, VaiTroDuyet AS vaiTroDuyet,
       NgayDuyet AS ngayDuyet, LyDo AS lyDo
     FROM ChungTuThanhToan WHERE MaThanhToan=? ORDER BY NgayGui DESC, MaChungTu DESC`,
    [maThanhToan]);
  if (goc === 'khach') {
    return cacDong.map(({ maBamAnh, vaiTroDuyet, ...conLai }) => conLai);
  }
  const trung = await timChungTuTrungHash(ketNoi, maThanhToan, [...new Set(cacDong.map((d) => d.maBamAnh))]);
  return cacDong.map(({ maBamAnh, ...conLai }) => ({
    ...conLai,
    canhBaoTrungAnh: trung.filter((t) => t.maBamAnh === maBamAnh).map((t) => {
      const duocXem = goc === 'admin' || Number(t.maChuSan) === Number(maChuSan);
      return {
        cungChuSan: Number(t.maChuSan) === Number(maChuSan),
        maDatSan: duocXem ? t.maDatSan : null,
        maDon: duocXem ? t.maDon : null,
        ngayGui: t.ngayGui,
      };
    }),
  }));
}

// Mảng phẳng "ảnh đã dùng ở đơn …" của cả thanh toán (gom từ từng chứng từ, bỏ trùng) để FE hiện 1 khung cảnh báo.
function gomCanhBaoTrungAnh(cacChungTu) {
  const daCo = new Set();
  const ketQua = [];
  for (const chungTu of cacChungTu) {
    for (const canhBao of chungTu.canhBaoTrungAnh || []) {
      const khoa = `${canhBao.maDatSan ?? 'khac'}|${canhBao.ngayGui}`;
      if (daCo.has(khoa)) continue;
      daCo.add(khoa);
      ketQua.push({ maChungTu: chungTu.maChungTu, ...canhBao });
    }
  }
  return ketQua;
}

// Đoạn SQL (cột t = ThanhToan) cho danh sách: có chứng từ nào trùng hash với đơn khác không.
const SQL_CO_CANH_BAO_TRUNG = `EXISTS (
  SELECT 1 FROM ChungTuThanhToan c1 JOIN ChungTuThanhToan c2
    ON c2.MaBamAnh=c1.MaBamAnh AND c2.MaThanhToan<>c1.MaThanhToan
  WHERE c1.MaThanhToan=t.MaThanhToan)`;

module.exports = {
  TOI_DA_CHUNG_TU_MOI_DON,
  bamTep,
  docThoiDiemChuyen,
  kiemTraThoiDiemChuyen,
  tinhPhutXacNhan,
  demChungTu,
  themChungTu,
  chotKetQuaChungTu,
  layChungTu,
  gomCanhBaoTrungAnh,
  SQL_CO_CANH_BAO_TRUNG,
};
