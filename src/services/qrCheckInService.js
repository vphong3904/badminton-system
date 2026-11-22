// QR check-in tại sân (G3, NGHIEP_VU 12.4 / Tình huống 21). QR check-in ≠ QR thanh toán.
// Luồng: chủ sân xem/đổi/in QR của từng sân → khách mở đơn, quét QR tại sân → backend kiểm (utils/kiemTraCheckIn.js,
// giờ lấy từ NOW() của MySQL) → ghi CheckIn + đơn 'checked_in'. QR lỗi/mất mạng → chủ sân check-in thủ công.
const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { layCauHinhSo } = require('./cauHinhService');
const nhatKy = require('./nhatKyService');
const chungTu = require('./chungTuService');
const { ganTrangThaiHienThi } = require('../utils/trangThaiDon');
const { kiemTraCheckInQr, kiemTraCheckInThuCong } = require('../utils/kiemTraCheckIn');

const TIEN_TO_QR = 'bc1';
const PHUT_MO_SOM_MAC_DINH = 30;

// Nội dung mã QR: bc1:<maSan>:<phienBan>:<token>  (app tách theo dấu ':').
const taoNoiDungQr = (san) => `${TIEN_TO_QR}:${san.maSan}:${san.qrPhienBan}:${san.qrToken}`;

