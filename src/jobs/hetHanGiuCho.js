const { pool, thucHienGiaoDich } = require('../config/db');
const { guiThongBao, guiChoQuanTri } = require('../services/notificationService');
const { layCauHinhSo, layCauHinhDanhSach } = require('../services/cauHinhService');
const { chonMocNhac } = require('../utils/mocNhac');
const cauHinh = require('../config/env');
const { phatNhieuCapNhatDatSan } = require('../realtime/datSan');
const hoanTienService = require('../services/hoanTienService');
const nhatKy = require('../services/nhatKyService');

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
//  - Chủ sân: nhắc theo mốc confirm_reminder_steps (20/10/5) trước HanXacNhan (khách đã gửi ảnh, chờ xác nhận); quá hạn → báo Admin (G9.C4).
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

  // G9.C4: nhắc chủ sân theo MỐC (confirm_reminder_steps, mặc định 20/10/5; thường 20/10/5, đặt gấp chỉ còn 10/5 vì
  // mốc lớn hơn tổng hạn bị bỏ). Mỗi lượt chọn mốc nhỏ nhất s thoả conPhut <= s; chống trùng bằng KhoaChongTrung
  // '<loai>:<maThanhToan>:<s>'. Quá hạn duyệt: sân VẪN GIỮ (không tự nhả, không tự duyệt), chỉ báo Admin.
  const cacMocXacNhan = await layCauHinhDanhSach(pool, 'confirm_reminder_steps', [20, 10, 5]);
  const [cacXacNhan] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.TenKhach AS tenKhach,
       cs.MaChuSan AS maChuSan, cs.TenCoSo AS tenCoSo,
       GREATEST(CEIL(TIMESTAMPDIFF(SECOND, NOW(), t.HanXacNhan) / 60), 1) AS conPhut,
       TIMESTAMPDIFF(MINUTE, t.NgayGuiAnh, t.HanXacNhan) AS tongHanPhut
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE t.TrangThai='confirming' AND t.HanXacNhan > NOW() AND t.HanXacNhan <= NOW() + INTERVAL ? MINUTE LIMIT 200`,
    [cacMocXacNhan[0]]);
  for (const x of cacXacNhan) {
    const moc = chonMocNhac(Number(x.conPhut), cacMocXacNhan, x.tongHanPhut === null ? null : Number(x.tongHanPhut));
    if (moc === null) continue;
    await guiThongBao(pool, {
      maNguoiDung: x.maChuSan, loai: 'confirm_expiring',
      tieuDe: 'Sắp hết hạn xác nhận thanh toán',
      noiDung: `Đơn ${x.maDon} của ${x.tenKhach} tại ${x.tenCoSo} còn khoảng ${x.conPhut} phút để xác nhận hoặc từ chối thanh toán. Quá hạn khách có thể khiếu nại chậm duyệt.`,
      loaiThamChieu: 'payment', maThamChieu: x.maDatSan, khoa: `confirm_expiring:${x.maThanhToan}:${moc}`,
    });
    soThongBao += 1;
  }

  // Quá hạn duyệt (chỉ xét các khoản quá hạn trong 24 giờ gần đây để không báo dồn dữ liệu cũ; đơn qua giờ chơi do G9.C6 chốt).
  // Đơn gấp (từ lúc gửi ảnh đến buổi sớm nhất còn < urgent_threshold_minutes) báo Admin ngay khi quá hạn.
  const nguongGap = await layCauHinhSo(pool, 'urgent_threshold_minutes', 60);
  const [cacQuaHan] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.TenKhach AS tenKhach,
       cs.TenCoSo AS tenCoSo,
       TIMESTAMPDIFF(MINUTE, t.NgayGuiAnh, (
         SELECT MIN(TIMESTAMP(x.NgayChoi, x.GioBatDau)) FROM DatSan x
         WHERE x.TrangThai IN ('pending_payment','confirmed') AND IF(d.MaLichCoDinh IS NULL,
           COALESCE(x.MaNhomDat, x.MaDatSan)=COALESCE(d.MaNhomDat, d.MaDatSan), x.MaLichCoDinh=d.MaLichCoDinh)
       )) AS phutDenGioChoi
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE t.TrangThai='confirming' AND t.HanXacNhan <= NOW() AND t.HanXacNhan > NOW() - INTERVAL 24 HOUR LIMIT 200`);
  for (const x of cacQuaHan) {
    const gap = x.phutDenGioChoi !== null && x.phutDenGioChoi !== undefined && Number(x.phutDenGioChoi) < nguongGap;
    await guiChoQuanTri(pool, {
      loai: 'system',
      tieuDe: gap ? 'Đơn GẤP quá hạn duyệt thanh toán' : 'Đơn quá hạn duyệt thanh toán',
      noiDung: `Đơn ${x.maDon} của ${x.tenKhach} tại ${x.tenCoSo} đã quá hạn xác nhận thanh toán${gap ? ' (đặt gấp, khách sắp tới giờ chơi)' : ''}. `
        + 'Sân vẫn được giữ, hệ thống không tự duyệt - vui lòng liên hệ chủ sân hoặc xử lý trực tiếp.',
      loaiThamChieu: 'payment', maThamChieu: x.maDatSan, khoa: `confirm_overdue:${x.maThanhToan}`,
    });
    soThongBao += 1;
  }
  return { soThongBao };
}

