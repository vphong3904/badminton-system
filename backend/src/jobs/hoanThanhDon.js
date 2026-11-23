const { thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');
const { guiThongBao } = require('../services/notificationService');
const { phatNhieuCapNhatDatSan } = require('../realtime/datSan');

// Job nền: đơn đã xác nhận (confirmed) hoặc đã check-in mà qua giờ kết thúc của khung đã đặt → completed, rồi nhắc khách đánh giá.
// Các lệnh cập nhật "lười" trong customerService.hetHanDatSan vẫn giữ làm phương án dự phòng.
const SO_DON_TOI_DA_MOI_LAN = 200;

let dangChay = false;

// Một lần quét, trong MỘT giao dịch. `FOR UPDATE` (chỉ khoá dòng DatSan; không dùng `OF`/`SKIP LOCKED` vì MariaDB không hỗ trợ)
// để hai tiến trình không giẫm lên nhau; câu UPDATE bên dưới còn kiểm lại `TrangThai IN ('confirmed','checked_in')`.
async function chayMotLan() {
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    const [cacDon] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaKhachHang AS maKhachHang, d.Nguon AS nguon,
         d.MaLichCoDinh AS maLichCoDinh,
         (SELECT cs.TenCoSo FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo WHERE s.MaSan=d.MaSan) AS tenCoSo
       FROM DatSan d
       WHERE d.TrangThai IN ('confirmed','checked_in') AND TIMESTAMP(d.NgayChoi, d.GioKetThuc)<=NOW()
       ORDER BY d.MaDatSan LIMIT ?
       FOR UPDATE`,
      [SO_DON_TOI_DA_MOI_LAN]);
    if (!cacDon.length) return { soDonHoanThanh: 0, soThongBao: 0, cacMaDatSan: [] };

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='completed'
       WHERE TrangThai IN ('confirmed','checked_in') AND MaDatSan IN (${cacDon.map(() => '?').join(',')})`,
      cacDon.map((don) => don.maDatSan));

    // Nhắc đánh giá: chỉ đơn đặt qua app có khách. Lịch cố định chỉ nhắc 1 lần mỗi lịch (khớp quy tắc
    // "mỗi lịch cố định 1 đánh giá"): khoá chống trùng theo MaLichCoDinh, và chỉ nhắc buổi đầu trong lượt quét này.
    let soThongBao = 0;
    const lichDaNhac = new Set();
    for (const don of cacDon) {
      if (don.nguon !== 'app' || !don.maKhachHang) continue;
      if (don.maLichCoDinh) {
        if (lichDaNhac.has(don.maLichCoDinh)) continue;
        lichDaNhac.add(don.maLichCoDinh);
      }
      await guiThongBao(ketNoi, {
        maNguoiDung: don.maKhachHang,
        loai: 'review_reminder',
        tieuDe: 'Bạn đã chơi xong, hãy đánh giá sân',
        noiDung: `Đơn ${don.maDon} tại ${don.tenCoSo} đã hoàn thành. Hãy chấm sao và nhận xét để giúp người chơi khác chọn sân.`,
        loaiThamChieu: 'booking',
        maThamChieu: don.maDatSan,
        khoa: don.maLichCoDinh
          ? `review_reminder:lich:${don.maLichCoDinh}`
          : `review_reminder:${don.maDatSan}`,
      });
      soThongBao += 1;
    }
    return { soDonHoanThanh: cacDon.length, soThongBao, cacMaDatSan: cacDon.map(x => Number(x.maDatSan)) };
  });
  await phatNhieuCapNhatDatSan(ketQua.cacMaDatSan);
  const { cacMaDatSan, ...congKhai } = ketQua;
  return congKhai;
}

// Chạy định kỳ bằng setInterval (mặc định 5 phút, đổi bằng JOB_HOAN_THANH_PHUT). Không chạy khi NODE_ENV=test.
// `.unref()` để job không giữ process sống. Lỗi 1 lượt chỉ log, không làm sập server.
function batDauJob() {
  if (cauHinh.moiTruong === 'test') return null;
  const chuKyMs = cauHinh.jobHoanThanhPhut * 60 * 1000;
  const luot = async () => {
    if (dangChay) return; // lượt trước chưa xong → bỏ qua, tránh chồng lượt
    dangChay = true;
    try {
      const ketQua = await chayMotLan();
      if (ketQua.soDonHoanThanh) {
        console.log(`[job-hoan-thanh] ${ketQua.soDonHoanThanh} đơn → completed, ${ketQua.soThongBao} thông báo nhắc đánh giá`);
      }
    } catch (loi) {
      console.error('[job-hoan-thanh] Lỗi:', loi.message);
    } finally {
      dangChay = false;
    }
  };
  const hen = setInterval(luot, chuKyMs);
  hen.unref();
  luot(); // quét ngay khi khởi động để dọn đơn tồn đọng
  return hen;
}

module.exports = { chayMotLan, batDauJob };
