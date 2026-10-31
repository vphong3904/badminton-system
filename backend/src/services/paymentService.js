const crypto = require('crypto');
const { pool, thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');
const AppError = require('../utils/AppError');
const { taoAnhQrUrl } = require('../utils/sepay');

async function layThanhToanCuaKhach(maNguoiDung, maDatSan, ketNoi = pool, khoa = false) {
  const [[thanhToan]] = await ketNoi.query(
    `SELECT t.MaThanhToan AS maThanhToan,
       t.SoTien AS soTien, t.TrangThai AS trangThai, t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.NoiDungQR AS noiDungQr,
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

function taoQrUrl(noiDung, soTien) {
  if (!cauHinh.sepayTaiKhoan || !cauHinh.sepayNganHang) {
    throw new AppError(503, 'Chưa cấu hình tài khoản nhận thanh toán SePay', 'PAYMENT_NOT_CONFIGURED');
  }
  const thamSo = new URLSearchParams({
    acc: cauHinh.sepayTaiKhoan,
    bank: cauHinh.sepayNganHang,
    amount: String(soTien),
    des: noiDung,
  });
  return `https://qr.sepay.vn/img?${thamSo.toString()}`;
}

async function layQr(maNguoiDung, maDatSan) {
  const thanhToan = await layThanhToanCuaKhach(maNguoiDung, maDatSan);
  if (!['pending', 'confirming'].includes(thanhToan.trangThai)
    || thanhToan.trangThaiDatSan !== 'pending_payment') {
    throw AppError.biTrung('Đơn không còn trong thời hạn chờ thanh toán');
  }
  const [[hanGiu]] = await pool.query(
    'SELECT ? > NOW() AS conHan',
    [thanhToan.hetHanGiuCho]);
  if (!hanGiu.conHan) {
    await thucHienGiaoDich(async (ketNoi) => {
      if (thanhToan.maLichCoDinh) {
        await ketNoi.query(
          `UPDATE DatSan SET TrangThai='expired' WHERE MaLichCoDinh=?
           AND TrangThai='pending_payment' AND HetHanGiuCho<=NOW()`,
          [thanhToan.maLichCoDinh]);
        await ketNoi.query(
          "UPDATE LichCoDinh SET TrangThai='ended' WHERE MaLichCoDinh=?",
          [thanhToan.maLichCoDinh]);
      } else {
        await ketNoi.query(
          "UPDATE DatSan SET TrangThai='expired' WHERE MaDatSan=? AND TrangThai='pending_payment'",
          [thanhToan.maDatSan]);
      }
      await ketNoi.query(
        "UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan=? AND TrangThai IN ('pending','confirming')",
        [thanhToan.maThanhToan]);
    });
    throw AppError.biTrung('Thời gian giữ chỗ đã hết hạn');
  }
  return {
    maThanhToan: thanhToan.maThanhToan,
    soTien: Number(thanhToan.soTien),
    noiDungChuyenKhoan: thanhToan.noiDungChuyenKhoan,
    trangThai: thanhToan.trangThai,
    anhQrUrl: thanhToan.noiDungQr || taoAnhQrUrl(thanhToan.noiDungChuyenKhoan, Number(thanhToan.soTien)),
  };
}

async function taiAnhChuyenKhoan(maNguoiDung, maDatSan, duongDan) {
  return thucHienGiaoDich(async (ketNoi) => {
    const thanhToan = await layThanhToanCuaKhach(maNguoiDung, maDatSan, ketNoi, true);
    if (!['pending', 'confirming'].includes(thanhToan.trangThai)
      || thanhToan.trangThaiDatSan !== 'pending_payment') {
      throw AppError.biTrung('Đơn không còn chờ xác nhận thanh toán');
    }
    const [[hanGiu]] = await ketNoi.query(
      'SELECT ? > NOW() AS conHan',
      [thanhToan.hetHanGiuCho]);
    if (!hanGiu.conHan) throw AppError.biTrung('Thời gian giữ chỗ đã hết hạn');
    const [ketQua] = await ketNoi.query(
      `UPDATE ThanhToan SET LinkAnhChuyenKhoan=?, NgayTaiAnh=NOW(), TrangThai='confirming'
       WHERE MaThanhToan=?`,
      [duongDan, thanhToan.maThanhToan]);
    return { maThanhToan: thanhToan.maThanhToan, trangThai: 'confirming', daCapNhat: !!ketQua.affectedRows };
  });
}

function xacThucChuKyHmac(rawBody, headers, secret = cauHinh.sepayWebhookSecret, thoiGianHienTai = Date.now()) {
  const timestamp = headers['x-sepay-timestamp'];
  const chuKy = headers['x-sepay-signature'];
  if (!secret || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)
    || typeof chuKy !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(chuKy)) return false;
  const timestampGiay = Number(timestamp);
  if (Math.abs(Math.floor(thoiGianHienTai / 1000) - timestampGiay) > cauHinh.sepayDoLechThoiGianToiDa) return false;
  const chuKyMongDoi = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex')}`;
  const chuKyNhan = Buffer.from(chuKy.toLowerCase());
  const chuKyDung = Buffer.from(chuKyMongDoi);
  return chuKyNhan.length === chuKyDung.length && crypto.timingSafeEqual(chuKyNhan, chuKyDung);
}

function layNgayGiaoDich(ngayGiaoDich) {
  if (typeof ngayGiaoDich !== 'string' || Number.isNaN(Date.parse(ngayGiaoDich))) return null;
  return new Date(ngayGiaoDich).toLocaleString('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  });
}

function coMaDonTrongNoiDung(maDon, duLieu) {
  const noiDung = `${duLieu.code || ''} ${duLieu.content || ''} ${duLieu.description || ''}`.toUpperCase();
  return new RegExp(`(^|[^A-Z0-9])${maDon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Z0-9])`).test(noiDung);
}

async function xuLyWebhookSePay(duLieu) {
  if (!duLieu || typeof duLieu !== 'object' || Array.isArray(duLieu)) {
    throw AppError.duLieuKhongHopLe('Dữ liệu webhook SePay không hợp lệ');
  }
  const maGiaoDich = typeof duLieu.id === 'number' || (typeof duLieu.id === 'string' && /^\d+$/.test(duLieu.id))
    ? Number(duLieu.id)
    : NaN;
  const soTien = Number(duLieu.transferAmount);
  const cacTruongVanBan = [
    ['accountNumber', 30],
    ['content', 500],
    ['description', 500],
    ['code', 100],
    ['referenceCode', 100],
  ];
  const vanBanKhongHopLe = cacTruongVanBan.some(([truong, gioiHan]) =>
    duLieu[truong] != null && (typeof duLieu[truong] !== 'string' || duLieu[truong].length > gioiHan));
  if (!Number.isSafeInteger(maGiaoDich) || maGiaoDich <= 0
    || !['in', 'out'].includes(duLieu.transferType)
    || !Number.isSafeInteger(soTien) || soTien <= 0
    || vanBanKhongHopLe
    || (duLieu.transactionDate != null
      && (typeof duLieu.transactionDate !== 'string' || Number.isNaN(Date.parse(duLieu.transactionDate))))) {
    throw AppError.duLieuKhongHopLe('Dữ liệu giao dịch SePay không hợp lệ');
  }

  return thucHienGiaoDich(async (ketNoi) => {
    const [ketQuaThem] = await ketNoi.query(
      `INSERT IGNORE INTO GiaoDichSePay
       (MaGiaoDichSePay, MaGiaoDichNganHang, SoTaiKhoan, LoaiGiaoDich, SoTien,
        NoiDung, MaDoiSoat, NgayGiaoDich, DuLieuWebhook)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        maGiaoDich, duLieu.referenceCode || null, duLieu.accountNumber || null,
        duLieu.transferType, soTien, duLieu.content || duLieu.description || null,
        duLieu.code || null, layNgayGiaoDich(duLieu.transactionDate),
        JSON.stringify(duLieu),
      ]);
    if (!ketQuaThem.affectedRows) return { daXuLyTruoc: true };

    if (duLieu.transferType !== 'in'
      || String(duLieu.accountNumber || '') !== cauHinh.sepayTaiKhoan) {
      return { daXuLyTruoc: false, trangThaiDoiSoat: 'unmatched' };
    }

    const noiDung = `${duLieu.code || ''} ${duLieu.content || ''} ${duLieu.description || ''}`.toUpperCase();
    const maDon = /(?:^|[^A-Z0-9])(BK[A-Z0-9]{11,12})(?=$|[^A-Z0-9])/.exec(noiDung)?.[1];
    if (!maDon) return { daXuLyTruoc: false, trangThaiDoiSoat: 'unmatched' };
    const [cacThanhToan] = await ketNoi.query(
      `SELECT t.MaThanhToan AS maThanhToan, t.MaDatSan AS maDatSan,
         t.SoTien AS soTien, t.TrangThai AS trangThaiThanhToan,
         t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
         d.MaLichCoDinh AS maLichCoDinh, d.TrangThai AS trangThaiDatSan,
         d.HetHanGiuCho AS hetHanGiuCho
       FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       WHERE t.NoiDungChuyenKhoan=? AND t.TrangThai IN ('pending','confirming','expired')
       ORDER BY t.MaThanhToan DESC LIMIT 1 FOR UPDATE`,
      [maDon]);
    const thanhToan = cacThanhToan[0];
    if (!thanhToan || !coMaDonTrongNoiDung(thanhToan.noiDungChuyenKhoan, {
      code: duLieu.code,
      content: noiDung,
    })) return { daXuLyTruoc: false, trangThaiDoiSoat: 'unmatched' };
    await ketNoi.query(
      'UPDATE GiaoDichSePay SET MaThanhToan=? WHERE MaGiaoDichSePay=?',
      [thanhToan.maThanhToan, maGiaoDich]);

    if (soTien !== Number(thanhToan.soTien)) {
      await ketNoi.query(
        `UPDATE ThanhToan SET TrangThai='confirming',
           LyDoLoi='So tien giao dich khong khop voi hoa don'
         WHERE MaThanhToan=?`,
        [thanhToan.maThanhToan]);
      await ketNoi.query(
        `UPDATE GiaoDichSePay SET TrangThaiDoiSoat='amount_mismatch' WHERE MaGiaoDichSePay=?`,
        [maGiaoDich]);
      return { daXuLyTruoc: false, trangThaiDoiSoat: 'amount_mismatch' };
    }

    const [cacDon] = thanhToan.maLichCoDinh
      ? await ketNoi.query(
        `SELECT MaDatSan AS maDatSan, TrangThai AS trangThai, HetHanGiuCho AS hetHanGiuCho
         FROM DatSan WHERE MaLichCoDinh=? FOR UPDATE`,
        [thanhToan.maLichCoDinh])
      : await ketNoi.query(
        `SELECT MaDatSan AS maDatSan, TrangThai AS trangThai, HetHanGiuCho AS hetHanGiuCho
         FROM DatSan WHERE MaDatSan=? FOR UPDATE`,
        [thanhToan.maDatSan]);
    const conHan = thanhToan.trangThaiDatSan === 'pending_payment'
      && cacDon.every((muc) => muc.trangThai === 'pending_payment')
      && cacDon.length > 0;
    const [[thoiHan]] = await ketNoi.query('SELECT ? > NOW() AS conHan', [thanhToan.hetHanGiuCho]);
    if (!conHan || !thoiHan.conHan || thanhToan.trangThaiThanhToan === 'expired') {
      await ketNoi.query(
        `UPDATE ThanhToan SET TrangThai='late_payment', TrangThaiHoanTien='waiting_info',
           SoTienHoan=SoTien,
           LyDoLoi='Tien ve sau khi don het han giu cho'
         WHERE MaThanhToan=?`,
        [thanhToan.maThanhToan]);
      await ketNoi.query(
        `UPDATE DatSan SET TrangThai='expired' WHERE MaDatSan IN (${cacDon.map(() => '?').join(',')})
         AND TrangThai='pending_payment'`,
        cacDon.map((muc) => muc.maDatSan));
      await ketNoi.query(
        `UPDATE GiaoDichSePay SET TrangThaiDoiSoat='late' WHERE MaGiaoDichSePay=?`,
        [maGiaoDich]);
      return { daXuLyTruoc: false, trangThaiDoiSoat: 'late' };
    }

    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThai='success', MaGiaoDichNganHang=?, NgayThanhToan=NOW(), LyDoLoi=NULL
       WHERE MaThanhToan=?`,
      [String(duLieu.referenceCode || maGiaoDich), thanhToan.maThanhToan]);
    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='confirmed', HetHanGiuCho=NULL
       WHERE MaDatSan IN (${cacDon.map(() => '?').join(',')}) AND TrangThai='pending_payment'`,
      cacDon.map((muc) => muc.maDatSan));
    await ketNoi.query(
      `UPDATE GiaoDichSePay SET TrangThaiDoiSoat='matched' WHERE MaGiaoDichSePay=?`,
      [maGiaoDich]);
    return { daXuLyTruoc: false, trangThaiDoiSoat: 'matched' };
  });
}

module.exports = {
  layQr,
  taiAnhChuyenKhoan,
  xacThucChuKyHmac,
  xuLyWebhookSePay,
};
