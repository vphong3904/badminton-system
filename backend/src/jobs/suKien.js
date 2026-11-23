const { pool, thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');
const { guiThongBao } = require('../services/notificationService');
const { layCauHinhSo } = require('../services/cauHinhService');

const SO_DONG_TOI_DA_MOI_LAN = 200;
let dangChay = false;

// G7.10: đồng bộ trạng thái sự kiện theo giờ máy chủ MySQL, xử lý phí đăng ký quá hạn
// và nhắc người đã đăng ký trước giờ bắt đầu. Các bước chạy trong một transaction.
async function chayMotLan() {
  return thucHienGiaoDich(async (ketNoi) => {
    // Hạn đăng ký đã qua nhưng sự kiện chưa bắt đầu: đóng nhận đăng ký, không hủy sự kiện.
    const [dongDangKy] = await ketNoi.query(
      `UPDATE SuKien
       SET TrangThai='closed'
       WHERE TrangThai='open' AND HanDangKy<=NOW()
         AND TIMESTAMP(NgaySuKien, GioKetThuc)>NOW()`);

    // Sự kiện đã qua giờ kết thúc: đánh dấu finished, kể cả trước đó đang open/closed.
    const [hoanThanh] = await ketNoi.query(
      `UPDATE SuKien
       SET TrangThai='finished'
       WHERE TrangThai IN ('open','closed')
         AND TIMESTAMP(NgaySuKien, GioKetThuc)<=NOW()`);

    // Phí đang chờ chuyển khoản đã quá hạn: giải phóng chỗ bằng cách hủy đăng ký hệ thống.
    // Không đụng trạng thái confirming vì khách đã gửi chứng từ, chủ sân cần xử lý.
    const [cacKhoanQuaHan] = await ketNoi.query(
      `SELECT t.MaThanhToan AS maThanhToan, t.HanThanhToan AS hanThanhToan, dk.MaDangKy AS maDangKy,
         dk.MaKhachHang AS maKhachHang, dk.MaSuKien AS maSuKien, sk.TieuDe AS tieuDe
       FROM ThanhToanSuKien t
       JOIN DangKySuKien dk ON dk.MaDangKy=t.MaDangKy
       JOIN SuKien sk ON sk.MaSuKien=dk.MaSuKien
       WHERE t.TrangThai='pending' AND t.HanThanhToan IS NOT NULL
         AND t.HanThanhToan<=NOW() AND dk.TrangThai='accepted'
       ORDER BY t.HanThanhToan, t.MaThanhToan
       LIMIT ? FOR UPDATE`,
      [SO_DONG_TOI_DA_MOI_LAN]);

    let soPhiHetHan = 0;
    let soThongBaoHetHan = 0;
    for (const muc of cacKhoanQuaHan) {
      const [capNhatThanhToan] = await ketNoi.query(
        `UPDATE ThanhToanSuKien SET TrangThai='expired'
         WHERE MaThanhToan=? AND TrangThai='pending' AND HanThanhToan<=NOW()`,
        [muc.maThanhToan]);
      if (!capNhatThanhToan.affectedRows) continue;

      const [capNhatDangKy] = await ketNoi.query(
        `UPDATE DangKySuKien
         SET TrangThai='cancelled', NguoiHuy='system', LyDo='Het han thanh toan phi su kien', NgayHuy=NOW()
         WHERE MaDangKy=? AND TrangThai='accepted'`,
        [muc.maDangKy]);
      if (!capNhatDangKy.affectedRows) continue;

      soPhiHetHan += 1;
      await guiThongBao(ketNoi, {
        maNguoiDung: muc.maKhachHang,
        loai: 'event_payment_expired',
        tieuDe: 'Đăng ký sự kiện đã hết hạn thanh toán',
        noiDung: `Đăng ký sự kiện "${muc.tieuDe}" đã bị hủy vì quá hạn thanh toán. Nếu vẫn muốn tham gia, bạn có thể đăng ký lại khi sự kiện còn nhận đăng ký.`,
        loaiThamChieu: 'registration',
        maThamChieu: muc.maDangKy,
        khoa: `event_payment_expired:${muc.maThanhToan}:${String(muc.hanThanhToan).replace(/[^0-9]/g, '')}`,
      });
      soThongBaoHetHan += 1;
    }

    // Nhắc một lần cho mỗi đăng ký (pending hoặc accepted) khi sự kiện bước vào cửa sổ nhắc.
    // NgayNhacNho + UNIQUE KhoaChongTrung là hai lớp chống gửi lặp khi job chạy nhiều lần.
    const gioNhac = await layCauHinhSo(ketNoi, 'event_reminder_hours', 24);
    const [cacDangKyCanNhac] = await ketNoi.query(
      `SELECT dk.MaDangKy AS maDangKy, dk.MaKhachHang AS maKhachHang,
         dk.MaSuKien AS maSuKien, sk.TieuDe AS tieuDe,
         TIMESTAMP(sk.NgaySuKien, sk.GioBatDau) AS batDau
       FROM DangKySuKien dk
       JOIN SuKien sk ON sk.MaSuKien=dk.MaSuKien
       WHERE dk.TrangThai IN ('pending','accepted') AND dk.NgayNhacNho IS NULL
         AND sk.TrangThai IN ('open','closed')
         AND TIMESTAMP(sk.NgaySuKien, sk.GioBatDau)>NOW()
         AND TIMESTAMP(sk.NgaySuKien, sk.GioBatDau)<=DATE_ADD(NOW(), INTERVAL ? HOUR)
       ORDER BY sk.NgaySuKien, sk.GioBatDau, dk.MaDangKy
       LIMIT ? FOR UPDATE`,
      [gioNhac, SO_DONG_TOI_DA_MOI_LAN]);

    let soThongBaoNhac = 0;
    for (const muc of cacDangKyCanNhac) {
      await guiThongBao(ketNoi, {
        maNguoiDung: muc.maKhachHang,
        loai: 'event_reminder',
        tieuDe: 'Sự kiện sắp diễn ra',
        noiDung: `Sự kiện "${muc.tieuDe}" sắp diễn ra. Hãy xem lại thời gian và thông tin tham gia để chuẩn bị nhé.`,
        loaiThamChieu: 'event',
        maThamChieu: muc.maSuKien,
        khoa: `event_reminder:${muc.maSuKien}:${muc.maDangKy}`,
      });
      await ketNoi.query(
        'UPDATE DangKySuKien SET NgayNhacNho=NOW() WHERE MaDangKy=? AND NgayNhacNho IS NULL',
        [muc.maDangKy]);
      soThongBaoNhac += 1;
    }

    return {
      soSuKienDongDangKy: dongDangKy.affectedRows,
      soSuKienHoanThanh: hoanThanh.affectedRows,
      soPhiHetHan,
      soThongBaoHetHan,
      soThongBaoNhac,
    };
  });
}

// Mặc định quét mỗi phút; không chạy trong môi trường test.
function batDauJob() {
  if (cauHinh.moiTruong === 'test') return null;
  const chuKyMs = cauHinh.jobSuKienPhut * 60 * 1000;
  const luot = async () => {
    if (dangChay) return;
    dangChay = true;
    try {
      const ketQua = await chayMotLan();
      const tong = ketQua.soSuKienDongDangKy + ketQua.soSuKienHoanThanh
        + ketQua.soPhiHetHan + ketQua.soThongBaoNhac;
      if (tong) {
        console.log(`[job-su-kien] đóng đăng ký ${ketQua.soSuKienDongDangKy}, finished ${ketQua.soSuKienHoanThanh}, hết hạn phí ${ketQua.soPhiHetHan}, nhắc ${ketQua.soThongBaoNhac}`);
      }
    } catch (loi) {
      console.error('[job-su-kien] Lỗi:', loi.message);
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
