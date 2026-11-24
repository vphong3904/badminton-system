const { pool, thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');
const { guiThongBao } = require('../services/notificationService');
const { layCauHinhSo } = require('../services/cauHinhService');
const suKien = require('../utils/suKien');
const { phatDuLieuDoi } = require('../realtime/duLieu');

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

    // Giống đặt sân (chotDonQuaGioChoi): khách đã gửi chứng từ mà đến HẾT GIỜ SỰ KIỆN chủ sân vẫn quên duyệt →
    // hủy đăng ký, đưa khoản phí vào diện hoàn 100% (TrangThaiHoan='pending', chủ sân tự chuyển khoản hoàn).
    // Quá HanXacNhan nhưng chưa hết giờ: chỉ cho khách khiếu nại "chậm duyệt", chủ sân vẫn duyệt muộn được.
    const [cacKhoanQuaHanDuyet] = await ketNoi.query(
      `SELECT t.MaThanhToan AS maThanhToan, dk.MaDangKy AS maDangKy, dk.MaKhachHang AS maKhachHang,
         sk.MaChuSan AS maChuSan, sk.TieuDe AS tieuDe, t.SoTien AS soTien
       FROM ThanhToanSuKien t
       JOIN DangKySuKien dk ON dk.MaDangKy=t.MaDangKy
       JOIN SuKien sk ON sk.MaSuKien=dk.MaSuKien
       WHERE t.TrangThai='confirming' AND dk.TrangThai='accepted'
         AND TIMESTAMP(sk.NgaySuKien, sk.GioKetThuc)<=NOW()
       ORDER BY sk.NgaySuKien, t.MaThanhToan
       LIMIT ? FOR UPDATE`,
      [SO_DONG_TOI_DA_MOI_LAN]);

    let soQuaHanDuyet = 0;
    for (const muc of cacKhoanQuaHanDuyet) {
      const [capNhat] = await ketNoi.query(
        `UPDATE ThanhToanSuKien SET TrangThai='expired', TrangThaiHoan='pending'
         WHERE MaThanhToan=? AND TrangThai='confirming'`,
        [muc.maThanhToan]);
      if (!capNhat.affectedRows) continue;
      await ketNoi.query(
        `UPDATE DangKySuKien
         SET TrangThai='cancelled', NguoiHuy='system', LyDo=?, NgayHuy=NOW()
         WHERE MaDangKy=? AND TrangThai='accepted'`,
        [suKien.LY_DO_QUA_HAN_DUYET, muc.maDangKy]);
      soQuaHanDuyet += 1;
      const soTien = Number(muc.soTien).toLocaleString('vi-VN');
      await guiThongBao(ketNoi, {
        maNguoiDung: muc.maKhachHang,
        loai: 'event_payment_expired',
        tieuDe: 'Chủ sân chưa duyệt, bạn được hoàn 100% phí',
        noiDung: `Chủ sân chưa xác nhận phí sự kiện "${muc.tieuDe}" đến hết giờ sự kiện. Khoản ${soTien}đ của bạn được hoàn 100%. Bạn cũng có thể khiếu nại vì chủ sân duyệt chậm trong mục Đăng ký của tôi.`,
        loaiThamChieu: 'registration',
        maThamChieu: muc.maDangKy,
        khoa: `event_slow_review:${muc.maThanhToan}`,
      });
      await guiThongBao(ketNoi, {
        maNguoiDung: muc.maChuSan,
        loai: 'event_payment_expired',
        tieuDe: 'Bạn quên duyệt phí sự kiện: cần hoàn 100% cho khách',
        noiDung: `Phí sự kiện "${muc.tieuDe}" (${soTien}đ) chưa được xác nhận đến hết giờ sự kiện. Bạn cần tự chuyển khoản hoàn 100% cho khách, sau đó đánh dấu "đã hoàn phí".`,
        loaiThamChieu: 'registration',
        maThamChieu: muc.maDangKy,
        khoa: `event_slow_review_owner:${muc.maThanhToan}`,
      });
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
      soQuaHanDuyet,
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
        + ketQua.soPhiHetHan + ketQua.soQuaHanDuyet + ketQua.soThongBaoNhac;
      if (tong) {
        // Trạng thái sự kiện / đăng ký đổi do job (đóng đăng ký, kết thúc, hết hạn phí…) → mọi màn tự tải lại.
        phatDuLieuDoi('su-kien', { hanhDong: 'JOB' }, { chung: true });
        phatDuLieuDoi('dang-ky-su-kien', { hanhDong: 'JOB' }, { chung: true });
        console.log(`[job-su-kien] đóng đăng ký ${ketQua.soSuKienDongDangKy}, finished ${ketQua.soSuKienHoanThanh}, hết hạn phí ${ketQua.soPhiHetHan}, quá hạn duyệt ${ketQua.soQuaHanDuyet}, nhắc ${ketQua.soThongBaoNhac}`);
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