async function laySanCuaChu(ketNoi, maChuSan, maSan, khoa = false) {
  const [[san]] = await ketNoi.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan, s.TrangThai AS trangThai, cs.TenCoSo AS tenCoSo,
       cs.DiaChi AS diaChi, s.QrToken AS qrToken, s.QrPhienBan AS qrPhienBan
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND cs.MaChuSan=? ${khoa ? 'FOR UPDATE' : ''}`,
    [maSan, maChuSan]);
  if (!san) throw AppError.khongTimThay('Không tìm thấy sân');
  return san;
}

// Sân chưa có token (sân cũ, trước G3) → tạo lười khi chủ sân mở trang QR lần đầu, ghi lịch sử phiên bản 1.
async function bamTokenNeuChuaCo(ketNoi, maChuSan, san) {
  if (san.qrToken) return san;
  const token = crypto.randomBytes(32).toString('hex');
  const [ketQua] = await ketNoi.query(
    'UPDATE San SET QrToken=? WHERE MaSan=? AND QrToken IS NULL', [token, san.maSan]);
  if (ketQua.affectedRows) {
    await ketNoi.query(
      'INSERT INTO LichSuQrSan (MaSan, PhienBan, MaNguoiDoi) VALUES (?,?,?)',
      [san.maSan, san.qrPhienBan, maChuSan]);
    return { ...san, qrToken: token };
  }
  return laySanCuaChu(ketNoi, maChuSan, san.maSan);
}

async function layQrDayDu(ketNoi, maChuSan, maSan) {
  const san = await laySanCuaChu(ketNoi, maChuSan, maSan, true);
  return bamTokenNeuChuaCo(ketNoi, maChuSan, san);
}

async function dinhDangQr(san) {
  const noiDungQr = taoNoiDungQr(san);
  return {
    maSan: san.maSan,
    tenSan: san.tenSan,
    tenCoSo: san.tenCoSo,
    phienBan: san.qrPhienBan,
    noiDungQr,
    anhQr: await QRCode.toDataURL(noiDungQr, { width: 512, margin: 2, errorCorrectionLevel: 'M' }),
  };
}

// G3.2 – xem QR hiện tại (+ lịch sử đổi gần nhất).
async function xemQr(maChuSan, maSan) {
  const san = await thucHienGiaoDich((ketNoi) => layQrDayDu(ketNoi, maChuSan, maSan));
  const [lichSu] = await pool.query(
    `SELECT l.PhienBan AS phienBan, l.NgayDoi AS ngayDoi, u.HoTen AS nguoiDoi
     FROM LichSuQrSan l LEFT JOIN NguoiDung u ON u.MaNguoiDung=l.MaNguoiDoi
     WHERE l.MaSan=? ORDER BY l.MaLichSu DESC LIMIT 10`, [maSan]);
  return { ...(await dinhDangQr(san)), lichSu };
}

// Đổi QR: token mới + phiên bản + 1; QR cũ mất hiệu lực ngay (backend so phiên bản + token). Ghi lịch sử + nhật ký.
async function doiQr(maChuSan, maSan) {
  const san = await thucHienGiaoDich(async (ketNoi) => {
    const hienTai = await layQrDayDu(ketNoi, maChuSan, maSan);
    const token = crypto.randomBytes(32).toString('hex');
    const phienBanMoi = Number(hienTai.qrPhienBan) + 1;
    await ketNoi.query('UPDATE San SET QrToken=?, QrPhienBan=? WHERE MaSan=?', [token, phienBanMoi, maSan]);
    await ketNoi.query(
      'INSERT INTO LichSuQrSan (MaSan, PhienBan, MaNguoiDoi) VALUES (?,?,?)', [maSan, phienBanMoi, maChuSan]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan,
      hanhDong: 'doi_qr_check_in',
      doiTuong: 'San',
      maDoiTuong: Number(maSan),
      chiTiet: `Đổi QR check-in sân ${hienTai.tenSan}: phiên bản ${hienTai.qrPhienBan} → ${phienBanMoi}`,
    });
    return { ...hienTai, qrToken: token, qrPhienBan: phienBanMoi };
  });
  return dinhDangQr(san);
}

// G3.3 – ảnh PNG độ phân giải cao để tải về.
async function taoAnhPng(maChuSan, maSan) {
  const san = await thucHienGiaoDich((ketNoi) => layQrDayDu(ketNoi, maChuSan, maSan));
  return QRCode.toBuffer(taoNoiDungQr(san), { type: 'png', width: 1600, margin: 4, errorCorrectionLevel: 'M' });
}

const thoatHtml = (chuoi) => String(chuoi ?? '').replace(/[&<>"']/g,
  (kyTu) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[kyTu]));

// G3.3 – trang in A4/A5 có tên cơ sở + tên sân + hướng dẫn. Ảnh QR nhúng sẵn (data URL) để trang tự đủ,
// không cần gọi thêm API có token. Tên do chủ sân nhập → phải thoát HTML.
async function taoTrangIn(maChuSan, maSan, khoGiay = 'A4') {
  const kho = khoGiay === 'A5' ? 'A5' : 'A4';
  const san = await thucHienGiaoDich((ketNoi) => layQrDayDu(ketNoi, maChuSan, maSan));
  const anh = await QRCode.toDataURL(taoNoiDungQr(san), { width: 900, margin: 2, errorCorrectionLevel: 'M' });
  const coChuLon = kho === 'A4';
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>QR check-in - ${thoatHtml(san.tenSan)}</title>
<style>
  @page { size: ${kho}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; text-align: center; }
  .trang { padding: ${coChuLon ? '10mm' : '4mm'} 0; }
  h1 { font-size: ${coChuLon ? '34pt' : '22pt'}; margin: 0 0 4mm; }
  h2 { font-size: ${coChuLon ? '22pt' : '15pt'}; font-weight: normal; margin: 0 0 2mm; }
  .san { font-size: ${coChuLon ? '40pt' : '26pt'}; font-weight: bold; margin: 4mm 0; }
  img { width: ${coChuLon ? '120mm' : '80mm'}; height: auto; }
  ol { display: inline-block; text-align: left; font-size: ${coChuLon ? '16pt' : '11pt'}; line-height: 1.5; margin: 6mm 0 0; padding-left: 8mm; }
  .chan { margin-top: 6mm; font-size: ${coChuLon ? '11pt' : '8pt'}; color: #555; }
  @media screen { body { background: #eee; } .trang { background: #fff; max-width: 210mm; margin: 8mm auto; } }
</style></head>
<body><div class="trang">
  <h2>${thoatHtml(san.tenCoSo)}</h2>
  <h1>QUÉT QR ĐỂ CHECK-IN</h1>
  <div class="san">${thoatHtml(san.tenSan)}</div>
  <img src="${anh}" alt="QR check-in ${thoatHtml(san.tenSan)}">
  <ol>
    <li>Mở ứng dụng, vào đơn đặt sân của bạn.</li>
    <li>Bấm "Quét QR check-in" và hướng camera vào mã này.</li>
    <li>Chỉ check-in được từ lúc gần đến giờ chơi; đến trễ quá giờ cho phép, vui lòng gặp chủ sân.</li>
  </ol>
  <div class="chan">Không quét được? Báo chủ sân để được check-in thủ công. · Mã phiên bản ${san.qrPhienBan}</div>
</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Check-in. Hai đường (khách quét QR / chủ sân thủ công) dùng chung khối ghi ở `ghiCheckIn`.
// ---------------------------------------------------------------------------------------------------------------

// Khoá đơn + gom mọi thứ cần kiểm. Thời gian tính bằng NOW() của MySQL (giờ máy chủ).
async function layDonDeCheckIn(ketNoi, maDatSan, maChuSan = null) {
  const [[don]] = await ketNoi.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaKhachHang AS maKhachHang, d.MaSan AS maSan,
       d.TrangThai AS trangThai, d.NgayChoi AS ngayChoi, d.GioBatDau AS gioBatDau,
       d.MaLichCoDinh AS maLichCoDinh, d.MaNhomDat AS maNhomDat,
       TIMESTAMPDIFF(SECOND, NOW(), TIMESTAMP(d.NgayChoi, d.GioBatDau)) AS giayDenGioBatDau,
       TIMESTAMPDIFF(SECOND, NOW(), TIMESTAMP(d.NgayChoi, d.GioKetThuc)) AS giayDenGioKetThuc,
       cs.SoPhutTreToiDa AS treToiDaPhut, cs.MaChuSan AS maChuSan,
       t.MaThanhToan AS maThanhToan, t.TrangThai AS trangThaiThanhToan,
       (SELECT COUNT(*) FROM CheckIn ci WHERE ci.MaDatSan=d.MaDatSan) AS daCheckIn
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       LEFT JOIN (SELECT MaLichCoDinh AS maLichDauLich, MIN(MaDatSan) AS maDonDauLich FROM DatSan WHERE MaLichCoDinh IS NOT NULL GROUP BY MaLichCoDinh) dauLich ON dauLich.maLichDauLich=d.MaLichCoDinh
     LEFT JOIN ThanhToan t ON t.MaDatSan=CASE WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan) ELSE dauLich.maDonDauLich END
     WHERE d.MaDatSan=? ${maChuSan ? 'AND cs.MaChuSan=?' : ''}
     FOR UPDATE`,
    maChuSan ? [maDatSan, maChuSan] : [maDatSan]);
  if (!don) return null;
  return {
    ...don,
    giayDenGioBatDau: Number(don.giayDenGioBatDau),
    giayDenGioKetThuc: Number(don.giayDenGioKetThuc),
    daCheckIn: Number(don.daCheckIn) > 0,
  };
}