// G9.C6: chốt đơn đã gửi ảnh mà qua giờ chơi vẫn chưa ai duyệt và khách không check-in.
//  - Điều kiện: ThanhToan `confirming`; đợt thường/nhiều sân: MỌI buổi đã qua GioKetThuc; lịch cố định dùng chung 1 thanh toán:
//    buổi ĐẦU đã qua GioKetThuc. Không có CheckIn nào của đợt (check-in sẽ tự xác nhận đơn, xem qrCheckInService).
//  - Kết quả: DatSan (các buổi còn pending_payment của đợt) → `expired` (NguoiHuy='system'); ThanhToan → `late_payment`;
//    tạo khoản hoàn `late_proof` 100% (khách nhập tài khoản, Admin xử lý). Khách không đến + chủ sân không duyệt → hoàn 100%.
//  - Trước đây KHÔNG nơi nào chạm tới đơn đã gửi ảnh nên đơn treo mãi ở confirming (thiếu sót thật, kế hoạch G9 §12).
async function chotDonQuaGioChoi() {
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    const [cacUngVien] = await ketNoi.query(
      `SELECT q.maThanhToan FROM (
         SELECT t.MaThanhToan AS maThanhToan,
           (SELECT IF(d.MaLichCoDinh IS NULL, MAX(TIMESTAMP(x.NgayChoi, x.GioKetThuc)), MIN(TIMESTAMP(x.NgayChoi, x.GioKetThuc)))
            FROM DatSan x
            WHERE x.TrangThai='pending_payment' AND IF(d.MaLichCoDinh IS NULL,
              x.MaLichCoDinh IS NULL AND COALESCE(x.MaNhomDat, x.MaDatSan)=COALESCE(d.MaNhomDat, d.MaDatSan),
              x.MaLichCoDinh=d.MaLichCoDinh)) AS gioChot
         FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
         WHERE t.TrangThai='confirming' AND d.TrangThai='pending_payment'
       ) q WHERE q.gioChot IS NOT NULL AND q.gioChot <= NOW()
       ORDER BY q.maThanhToan LIMIT ?`, [SO_DOT_TOI_DA_MOI_LAN]);
    const cacMaDatSan = [];
    let soDot = 0;
    for (const { maThanhToan } of cacUngVien) {
      // Khoá lại và kiểm lần nữa: chủ sân/Admin có thể vừa duyệt, hoặc khách vừa check-in ở giao dịch khác.
      const [[tt]] = await ketNoi.query(
        `SELECT t.TrangThai AS trangThai, t.SoTien AS soTien, d.MaDatSan AS maDatSan, d.MaDon AS maDon,
           d.MaKhachHang AS maKhachHang, d.MaLichCoDinh AS maLichCoDinh, d.MaNhomDat AS maNhomDat,
           cs.MaChuSan AS maChuSan, cs.TenCoSo AS tenCoSo
         FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
           JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
         WHERE t.MaThanhToan=? FOR UPDATE`, [maThanhToan]);
      if (!tt || tt.trangThai !== 'confirming') continue;
      const cungDot = tt.maLichCoDinh
        ? { sql: 'MaLichCoDinh=?', thamSo: [tt.maLichCoDinh] }
        : { sql: 'MaLichCoDinh IS NULL AND COALESCE(MaNhomDat, MaDatSan)=?', thamSo: [tt.maNhomDat ?? tt.maDatSan] };
      const [[daCheckIn]] = await ketNoi.query(
        `SELECT COUNT(*) AS so FROM CheckIn c JOIN DatSan x ON x.MaDatSan=c.MaDatSan
         WHERE ${cungDot.sql.replace(/\b(MaLichCoDinh|MaNhomDat|MaDatSan)\b/g, 'x.$1')}`, cungDot.thamSo);
      if (Number(daCheckIn.so) > 0) continue;
      const [cacDon] = await ketNoi.query(
        `SELECT MaDatSan AS maDatSan FROM DatSan WHERE ${cungDot.sql}`, cungDot.thamSo);
      await ketNoi.query(
        `UPDATE DatSan SET TrangThai='expired', NguoiHuy='system', NgayHuy=NOW(),
           LyDoHuy='Qua gio choi, chu san chua xac nhan thanh toan'
         WHERE ${cungDot.sql} AND TrangThai='pending_payment'`, cungDot.thamSo);
      await ketNoi.query(
        `UPDATE ThanhToan SET TrangThai='late_payment', TrangThaiHoanTien='waiting_info', SoTienHoan=SoTien,
           LyDoLoi='Qua gio choi, chu san chua xac nhan thanh toan'
         WHERE MaThanhToan=? AND TrangThai='confirming'`, [maThanhToan]);
      await hoanTienService.dongBoHoanTienQuaHan(ketNoi, maThanhToan); // tạo khoản late_proof
      if (tt.maLichCoDinh) {
        await ketNoi.query(
          `UPDATE LichCoDinh lc SET TrangThai='ended'
           WHERE lc.MaLichCoDinh=? AND lc.TrangThai='active'
             AND NOT EXISTS (SELECT 1 FROM DatSan d WHERE d.MaLichCoDinh=lc.MaLichCoDinh
                             AND d.TrangThai IN ('pending_payment','confirmed','checked_in'))`, [tt.maLichCoDinh]);
      }
      await nhatKy.ghiNhatKy(ketNoi, {
        maNguoiThucHien: null, hanhDong: 'chot_don_qua_gio_choi', doiTuong: 'ThanhToan', maDoiTuong: maThanhToan,
        chiTiet: `Đơn ${tt.maDon} qua giờ chơi, chủ sân chưa duyệt, khách không check-in → hết hạn, hoàn 100% (late_proof)`,
      });
      const tham = { loaiThamChieu: 'booking', maThamChieu: tt.maDatSan };
      await guiThongBao(ketNoi, {
        maNguoiDung: tt.maKhachHang, loai: 'booking_cancelled', tieuDe: 'Đơn đã hết hạn, bạn được hoàn 100%',
        noiDung: `Đơn ${tt.maDon} tại ${tt.tenCoSo} đã qua giờ chơi mà chủ sân chưa xác nhận thanh toán nên bị hủy. `
          + 'Bạn được hoàn 100%, vui lòng nhập tài khoản nhận tiền hoàn trong chi tiết đơn.',
        ...tham, khoa: `chot_qua_gio:khach:${maThanhToan}`,
      });
      await guiThongBao(ketNoi, {
        maNguoiDung: tt.maChuSan, loai: 'booking_cancelled', tieuDe: 'Đơn quá giờ chơi chưa duyệt đã tự hủy',
        noiDung: `Đơn ${tt.maDon} tại ${tt.tenCoSo} đã qua giờ chơi mà bạn chưa xác nhận thanh toán, hệ thống đã hủy đơn và hoàn 100% cho khách.`,
        ...tham, khoa: `chot_qua_gio:chu:${maThanhToan}`,
      });
      await guiChoQuanTri(ketNoi, {
        loai: 'refund_requested', tieuDe: 'Đơn quá giờ chơi chưa duyệt, cần hoàn 100%',
        noiDung: `Đơn ${tt.maDon} tại ${tt.tenCoSo} qua giờ chơi mà chủ sân chưa duyệt, khách không check-in. Khoản hoàn late_proof 100% đang chờ xử lý.`,
        loaiThamChieu: 'payment', maThamChieu: tt.maDatSan, khoa: `chot_qua_gio:admin:${maThanhToan}`,
      });
      cacMaDatSan.push(...cacDon.map((don) => Number(don.maDatSan)));
      soDot += 1;
    }
    return { soDot, cacMaDatSan };
  });
  await phatNhieuCapNhatDatSan(ketQua.cacMaDatSan);
  return { soDot: ketQua.soDot };
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
      const chot = await chotDonQuaGioChoi();
      if (chot.soDot) console.log(`[job-het-han-giu-cho] chốt ${chot.soDot} đợt qua giờ chơi chưa duyệt → hoàn 100%`);
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

module.exports = { chayMotLan, nhacSapHetHan, chotDonQuaGioChoi, batDauJob };
