const { pool, thucHienGiaoDich } = require('../config/db');
const { guiThongBao } = require('../services/notificationService');
const { layCauHinhSo } = require('../services/cauHinhService');
const cauHinh = require('../config/env');
const { phatNhieuCapNhatDatSan } = require('../realtime/datSan');

// Job nền (G1.1): nhả slot các đợt đặt đã quá hạn giữ chỗ (`HetHanGiuCho < NOW()`).
// - Chỉ đụng đơn `pending_payment` mà thanh toán còn `pending` (khách CHƯA gửi ảnh). Đơn `confirming` / đã gửi ảnh
//   KHÔNG bị job này chạm: chủ sân/Admin còn đang xử lý, chốt hết hạn của chúng do paymentService.chotHetHan quyết định.
// - Đợt = nhóm `MaNhomDat` (đặt nhiều sân/khung giờ) hoặc lịch cố định: mọi đơn con còn `pending_payment` của đợt
//   đó cùng chuyển `expired` trong MỘT giao dịch → slot của tất cả đơn con được giải phóng cùng lúc (SLOT_BAN).
// Giờ so sánh là NOW() máy chủ DB. Các lệnh "lười" ở customerService.hetHanDatSan / paymentService.chotHetHan vẫn
// giữ làm dự phòng khi job chưa chạy kịp.
const SO_DOT_TOI_DA_MOI_LAN = 200;

let dangChay = false;

async function chayMotLan() {
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    // Mỗi dòng = 1 đợt quá hạn (đơn đại diện = nơi gắn ThanhToan). Khoá ThanhToan để không giẫm lên lúc khách gửi ảnh.
    const [cacDot] = await ketNoi.query(
      `SELECT t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh,
         d.MaNhomDat AS maNhomDat
       FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       WHERE t.TrangThai='pending' AND d.TrangThai='pending_payment'
         AND d.HetHanGiuCho IS NOT NULL AND d.HetHanGiuCho<NOW()
       ORDER BY t.MaThanhToan LIMIT ?
       FOR UPDATE`,
      [SO_DOT_TOI_DA_MOI_LAN]);
    if (!cacDot.length) return { soDot: 0, soDon: 0, cacMaDatSan: [] };

    let soDon = 0;
    const cacMaDatSan = [];
    for (const dot of cacDot) {
      // Kiểm lại sau khi đã khoá: ThanhToan có thể vừa chuyển sang confirming ở giao dịch khác.
      const [[hienTai]] = await ketNoi.query(
        'SELECT TrangThai AS trangThai FROM ThanhToan WHERE MaThanhToan=?', [dot.maThanhToan]);
      if (hienTai?.trangThai !== 'pending') continue;

      const [ketQua] = dot.maLichCoDinh
        ? await ketNoi.query(
          `UPDATE DatSan SET TrangThai='expired', NguoiHuy='system', LyDoHuy='Het han giu cho', NgayHuy=NOW()
           WHERE MaLichCoDinh=? AND TrangThai='pending_payment'`, [dot.maLichCoDinh])
        : await ketNoi.query(
          `UPDATE DatSan SET TrangThai='expired', NguoiHuy='system', LyDoHuy='Het han giu cho', NgayHuy=NOW()
           WHERE COALESCE(MaNhomDat, MaDatSan)=? AND MaLichCoDinh IS NULL AND TrangThai='pending_payment'`,
          [dot.maNhomDat ?? dot.maDatSan]);
      await ketNoi.query(
        "UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan=? AND TrangThai='pending'", [dot.maThanhToan]);
      if (dot.maLichCoDinh) {
        await ketNoi.query(
          `UPDATE LichCoDinh lc SET TrangThai='ended'
           WHERE lc.MaLichCoDinh=? AND lc.TrangThai='active'
             AND NOT EXISTS (SELECT 1 FROM DatSan d WHERE d.MaLichCoDinh=lc.MaLichCoDinh
                             AND d.TrangThai IN ('pending_payment','confirmed','checked_in'))`,
          [dot.maLichCoDinh]);
      }
      soDon += ketQua.affectedRows;
      const [ids] = await ketNoi.query('SELECT MaDatSan FROM DatSan WHERE COALESCE(MaLichCoDinh,COALESCE(MaNhomDat,MaDatSan))=? OR MaLichCoDinh=?', [dot.maLichCoDinh || dot.maNhomDat || dot.maDatSan, dot.maLichCoDinh || 0]);
      cacMaDatSan.push(...ids.map(x => Number(x.MaDatSan)));
    }
    return { soDot: cacDot.length, soDon, cacMaDatSan };
  });
  await phatNhieuCapNhatDatSan(ketQua.cacMaDatSan);
  const { cacMaDatSan, ...congKhai } = ketQua;
  return congKhai;
}