function nemLoi(ketQuaKiem) {
  throw new AppError(ketQuaKiem.maTrangThai, ketQuaKiem.thongBao, ketQuaKiem.maLoi, ketQuaKiem.chiTiet);
}

// Đơn đang chờ chủ sân/Admin duyệt mà khách đã đến sân → xác nhận luôn (DEC 0.8 #6) cho cả đợt thanh toán,
// ghi nhật ký `xac_nhan_qua_check_in` để truy vết. nguoi: {maNguoi, vaiTro} (vaiTro null khi khách tự quét QR).
async function tuXacNhanDonChoDuyet(ketNoi, don, nguoi) {
  await ketNoi.query(
    `UPDATE ThanhToan SET TrangThai='success', NgayThanhToan=NOW(), LyDoLoi=NULL,
       MaNguoiXacNhan=?, VaiTroXacNhan=?
     WHERE MaThanhToan=? AND TrangThai IN ('confirming','overdue')`,
    [nguoi.vaiTro ? nguoi.maNguoi : null, nguoi.vaiTro, don.maThanhToan]);
  const cungDot = don.maLichCoDinh
    ? { sql: 'MaLichCoDinh=?', thamSo: [don.maLichCoDinh] }
    : { sql: 'COALESCE(MaNhomDat, MaDatSan)=?', thamSo: [don.maNhomDat ?? don.maDatSan] };
  await ketNoi.query(
    `UPDATE DatSan SET TrangThai='confirmed', HetHanGiuCho=NULL WHERE ${cungDot.sql} AND TrangThai='pending_payment'`,
    cungDot.thamSo);
  await chungTu.chotKetQuaChungTu(ketNoi, don.maThanhToan, 'accepted',
    { maNguoiDuyet: nguoi.vaiTro ? nguoi.maNguoi : null, vaiTro: nguoi.vaiTro });
  await nhatKy.ghiNhatKy(ketNoi, {
    maNguoiThucHien: nguoi.maNguoi,
    hanhDong: 'xac_nhan_qua_check_in',
    doiTuong: 'ThanhToan',
    maDoiTuong: don.maThanhToan,
    chiTiet: `[${nguoi.vaiTro || 'customer'}] đơn ${don.maDon} tự xác nhận khi check-in`,
  });
}

