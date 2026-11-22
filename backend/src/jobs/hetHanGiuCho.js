const { thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');

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
  return thucHienGiaoDich(async (ketNoi) => {
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
    if (!cacDot.length) return { soDot: 0, soDon: 0 };

    let soDon = 0;
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
    }
    return { soDot: cacDot.length, soDon };
  });
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

module.exports = { chayMotLan, batDauJob };