// G6.1: nhắc SẮP hết hạn (mỗi mốc hạn chỉ nhắc 1 lần nhờ KhoaChongTrung có kèm mốc hạn; hạn đổi → nhắc lại).
//  - Khách: còn ≤ hold_reminder_minutes là hết HetHanGiuCho (chưa gửi ảnh chuyển khoản).
//  - Chủ sân: còn ≤ confirm_reminder_minutes là hết HanXacNhan (khách đã gửi ảnh, chờ xác nhận).
async function nhacSapHetHan() {
  const phutGiu = await layCauHinhSo(pool, 'hold_reminder_minutes', 5);
  const phutXacNhan = await layCauHinhSo(pool, 'confirm_reminder_minutes', 5);
  let soThongBao = 0;

  const [cacGiuCho] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaKhachHang AS maKhachHang,
       cs.TenCoSo AS tenCoSo, UNIX_TIMESTAMP(d.HetHanGiuCho) AS moc,
       GREATEST(CEIL(TIMESTAMPDIFF(SECOND, NOW(), d.HetHanGiuCho) / 60), 1) AS conPhut
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE t.TrangThai='pending' AND d.TrangThai='pending_payment' AND d.MaKhachHang IS NOT NULL
       AND d.HetHanGiuCho > NOW() AND d.HetHanGiuCho <= NOW() + INTERVAL ? MINUTE LIMIT 200`, [phutGiu]);
  for (const g of cacGiuCho) {
    await guiThongBao(pool, {
      maNguoiDung: g.maKhachHang, loai: 'hold_expiring',
      tieuDe: 'Sắp hết hạn giữ chỗ',
      noiDung: `Đơn ${g.maDon} tại ${g.tenCoSo} sẽ bị hủy sau khoảng ${g.conPhut} phút nếu bạn chưa thanh toán. Hãy chuyển khoản và gửi ảnh ngay.`,
      loaiThamChieu: 'booking', maThamChieu: g.maDatSan, khoa: `hold_expiring:${g.maThanhToan}:${g.moc}`,
    });
    soThongBao += 1;
  }

  const [cacXacNhan] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.TenKhach AS tenKhach,
       cs.MaChuSan AS maChuSan, cs.TenCoSo AS tenCoSo, UNIX_TIMESTAMP(t.HanXacNhan) AS moc,
       GREATEST(CEIL(TIMESTAMPDIFF(SECOND, NOW(), t.HanXacNhan) / 60), 1) AS conPhut
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE t.TrangThai='confirming' AND t.HanXacNhan > NOW() AND t.HanXacNhan <= NOW() + INTERVAL ? MINUTE LIMIT 200`,
    [phutXacNhan]);
  for (const x of cacXacNhan) {
    await guiThongBao(pool, {
      maNguoiDung: x.maChuSan, loai: 'confirm_expiring',
      tieuDe: 'Sắp hết hạn xác nhận thanh toán',
      noiDung: `Đơn ${x.maDon} của ${x.tenKhach} tại ${x.tenCoSo} còn khoảng ${x.conPhut} phút để xác nhận hoặc từ chối thanh toán. Quá hạn khách có thể khiếu nại chậm duyệt.`,
      loaiThamChieu: 'payment', maThamChieu: x.maDatSan, khoa: `confirm_expiring:${x.maThanhToan}:${x.moc}`,
    });
    soThongBao += 1;
  }
  return { soThongBao };
}

// Chạy định kỳ bằng setInterval (mặc định 1 phút, đổi bằng JOB_HET_HAN_GIU_CHO_PHUT). Không chạy khi NODE_ENV=test.
function batDauJob() {
  if (cauHinh.moiTruong === 'test') return null;
  const chuKyMs = cauHinh.jobHetHanGiuChoPhut * 60 * 1000;
  const luot = async () => {
    if (dangChay) return;
    dangChay = true;
    try {
      const ketQua = await chayMotLan();
      await nhacSapHetHan();
      if (ketQua.soDon) console.log(`[job-het-han-giu-cho] ${ketQua.soDot} đợt → ${ketQua.soDon} đơn expired`);
    } catch (loi) {
      console.error('[job-het-han-giu-cho] Lỗi:', loi.message);
    } finally {
      dangChay = false;
    }
  };
  const hen = setInterval(luot, chuKyMs);
  hen.unref();
  luot();
  return hen;
}

module.exports = { chayMotLan, nhacSapHetHan, batDauJob };