async function ghiCheckIn(ketNoi, { don, phuongThuc, nguoi, canTuXacNhan, phienBanToken = null, viDo = null, kinhDo = null,
  maNguoiXacNhan = null, lyDo = null }) {
  if (canTuXacNhan) await tuXacNhanDonChoDuyet(ketNoi, don, nguoi);
  try {
    await ketNoi.query(
      `INSERT INTO CheckIn (MaDatSan, MaKhachHang, MaSan, PhuongThuc, PhienBanToken, ViDo, KinhDo, MaNguoiXacNhan, LyDo)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [don.maDatSan, don.maKhachHang, don.maSan, phuongThuc, phienBanToken, viDo, kinhDo, maNguoiXacNhan, lyDo]);
  } catch (loi) {
    // UNIQUE(MaDatSan): hai lần quét cùng lúc → lần sau bị chặn ở mức DB.
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.biTrung('Đơn này đã check-in rồi.', 'ALREADY_CHECKED_IN');
    throw loi;
  }
  await ketNoi.query("UPDATE DatSan SET TrangThai='checked_in' WHERE MaDatSan=?", [don.maDatSan]);
  await nhatKy.ghiNhatKy(ketNoi, {
    maNguoiThucHien: nguoi.maNguoi,
    hanhDong: phuongThuc === 'qr' ? 'check_in_qr' : 'check_in_thu_cong',
    doiTuong: 'DatSan',
    maDoiTuong: don.maDatSan,
    chiTiet: phuongThuc === 'qr' ? `Khách quét QR, đơn ${don.maDon}` : `Chủ sân check-in thủ công, đơn ${don.maDon}: ${lyDo}`,
  });
  const [[dong]] = await ketNoi.query(
    'SELECT ThoiDiem AS thoiDiem FROM CheckIn WHERE MaDatSan=?', [don.maDatSan]);
  const { trangThaiHienThi, nhanTrangThai, nhomTrangThai } = ganTrangThaiHienThi(
    { trangThai: 'checked_in', trangThaiThanhToan: 'success' });
  return {
    maDatSan: don.maDatSan,
    maDon: don.maDon,
    trangThai: 'checked_in',
    trangThaiHienThi,
    nhanTrangThai,
    nhomTrangThai,
    phuongThuc,
    thoiDiemCheckIn: dong.thoiDiem,
    daTuXacNhanDon: !!canTuXacNhan,
  };
}

// G3.5 – khách quét QR. `quetLuc` của thiết bị cố ý KHÔNG dùng để quyết định (chỉ giờ máy chủ).
async function checkInBangQr(maKhach, maDatSan, { maSan, token, phienBan, viDo, kinhDo }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[san]] = await ketNoi.query(
      'SELECT MaSan AS maSan, QrToken AS qrToken, QrPhienBan AS qrPhienBan FROM San WHERE MaSan=?', [maSan]);
    const don = await layDonDeCheckIn(ketNoi, maDatSan);
    const moSomPhut = await layCauHinhSo(ketNoi, 'checkin_open_minutes', PHUT_MO_SOM_MAC_DINH);
    const kiem = kiemTraCheckInQr({
      qr: { maSan, token, phienBan },
      san,
      don: don && { ...don, trangThaiThanhToan: don.trangThaiThanhToan },
      maKhach,
      cuaSo: { giayDenGioBatDau: don?.giayDenGioBatDau, moSomPhut, treToiDaPhut: don?.treToiDaPhut },
    });
    if (!kiem.hopLe) nemLoi(kiem);
    return ghiCheckIn(ketNoi, {
      don, phuongThuc: 'qr', nguoi: { maNguoi: maKhach, vaiTro: null }, canTuXacNhan: kiem.canTuXacNhan,
      phienBanToken: Number(phienBan), viDo: viDo ?? null, kinhDo: kinhDo ?? null,
    });
  });
}

// G3.6 – chủ sân check-in thủ công (chỉ đơn thuộc cơ sở của mình). Khách KHÔNG tự gọi được (route chỉ cho owner).
async function checkInThuCong(maChuSan, maDatSan, lyDo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const don = await layDonDeCheckIn(ketNoi, maDatSan, maChuSan);
    if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    const moSomPhut = await layCauHinhSo(ketNoi, 'checkin_open_minutes', PHUT_MO_SOM_MAC_DINH);
    const kiem = kiemTraCheckInThuCong({
      don,
      cuaSo: { giayDenGioBatDau: don.giayDenGioBatDau, giayDenGioKetThuc: don.giayDenGioKetThuc, moSomPhut },
    });
    if (!kiem.hopLe) nemLoi(kiem);
    return ghiCheckIn(ketNoi, {
      don, phuongThuc: 'manual', nguoi: { maNguoi: maChuSan, vaiTro: 'owner' }, canTuXacNhan: kiem.canTuXacNhan,
      maNguoiXacNhan: maChuSan, lyDo,
    });
  });
}

module.exports = {
  xemQr, doiQr, taoAnhPng, taoTrangIn, checkInBangQr, checkInThuCong, taoNoiDungQr,
};
