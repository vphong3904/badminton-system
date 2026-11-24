const crypto = require('crypto');
const { pool, thucHienGiaoDich } = require('../config/db');
const { timNganHang } = require('../utils/nganHang');
const AppError = require('../utils/AppError');
const { doiGioRaPhut } = require('../utils/time');
const { thuTuNgay } = require('../utils/giaTheoThu');
const { taoAnhQrUrl, taoNoiDungQr, layTaiKhoanChuSan, layTaiKhoanNhanTheoDatSan } = require('../utils/vietqr');
const { guiThongBao, dinhDangTien, baoDanhGiaMoi } = require('./notificationService');
const { tinhLaiDiemCoSo } = require('./reviewService');
const { ganTrangThaiHienThi, tinhTrangThaiHienThi } = require('../utils/trangThaiDon');
const { tinhSoTienHoan, MAC_DINH: HOAN_MAC_DINH } = require('../utils/chinhSachHoanTien');
const hoanTienService = require('./hoanTienService');

const { ANH_MAC_DINH } = require('../middlewares/upload');
const { SLOT_BAN } = require('../utils/slot');
const { SAN_CHUA_XOA } = require('../utils/sanHienHanh');
const { gopKhoiLienKe } = require('../utils/khoiLienKe');
const { layCauHinhSo } = require('./cauHinhService');
const chungTu = require('./chungTuService');
const nhatKy = require('./nhatKyService');

const GIOI_HAN_DAT_CO_DINH_NGAY = 90;
const SO_NGAY_SUA_DANH_GIA = 7;

function kiemTraNgay(ngay) {
  const ngayDate = /^\d{4}-\d{2}-\d{2}$/.test(ngay) ? new Date(`${ngay}T00:00:00Z`) : null;
  const ngayHopLe = ngayDate && !Number.isNaN(ngayDate.getTime())
    && ngayDate.toISOString().slice(0, 10) === ngay;
  if (!ngayHopLe) throw AppError.duLieuKhongHopLe('Ngày không hợp lệ');
}

function taoDanhSachNgay(ngayBatDau, ngayKetThuc) {
  kiemTraNgay(ngayBatDau);
  kiemTraNgay(ngayKetThuc);
  const soNgay = (Date.parse(`${ngayKetThuc}T00:00:00Z`) - Date.parse(`${ngayBatDau}T00:00:00Z`))
    / 86_400_000 + 1;
  if (soNgay < 1 || soNgay > GIOI_HAN_DAT_CO_DINH_NGAY) {
    throw AppError.duLieuKhongHopLe(`Lịch cố định chỉ được đặt tối đa ${GIOI_HAN_DAT_CO_DINH_NGAY} ngày mỗi lần`);
  }
  return Array.from({ length: soNgay }, (_muc, viTri) =>
    new Date(Date.parse(`${ngayBatDau}T00:00:00Z`) + viTri * 86_400_000).toISOString().slice(0, 10));
}

// 'YYYY-MM-DD' (hoặc Date) → 'dd/mm/yyyy' để đưa vào nội dung thông báo.
function dinhDangNgay(ngay) {
  const [nam, thang, ngayTrongThang] = String(ngay).slice(0, 10).split('-');
  return `${ngayTrongThang}/${thang}/${nam}`;
}

function taoMaDon() {
  const ngay = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  return `BK${ngay}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function kiemTraBatDauTuongLai(ngay, gioBatDau) {
  const ngayHienTai = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const gioHienTai = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  }).slice(0, 5);
  // Câu chữ trùng 05-validation.md để FE hiện đúng một thông báo dù chặn ở máy khách hay ở BE.
  if (ngay < ngayHienTai) {
    throw AppError.duLieuKhongHopLe('Không thể chọn ngày đã qua.', [
      { truong: 'ngay', thongBao: 'Không thể chọn ngày đã qua.' }]);
  }
  if (ngay === ngayHienTai && gioBatDau <= gioHienTai) {
    throw AppError.duLieuKhongHopLe('Giờ bắt đầu phải sau giờ hiện tại.', [
      { truong: 'gioBatDau', thongBao: 'Giờ bắt đầu phải sau giờ hiện tại.' }]);
  }
}

// Dọn trạng thái của khách mỗi lần họ mở danh sách/hoá đơn (không có job nền):
//  1) đơn confirmed đã qua giờ chơi  → completed
//  2) đơn pending_payment quá hạn giữ chỗ → expired (+ thanh toán expired)
//  3) lịch cố định không còn đơn nào đang hiệu lực → ended
async function hetHanDatSan(maNguoiDung, ketNoi = pool) {
  // Đơn đã xác nhận mà quá giờ kết thúc thì chuyển sang hoàn thành (ghi lười khi khách truy cập).
  await ketNoi.query(
    `UPDATE DatSan SET TrangThai='completed'
     WHERE MaKhachHang=? AND TrangThai IN ('confirmed','checked_in')
       AND TIMESTAMP(NgayChoi,GioKetThuc)<=NOW()`,
    [maNguoiDung]);
  await ketNoi.query(
    `UPDATE DatSan SET TrangThai='expired'
     WHERE MaKhachHang=? AND TrangThai='pending_payment' AND HetHanGiuCho<=NOW()`,
    [maNguoiDung]);
  await ketNoi.query(
    `UPDATE ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
     SET t.TrangThai='late_payment', t.TrangThaiHoanTien='waiting_info', t.SoTienHoan=t.SoTien,
       t.LyDoLoi='Het han giu cho khi chu san chua xac nhan'
     WHERE d.MaKhachHang=? AND d.TrangThai='expired' AND t.TrangThai='confirming'`,
    [maNguoiDung]);
  // G4: khoản hoàn do quá hạn xác nhận → tạo dòng HoanTien (late_proof) cho các thanh toán vừa chuyển late_payment.
  await hoanTienService.dongBoHoanTienQuaHan(ketNoi);
  await ketNoi.query(
    `UPDATE ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
     SET t.TrangThai='expired'
     WHERE d.MaKhachHang=? AND d.TrangThai='expired' AND t.TrangThai='pending'`,
    [maNguoiDung]);
  await ketNoi.query(
    `UPDATE LichCoDinh lc SET TrangThai='ended'
     WHERE lc.MaKhachHang=? AND lc.TrangThai='active'
       AND NOT EXISTS (
         SELECT 1 FROM DatSan d WHERE d.MaLichCoDinh=lc.MaLichCoDinh
           AND d.TrangThai IN ('pending_payment','confirmed','checked_in')
       )`,
    [maNguoiDung]);
}

// G5.5: Admin khóa nhận đặt mới → khách không đặt MỚI được; lịch đã đặt giữ nguyên. Chủ sân tự tạo đơn không bị chặn.
async function kiemTraKhoaDatMoi(ketNoi, maChuSan) {
  const [[hs]] = await ketNoi.query('SELECT KhoaDatMoi AS khoa FROM HoSoChuSan WHERE MaNguoiDung=?', [maChuSan]);
  if (hs && Number(hs.khoa) === 1) {
    throw AppError.biTrung('Cơ sở này tạm thời không nhận đặt sân mới. Vui lòng chọn cơ sở khác.', 'OWNER_BOOKING_LOCKED');
  }
}

async function layThongTinSan(maSan, ketNoi = pool, khoa = false) {
  const [[san]] = await ketNoi.query(
    `SELECT s.MaSan AS maSan, s.MaCoSo AS maCoSo, s.TenSan AS tenSan,
       s.TrangThai AS trangThaiSan, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi,
       cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen, cs.GioMoCua AS gioMoCua,
       cs.GioDongCua AS gioDongCua, cs.SoPhutDatToiThieu AS soPhutDatToiThieu,
       cs.MaChuSan AS maChuSan
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND ${SAN_CHUA_XOA('s')} AND cs.TrangThai='active' ${khoa ? 'FOR UPDATE' : ''}`,
    [maSan]);
  if (!san || san.trangThaiSan !== 'active') throw AppError.khongTimThay('Không tìm thấy sân đang hoạt động');
  return san;
}

// Trả true nếu khung giờ HỢP LỆ và còn trống; ném lỗi 400 nếu sai quy tắc (quá khứ, lệch 30 phút,
// ngoài giờ mở cửa, ngắn hơn tối thiểu). Trống = không trùng đơn đang giữ/đã xác nhận và không bị khoá.
// Có FOR UPDATE nên phải gọi trong giao dịch (chặn 2 người đặt cùng ô cùng lúc).
async function kiemTraKhungDat(san, ngay, gioBatDau, gioKetThuc, ketNoi = pool) {
  kiemTraNgay(ngay);
  const batDau = doiGioRaPhut(gioBatDau);
  const ketThuc = doiGioRaPhut(gioKetThuc);
  const soPhut = ketThuc - batDau;
  kiemTraBatDauTuongLai(ngay, gioBatDau);
  if (soPhut <= 0) {
    throw AppError.duLieuKhongHopLe('Giờ kết thúc phải sau giờ bắt đầu.', [
      { truong: 'gioKetThuc', thongBao: 'Giờ kết thúc phải sau giờ bắt đầu.' }]);
  }
  if (soPhut % 30 !== 0 || batDau % 30 !== 0 || ketThuc % 30 !== 0
    || soPhut < san.soPhutDatToiThieu) {
    const thongBao = `Tối thiểu ${san.soPhutDatToiThieu} phút, theo mốc 30 phút.`;
    throw AppError.duLieuKhongHopLe(thongBao, [{ truong: 'gioKetThuc', thongBao }]);
  }
  if (batDau < doiGioRaPhut(san.gioMoCua) || ketThuc > doiGioRaPhut(san.gioDongCua)) {
    const thongBao = `Ngoài giờ hoạt động (${String(san.gioMoCua).slice(0, 5)}–${String(san.gioDongCua).slice(0, 5)}).`;
    throw AppError.duLieuKhongHopLe(thongBao, [{ truong: 'gioBatDau', thongBao }]);
  }

  const [[donTrung]] = await ketNoi.query(
    `SELECT MaDatSan FROM DatSan
     WHERE MaSan=? AND NgayChoi=?
       AND ${SLOT_BAN()}
       AND GioBatDau<? AND GioKetThuc>? LIMIT 1 FOR UPDATE`,
    [san.maSan, ngay, gioKetThuc, gioBatDau]);
  const [[khoaTrung]] = await ketNoi.query(
    `SELECT MaKhoa FROM KhoaSan
     WHERE MaSan=? AND NgayKhoa=? AND GioBatDau<? AND GioKetThuc>? LIMIT 1 FOR UPDATE`,
    [san.maSan, ngay, gioKetThuc, gioBatDau]);
  return !donTrung && !khoaTrung;
}

// Giá = tổng giá từng ô 30 phút (giá mỗi giờ / 2). Giá lấy theo bảng giá của cơ sở:
// loại ngày (T2–T6 hoặc T7–CN) × loại khách (vãng lai / cố định) × khung giờ chứa ô đó.
async function tinhTongTien(maCoSo, ngay, gioBatDau, gioKetThuc, loaiKhach, ketNoi = pool) {
  const thu = thuTuNgay(ngay);
  const [cacGia] = await ketNoi.query(
    `SELECT GioBatDau AS gioBatDau, GioKetThuc AS gioKetThuc, GiaMoiGio AS giaMoiGio
     FROM BangGia WHERE MaCoSo=? AND Thu=? AND LoaiKhach=?
     ORDER BY GioBatDau`,
    [maCoSo, thu, loaiKhach]);
  let tongTien = 0;
  for (let phut = doiGioRaPhut(gioBatDau); phut < doiGioRaPhut(gioKetThuc); phut += 30) {
    const gia = cacGia.find((khung) =>
      doiGioRaPhut(String(khung.gioBatDau).slice(0, 5)) <= phut
      && doiGioRaPhut(String(khung.gioKetThuc).slice(0, 5)) >= phut + 30);
    if (!gia) throw AppError.duLieuKhongHopLe(`Chưa có giá cho khung ${String(Math.floor(phut / 60)).padStart(2, '0')}:${String(phut % 60).padStart(2, '0')}`);
    tongTien += Number(gia.giaMoiGio) / 2;
  }
  return Math.round(tongTien);
}

async function layThongTinLienHe(maNguoiDung, duLieu, ketNoi) {
  const [[nguoiDung]] = await ketNoi.query(
    'SELECT HoTen AS hoTen, SoDienThoai AS soDienThoai FROM NguoiDung WHERE MaNguoiDung=?',
    [maNguoiDung]);
  if (!nguoiDung) throw AppError.chuaDangNhap();
  return {
    tenKhach: duLieu.tenKhach || nguoiDung.hoTen,
    soDienThoai: duLieu.soDienThoai || nguoiDung.soDienThoai,
  };
}

// CHỐNG GIỮ SÂN ẢO (G1.2): đếm số ĐỢT đặt của khách bị hủy/hết hạn khi CHƯA thanh toán trong `abuse_window_hours`
// (mặc định 24h). Đủ `abuse_threshold` (mặc định 5) thì chặn đặt mới tạm thời (429, `ABUSE_HOLD_BLOCKED`) tới khi
// đợt cũ nhất rơi khỏi cửa sổ. Một nhóm nhiều đơn con / một lịch cố định chỉ tính 1 lần. Đợt đã gửi ảnh chuyển khoản
// hoặc đã thanh toán (thanh toán ≠ pending/expired) KHÔNG tính. Gọi trong giao dịch, trước khi giữ chỗ.
async function kiemTraChongGiuSanAo(ketNoi, maNguoiDung) {
  const nguong = await layCauHinhSo(ketNoi, 'abuse_threshold', 5);
  const gioCuaSo = await layCauHinhSo(ketNoi, 'abuse_window_hours', 24);
  const [cacLan] = await ketNoi.query(
    `SELECT DATE_ADD(x.thoiDiem, INTERVAL ? HOUR) AS chanDen FROM (
       SELECT MAX(CASE WHEN d.TrangThai='cancelled' THEN d.NgayHuy ELSE d.HetHanGiuCho END) AS thoiDiem
       FROM DatSan d JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
       WHERE d.MaKhachHang=? AND d.Nguon='app' AND t.TrangThai IN ('pending','expired')
         AND ( (d.TrangThai='cancelled' AND d.NguoiHuy='customer' AND d.NgayHuy>=DATE_SUB(NOW(), INTERVAL ? HOUR))
            OR (d.TrangThai IN ('expired','pending_payment') AND d.HetHanGiuCho<=NOW()
                AND d.HetHanGiuCho>=DATE_SUB(NOW(), INTERVAL ? HOUR)) )
       GROUP BY CASE WHEN d.MaLichCoDinh IS NULL THEN CONCAT('n', COALESCE(d.MaNhomDat, d.MaDatSan))
                     ELSE CONCAT('l', d.MaLichCoDinh) END
     ) x ORDER BY x.thoiDiem ASC`,
    [gioCuaSo, maNguoiDung, gioCuaSo, gioCuaSo]);
  if (cacLan.length < nguong) return;
  // Hết chặn khi đợt thứ (tổng − ngưỡng + 1) từ cũ nhất rơi khỏi cửa sổ.
  const chanDen = dinhDangThoiDiemISO(cacLan[cacLan.length - nguong].chanDen);
  throw new AppError(429,
    `Bạn đã hủy hoặc để hết hạn giữ chỗ ${cacLan.length} lần trong ${gioCuaSo} giờ qua. `
    + 'Vui lòng thử đặt lại sau ít phút hoặc hoàn tất thanh toán cho các đơn đang giữ.',
    'ABUSE_HOLD_BLOCKED',
    { soLan: cacLan.length, nguong, gioCuaSo, chanDen });
}

// ĐẶT SÂN (lẻ 1 ngày hoặc cố định nhiều ngày). Tất cả trong 1 giao dịch, lỗi giữa chừng thì không lưu gì:
//  1) khoá sân, 2) kiểm tra từng ngày còn trống + tính tiền, 3) (cố định) tạo LichCoDinh,
//  4) mỗi ngày tạo 1 DatSan ở trạng thái pending_payment, giữ chỗ 10 phút, chia hoa hồng nền tảng,
//  5) tạo 1 ThanhToan (QR) cho cả chuỗi, gắn vào đơn đầu tiên.
async function taoDatSan(maNguoiDung, duLieu, ngayKetThuc = duLieu.ngay) {
  const cacNgay = taoDanhSachNgay(duLieu.ngay, ngayKetThuc);
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    await kiemTraChongGiuSanAo(ketNoi, maNguoiDung);
    const san = await layThongTinSan(duLieu.maSan, ketNoi, true);
    await kiemTraKhoaDatMoi(ketNoi, san.maChuSan);
    const lienHe = await layThongTinLienHe(maNguoiDung, duLieu, ketNoi);
    const cacMucGia = [];
    for (const ngay of cacNgay) {
      if (!await kiemTraKhungDat(san, ngay, duLieu.gioBatDau, duLieu.gioKetThuc, ketNoi)) {
        throw AppError.biTrung(`Sân đã có lịch hoặc bị khóa vào ngày ${ngay}`);
      }
      cacMucGia.push(await tinhTongTien(
        san.maCoSo, ngay, duLieu.gioBatDau, duLieu.gioKetThuc,
        ngayKetThuc === duLieu.ngay ? 'walk_in' : 'fixed', ketNoi));
    }

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='expired'
       WHERE MaSan=? AND NgayChoi IN (${cacNgay.map(() => '?').join(',')})
         AND TrangThai='pending_payment' AND HetHanGiuCho<=NOW()`,
      [san.maSan, ...cacNgay]);
    const [lich] = ngayKetThuc === duLieu.ngay
      ? [{ insertId: null }]
      : await ketNoi.query(
        `INSERT INTO LichCoDinh
         (MaSan, MaKhachHang, TenKhach, SoDienThoai, CacThu, NgayBatDau, NgayKetThuc,
          GioBatDau, GioKetThuc, SoPhut, DonGiaMoiBuoi, GhiChu, MaNguoiTao)
         VALUES (?,?,?,?, 'T2,T3,T4,T5,T6,T7,CN', ?,?,?,?,?,?,?,?)`,
        [
          san.maSan, maNguoiDung, lienHe.tenKhach, lienHe.soDienThoai, duLieu.ngay, ngayKetThuc,
          duLieu.gioBatDau, duLieu.gioKetThuc,
          doiGioRaPhut(duLieu.gioKetThuc) - doiGioRaPhut(duLieu.gioBatDau),
          cacMucGia[0], duLieu.ghiChu || null, maNguoiDung,
        ]);
    const maLichCoDinh = lich.insertId;
    const phiLe = await layCauHinhSo(ketNoi, 'commission_rate', 0);
    const soPhut = doiGioRaPhut(duLieu.gioKetThuc) - doiGioRaPhut(duLieu.gioBatDau);
    const cacDon = [];
    for (let viTri = 0; viTri < cacNgay.length; viTri += 1) {
      const maDon = taoMaDon();
      const tongTien = cacMucGia[viTri];
      const phiNenTang = Math.round(tongTien * phiLe / 100);
      const [don] = await ketNoi.query(
        `INSERT INTO DatSan
         (MaDon, MaKhachHang, TenKhach, SoDienThoaiLienHe, GhiChu, Nguon, LoaiKhach,
          MaLichCoDinh, MaSan, NgayChoi, GioBatDau, GioKetThuc, SoPhut, TongTien,
          PhiNenTang, TienChuSan, TrangThai, HetHanGiuCho)
         VALUES (?,?,?,?,?,'app',?,?,?,?,?,?,?,?,?,?,'pending_payment',
           DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [
          maDon, maNguoiDung, lienHe.tenKhach, lienHe.soDienThoai, duLieu.ghiChu || null,
          ngayKetThuc === duLieu.ngay ? 'walk_in' : 'fixed', maLichCoDinh,
          san.maSan, cacNgay[viTri], duLieu.gioBatDau, duLieu.gioKetThuc, soPhut, tongTien,
          phiNenTang, tongTien - phiNenTang, await layCauHinhSo(ketNoi, 'hold_minutes', 10),
        ]);
      cacDon.push({ maDatSan: don.insertId, maDon, ngay: cacNgay[viTri], tongTien });
    }
    // Task 2.1: đơn mới là nhóm 1 dòng (MaNhomDat = MaDatSan); đặt nhiều sân (2.3) sẽ gom nhiều dòng vào một nhóm.
    await ketNoi.query(
      `UPDATE DatSan SET MaNhomDat = MaDatSan WHERE MaDatSan IN (${cacDon.map(() => '?').join(',')})`,
      cacDon.map((don) => don.maDatSan));
    const tongTien = cacMucGia.reduce((tong, gia) => tong + gia, 0);
    const taiKhoanNhan = await layTaiKhoanChuSan(ketNoi, san.maChuSan);
    const anhQrUrl = taoAnhQrUrl(cacDon[0].maDon, tongTien, taiKhoanNhan);
    const maQr = taoNoiDungQr(cacDon[0].maDon, tongTien, taiKhoanNhan);
    const [thanhToan] = await ketNoi.query(
      `INSERT INTO ThanhToan (MaDatSan, SoTien, NoiDungChuyenKhoan)
       VALUES (?,?,?)`,
      [cacDon[0].maDatSan, tongTien, cacDon[0].maDon]);
    // Thông báo "Đặt lịch thành công" cho khách + báo chủ sân có đơn mới (đơn chưa được duyệt).
    const khungGio = `${duLieu.gioBatDau}–${duLieu.gioKetThuc}`;
    const moTaLich = cacNgay.length === 1
      ? `ngày ${dinhDangNgay(cacNgay[0])}, ${khungGio}`
      : `${cacNgay.length} buổi từ ${dinhDangNgay(cacNgay[0])} đến ${dinhDangNgay(cacNgay.at(-1))}, ${khungGio}`;
    await guiThongBao(ketNoi, {
      maNguoiDung,
      loai: 'booking_created',
      tieuDe: 'Đặt lịch thành công',
      noiDung: `Bạn đã đặt ${san.tenSan} - ${san.tenCoSo} ${moTaLich} (mã ${cacDon[0].maDon}). `
        + `Vui lòng chuyển khoản ${dinhDangTien(tongTien)} và gửi ảnh để chủ sân duyệt.`,
      loaiThamChieu: 'booking',
      maThamChieu: cacDon[0].maDatSan,
      khoa: `booking_created:${cacDon[0].maDatSan}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: san.maChuSan,
      loai: 'new_booking_for_owner',
      tieuDe: 'Có đơn đặt sân mới',
      noiDung: `${lienHe.tenKhach} đặt ${san.tenSan} - ${san.tenCoSo} ${moTaLich} `
        + `(${dinhDangTien(tongTien)}). Đơn đang chờ khách thanh toán.`,
      loaiThamChieu: 'booking',
      maThamChieu: cacDon[0].maDatSan,
      khoa: `new_booking_for_owner:${cacDon[0].maDatSan}`,
    });
    return {
      maLichCoDinh,
      cacDon,
      tongTien,
      maThanhToan: thanhToan.insertId,
      maDonThanhToan: cacDon[0].maDon,
      anhQrUrl,
      maQr,
      soNgay: cacNgay.length,
    };
  });
  return ketQua;
}

// 'YYYY-MM-DD HH:MM:SS' (giờ +07:00, do pool dùng dateStrings) → ISO 'YYYY-MM-DDTHH:MM:SS+07:00'.
function dinhDangThoiDiemISO(thoiDiem) {
  const khop = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(String(thoiDiem));
  return khop ? `${khop[1]}T${khop[2]}+07:00` : String(thoiDiem);
}

// Khóa các hàng San theo maSan TĂNG DẦN (1 câu lệnh, ORDER BY khóa chính) rồi mới khóa CoSo.
// Thứ tự San → CoSo trùng `layThongTinSan` (đặt lẻ khóa San rồi CoSo trong cùng câu JOIN), và thứ tự
// tăng dần giúp hai yêu cầu chéo nhau (A: 31→32, B: 32→31) không deadlock (DAT_NHIEU… mục 5, bước 2).
// Trả { coSo, cacSan: Map(maSan → { maSan, tenSan }) }.
async function khoaSanVaCoSo(ketNoi, maCoSo, cacMuc) {
  const cacMaSan = [...new Set(cacMuc.map((muc) => muc.maSan))].sort((a, b) => a - b);
  const [cacHang] = await ketNoi.query(
    `SELECT MaSan AS maSan, MaCoSo AS maCoSo, TenSan AS tenSan, TrangThai AS trangThaiSan
     FROM San WHERE MaSan IN (${cacMaSan.map(() => '?').join(',')}) AND ${SAN_CHUA_XOA()}
     ORDER BY MaSan ASC FOR UPDATE`,
    cacMaSan);
  const cacSan = new Map(cacHang.map((hang) => [hang.maSan, hang]));
  if (cacMaSan.some((maSan) => !cacSan.has(maSan) || cacSan.get(maSan).trangThaiSan !== 'active')) {
    throw AppError.khongTimThay('Không tìm thấy sân đang hoạt động');
  }
  const cacLoiSan = [];
  cacMuc.forEach((muc, chiSo) => {
    if (cacSan.get(muc.maSan).maCoSo !== maCoSo) {
      cacLoiSan.push({ truong: `cacMuc[${chiSo}].maSan`, thongBao: 'Sân không thuộc cơ sở đã chọn.' });
    }
  });
  if (cacLoiSan.length > 0) throw AppError.duLieuKhongHopLe('Sân không thuộc cơ sở đã chọn.', cacLoiSan);

  const [[coSo]] = await ketNoi.query(
    `SELECT MaCoSo AS maCoSo, TenCoSo AS tenCoSo, GioMoCua AS gioMoCua, GioDongCua AS gioDongCua,
       SoPhutDatToiThieu AS soPhutDatToiThieu, MaChuSan AS maChuSan
     FROM CoSo WHERE MaCoSo=? AND TrangThai='active' FOR UPDATE`,
    [maCoSo]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở đang hoạt động');
  return { coSo, cacSan };
}

// Lỗi 400 theo từng cụm: ngoài giờ mở cửa, bắt đầu không ở tương lai. Gom đủ để khách sửa một lượt.
function timLoiCum(coSo, cacCum, cacSan) {
  const cacLoi = [];
  let daBaoNgayQuaKhu = false;
  for (const cum of cacCum) {
    const tenSan = cacSan.get(cum.maSan).tenSan;
    const nhan = `${tenSan}, ${cum.gioBatDau}–${cum.gioKetThuc}`;
    if (doiGioRaPhut(cum.gioBatDau) < doiGioRaPhut(coSo.gioMoCua)
      || doiGioRaPhut(cum.gioKetThuc) > doiGioRaPhut(coSo.gioDongCua)) {
      cacLoi.push({
        truong: 'cacMuc',
        thongBao: `${nhan}: ngoài giờ hoạt động (${String(coSo.gioMoCua).slice(0, 5)}–${String(coSo.gioDongCua).slice(0, 5)}).`,
        maSan: cum.maSan, ngay: cum.ngay, gioBatDau: cum.gioBatDau, gioKetThuc: cum.gioKetThuc,
      });
    }
    try {
      kiemTraBatDauTuongLai(cum.ngay, cum.gioBatDau);
    } catch (loi) {
      if (!(loi instanceof AppError)) throw loi;
      if (loi.chiTiet?.[0]?.truong === 'ngay') {
        if (!daBaoNgayQuaKhu) cacLoi.push(loi.chiTiet[0]);
        daBaoNgayQuaKhu = true;
      } else {
        cacLoi.push({
          truong: 'cacMuc',
          thongBao: `${nhan}: giờ bắt đầu phải sau giờ hiện tại.`,
          maSan: cum.maSan, ngay: cum.ngay, gioBatDau: cum.gioBatDau, gioKetThuc: cum.gioKetThuc,
        });
      }
    }
  }
  return cacLoi;
}

// ĐẶT NHIỀU SÂN / NHIỀU KHUNG GIỜ (1 cơ sở, 1 ngày, 1 QR) — DAT_NHIEU_SAN_NHIEU_KHUNG_GIO.md mục 5.
// Một giao dịch, TẤT CẢ HOẶC KHÔNG: có cụm trùng thì ném 409 (rollback), không giữ cụm nào.
//  1) khóa San tăng dần + CoSo, 2) gộp mục chọn thành cụm (gopKhoiLienKe), 3) kiểm cụm ngắn / giờ / quá khứ (400),
//  4) gom MỌI cụm trùng đơn đang giữ hoặc bị khóa (409), 5) tính giá, 6) mỗi cụm = 1 đơn con (cùng MaNhomDat,
//  cùng HetHanGiuCho), 7) 1 ThanhToan gắn đơn đầu nhóm, 8) 1 thông báo cho khách và 1 cho chủ sân.
async function taoDatNhieuSan(maNguoiDung, duLieu) {
  const { maCoSo, ngay, cacMuc } = duLieu;
  kiemTraNgay(ngay);
  return thucHienGiaoDich(async (ketNoi) => {
    await kiemTraChongGiuSanAo(ketNoi, maNguoiDung);
    const { coSo, cacSan } = await khoaSanVaCoSo(ketNoi, maCoSo, cacMuc);
    await kiemTraKhoaDatMoi(ketNoi, coSo.maChuSan);
    const lienHe = await layThongTinLienHe(maNguoiDung, duLieu, ketNoi);

    const { cacCum, cacCumNgan } = gopKhoiLienKe(
      cacMuc.map((muc) => ({ maSan: muc.maSan, ngay, gioBatDau: muc.gioBatDau, gioKetThuc: muc.gioKetThuc })),
      coSo.soPhutDatToiThieu);
    if (cacCumNgan.length > 0) {
      // Đặc tả mục 4: 400 kèm chiTiet = { cacCumNgan } (object, như 409 cacCumTrung). `thongBao` đọc được ngay
      // vì app hiện message của server; số liệu từng cụm nằm trong chiTiet.cacCumNgan để tô đúng cụm.
      const dau = cacCumNgan[0];
      const them = cacCumNgan.length > 1 ? ` (và ${cacCumNgan.length - 1} khung khác)` : '';
      throw AppError.duLieuKhongHopLe(
        `${cacSan.get(dau.maSan).tenSan}, ${dau.gioBatDau}–${dau.gioKetThuc} chỉ ${dau.soPhut} phút, `
        + `tối thiểu ${dau.soPhutToiThieu} phút${them}.`,
        { cacCumNgan });
    }
    const cacLoiCum = timLoiCum(coSo, cacCum, cacSan);
    if (cacLoiCum.length > 0) throw AppError.duLieuKhongHopLe(cacLoiCum[0].thongBao, cacLoiCum);

    // Gom đủ mọi cụm trùng rồi mới trả (không dừng ở cụm đầu) để khách sửa riêng các cụm đó (quyết định H#2).
    const cacCumTrung = [];
    for (let chiSo = 0; chiSo < cacCum.length; chiSo += 1) {
      const cum = cacCum[chiSo];
      const [[donTrung]] = await ketNoi.query(
        `SELECT MaDatSan FROM DatSan
         WHERE MaSan=? AND NgayChoi=?
           AND ${SLOT_BAN()}
           AND GioBatDau<? AND GioKetThuc>? LIMIT 1 FOR UPDATE`,
        [cum.maSan, cum.ngay, cum.gioKetThuc, cum.gioBatDau]);
      let lyDo = donTrung ? 'booked' : null;
      if (!lyDo) {
        const [[khoaTrung]] = await ketNoi.query(
          `SELECT MaKhoa, MaSuKien FROM KhoaSan
           WHERE MaSan=? AND NgayKhoa=? AND GioBatDau<? AND GioKetThuc>? LIMIT 1 FOR UPDATE`,
          [cum.maSan, cum.ngay, cum.gioKetThuc, cum.gioBatDau]);
        if (khoaTrung) lyDo = khoaTrung.MaSuKien ? 'event' : 'locked';
      }
      if (lyDo) {
        cacCumTrung.push({
          chiSo, maSan: cum.maSan, tenSan: cacSan.get(cum.maSan).tenSan, ngay: cum.ngay,
          gioBatDau: cum.gioBatDau, gioKetThuc: cum.gioKetThuc, lyDo,
        });
      }
    }
    if (cacCumTrung.length > 0) {
      throw new AppError(409, 'Có khung giờ vừa được đặt hoặc bị khóa. Vui lòng chọn lại các khung giờ đó.',
        'CONFLICT', { cacCumTrung });
    }

    const cacGia = [];
    for (const cum of cacCum) {
      cacGia.push(await tinhTongTien(coSo.maCoSo, cum.ngay, cum.gioBatDau, cum.gioKetThuc, 'walk_in', ketNoi));
    }
    const taiKhoanNhan = await layTaiKhoanChuSan(ketNoi, coSo.maChuSan);

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='expired'
       WHERE MaSan IN (${[...cacSan.keys()].map(() => '?').join(',')}) AND NgayChoi=?
         AND TrangThai='pending_payment' AND HetHanGiuCho<=NOW()`,
      [...cacSan.keys(), ngay]);

    const phiLe = await layCauHinhSo(ketNoi, 'commission_rate', 0);
    const phutGiuCho = await layCauHinhSo(ketNoi, 'hold_minutes', 10);
    // Tính 1 lần: mọi đơn con phải có CÙNG HetHanGiuCho (không để NOW() trượt qua giây khác giữa các câu INSERT).
    const [[{ hetHan }]] = await ketNoi.query(
      'SELECT DATE_ADD(NOW(), INTERVAL ? MINUTE) AS hetHan', [phutGiuCho]);

    const cacDon = [];
    let maNhomDat = null;
    for (let viTri = 0; viTri < cacCum.length; viTri += 1) {
      const cum = cacCum[viTri];
      const tongTien = cacGia[viTri];
      const phiNenTang = Math.round(tongTien * phiLe / 100);
      const maDon = taoMaDon();
      const [don] = await ketNoi.query(
        `INSERT INTO DatSan
         (MaDon, MaKhachHang, TenKhach, SoDienThoaiLienHe, GhiChu, Nguon, LoaiKhach,
          MaLichCoDinh, MaNhomDat, MaSan, NgayChoi, GioBatDau, GioKetThuc, SoPhut, TongTien,
          PhiNenTang, TienChuSan, TrangThai, HetHanGiuCho)
         VALUES (?,?,?,?,?,'app','walk_in',NULL,?,?,?,?,?,?,?,?,?,'pending_payment',?)`,
        [
          maDon, maNguoiDung, lienHe.tenKhach, lienHe.soDienThoai, duLieu.ghiChu || null,
          maNhomDat, cum.maSan, cum.ngay, cum.gioBatDau, cum.gioKetThuc, cum.soPhut, tongTien,
          phiNenTang, tongTien - phiNenTang, hetHan,
        ]);
      if (viTri === 0) {
        // Đơn đầu nhóm: MaNhomDat = chính MaDatSan; các đơn sau gán MaNhomDat này ngay lúc INSERT.
        maNhomDat = don.insertId;
        await ketNoi.query('UPDATE DatSan SET MaNhomDat = MaDatSan WHERE MaDatSan=?', [maNhomDat]);
      }
      cacDon.push({
        maDatSan: don.insertId, maDon, maSan: cum.maSan, tenSan: cacSan.get(cum.maSan).tenSan,
        ngay: cum.ngay, gioBatDau: cum.gioBatDau, gioKetThuc: cum.gioKetThuc, tongTien,
      });
    }

    const tongTien = cacGia.reduce((tong, gia) => tong + gia, 0);
    const anhQrUrl = taoAnhQrUrl(cacDon[0].maDon, tongTien, taiKhoanNhan);
    const maQr = taoNoiDungQr(cacDon[0].maDon, tongTien, taiKhoanNhan);
    const [thanhToan] = await ketNoi.query(
      `INSERT INTO ThanhToan (MaDatSan, SoTien, NoiDungChuyenKhoan)
       VALUES (?,?,?)`,
      [cacDon[0].maDatSan, tongTien, cacDon[0].maDon]);

    const cacKhung = cacDon.map((don) => `${don.tenSan} ${don.gioBatDau}–${don.gioKetThuc}`);
    const moTaLich = `ngày ${dinhDangNgay(ngay)}: ${cacKhung.length <= 3
      ? cacKhung.join(', ')
      : `${cacKhung.slice(0, 3).join(', ')} và ${cacKhung.length - 3} khung khác`}`;
    await guiThongBao(ketNoi, {
      maNguoiDung,
      loai: 'booking_created',
      tieuDe: 'Đặt lịch thành công',
      noiDung: `Bạn đã đặt ${coSo.tenCoSo} ${moTaLich} (mã ${cacDon[0].maDon}). `
        + `Vui lòng chuyển khoản ${dinhDangTien(tongTien)} và gửi ảnh để chủ sân duyệt.`,
      loaiThamChieu: 'booking',
      maThamChieu: cacDon[0].maDatSan,
      khoa: `booking_created:${maNhomDat}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: coSo.maChuSan,
      loai: 'new_booking_for_owner',
      tieuDe: 'Có đơn đặt sân mới',
      noiDung: `${lienHe.tenKhach} đặt ${coSo.tenCoSo} ${moTaLich} `
        + `(${dinhDangTien(tongTien)}). Đơn đang chờ khách thanh toán.`,
      loaiThamChieu: 'booking',
      maThamChieu: cacDon[0].maDatSan,
      khoa: `new_booking_for_owner:${maNhomDat}`,
    });
    return {
      maNhomDat,
      ngay,
      cacDon,
      tongTien,
      maThanhToan: thanhToan.insertId,
      maDonThanhToan: cacDon[0].maDon,
      anhQrUrl,
      maQr,
      hetHanGiuCho: dinhDangThoiDiemISO(hetHan),
    };
  });
}

// Khoảng cách đường chim bay (mét) giữa 2 toạ độ.
function khoangCachMet(viDo1, kinhDo1, viDo2, kinhDo2) {
  const rad = (do_) => (do_ * Math.PI) / 180;
  const dLat = rad(viDo2 - viDo1);
  const dLng = rad(kinhDo2 - kinhDo1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(viDo1)) * Math.cos(rad(viDo2)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Giá/giờ (vãng lai) của một cơ sở:
//  - có ngày + giờ: giá/giờ trung bình của đúng khung đã chọn (cùng cách tính với tinhTongTien);
//  - không chọn khung: mọi mức giá trong bảng giá, cơ sở đạt khi CÓ mức nằm trong khoảng.
// `giaXep` là giá dùng để xếp cơ sở từ rẻ → đắt (không trả ra ngoài): có khung giờ thì bằng
// giá/giờ trung bình của khung; không có thì là mức giá thấp nhất nằm trong khoảng.
function giaPhuHopKhoang(cacGia, boLoc, batDau, ketThuc, giaToiThieu, giaToiDa) {
  const trongKhoang = (gia) => gia >= giaToiThieu && gia <= giaToiDa;
  if (boLoc.ngay) {
    const thu = thuTuNgay(boLoc.ngay);
    const bang = cacGia.filter((g) => g.thu === thu);
    let tong = 0;
    for (let phut = batDau; phut < ketThuc; phut += 30) {
      const khung = bang.find((g) => doiGioRaPhut(String(g.gioBatDau).slice(0, 5)) <= phut
        && doiGioRaPhut(String(g.gioKetThuc).slice(0, 5)) >= phut + 30);
      if (!khung) return { dat: false, giaMoiGio: null, giaXep: null };
      tong += Number(khung.giaMoiGio);
    }
    const giaMoiGio = Math.round(tong / ((ketThuc - batDau) / 30));
    return { dat: trongKhoang(giaMoiGio), giaMoiGio, giaXep: giaMoiGio };
  }
  const giaTrongKhoang = cacGia.map((g) => Number(g.giaMoiGio)).filter(trongKhoang);
  return {
    dat: giaTrongKhoang.length > 0,
    giaMoiGio: null,
    giaXep: giaTrongKhoang.length ? Math.min(...giaTrongKhoang) : null,
  };
}

// Tìm cơ sở có sân phù hợp. Mọi tiêu chí đều tuỳ chọn và CÙNG áp dụng (AND):
//  - ngày + giờ bắt đầu + giờ kết thúc: đi chung bộ 3 (validator đã ép), lọc sân còn trống;
//  - tinhThanh [+ quanHuyen]: lọc khu vực (quận chỉ hợp lệ khi có tỉnh);
//  - giaToiThieu + giaToiDa: đi chung cặp, lọc theo giá/giờ;
//  - Sắp xếp: có lọc giá → giá/giờ rẻ nhất → đắt nhất (ưu tiên số 1);
//    sau đó (hoặc khi không lọc giá) có GPS → gần → xa, cơ sở chưa có toạ độ xếp cuối;
//    không có GPS: điểm đánh giá cao → thấp.
async function timCoSo(boLoc) {
  const coKhungGio = Boolean(boLoc.ngay && boLoc.gioBatDau && boLoc.gioKetThuc);
  if (Boolean(boLoc.ngay) !== Boolean(boLoc.gioBatDau) || Boolean(boLoc.ngay) !== Boolean(boLoc.gioKetThuc)) {
    throw AppError.duLieuKhongHopLe('Cần chọn đủ ngày, giờ bắt đầu và giờ kết thúc.');
  }
  const coGia = boLoc.giaToiThieu !== undefined || boLoc.giaToiDa !== undefined;
  if (coGia && (boLoc.giaToiThieu === undefined || boLoc.giaToiDa === undefined)) {
    throw AppError.duLieuKhongHopLe('Cần nhập đủ giá tối thiểu và giá tối đa.');
  }
  if (coGia && boLoc.giaToiThieu > boLoc.giaToiDa) {
    throw AppError.duLieuKhongHopLe('Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.');
  }
  if (boLoc.quanHuyen && !boLoc.tinhThanh) {
    throw AppError.duLieuKhongHopLe('Cần chọn Tỉnh/Thành phố trước khi chọn Quận/Huyện.');
  }
  const coViTri = boLoc.viDo !== undefined && boLoc.kinhDo !== undefined;

  let batDau = 0;
  let ketThuc = 0;
  const dieuKien = [];
  const thamSo = [];
  if (coKhungGio) {
    kiemTraNgay(boLoc.ngay);
    kiemTraBatDauTuongLai(boLoc.ngay, boLoc.gioBatDau);
    batDau = doiGioRaPhut(boLoc.gioBatDau);
    ketThuc = doiGioRaPhut(boLoc.gioKetThuc);
    if (ketThuc <= batDau || batDau % 30 !== 0 || ketThuc % 30 !== 0) {
      throw AppError.duLieuKhongHopLe('Khung giờ phải tăng dần và theo mốc 30 phút');
    }
    dieuKien.push(`NOT EXISTS (
         SELECT 1 FROM DatSan d WHERE d.MaSan=s.MaSan AND d.NgayChoi=?
           AND ${SLOT_BAN('d')}
           AND d.GioBatDau<? AND d.GioKetThuc>?
       )`, `NOT EXISTS (
         SELECT 1 FROM KhoaSan k WHERE k.MaSan=s.MaSan AND k.NgayKhoa=?
           AND k.GioBatDau<? AND k.GioKetThuc>?
       )`);
    thamSo.push(boLoc.ngay, boLoc.gioKetThuc, boLoc.gioBatDau,
      boLoc.ngay, boLoc.gioKetThuc, boLoc.gioBatDau);
  }
  if (boLoc.tinhThanh) {
    dieuKien.push('cs.TinhThanh=?');
    thamSo.push(boLoc.tinhThanh);
  }
  if (boLoc.quanHuyen) {
    dieuKien.push('cs.QuanHuyen=?');
    thamSo.push(boLoc.quanHuyen);
  }
  const [cacSan] = await pool.query(
    `SELECT cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi,
       cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen, cs.GiaThapNhat AS giaThapNhat,
       cs.GioMoCua AS gioMoCua, cs.GioDongCua AS gioDongCua,
       cs.SoPhutDatToiThieu AS soPhutDatToiThieu,
       cs.ViDo AS viDo, cs.KinhDo AS kinhDo,
       cs.SoDienThoai AS soDienThoai, cs.LinkBanDo AS linkBanDo,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia,
       s.MaSan AS maSan, s.TenSan AS tenSan,
       COALESCE((SELECT a.DuongDan FROM AnhCoSo a WHERE a.MaCoSo=cs.MaCoSo AND a.LaAnhBia=1
        ORDER BY a.ThuTu, a.MaAnh LIMIT 1), '${ANH_MAC_DINH.coso}') AS duongDanAnh
     FROM CoSo cs JOIN San s ON s.MaCoSo=cs.MaCoSo
     WHERE cs.TrangThai='active' AND s.TrangThai='active' AND ${SAN_CHUA_XOA('s')}
       ${dieuKien.map((dk) => `AND ${dk}`).join('\n       ')}`,
    thamSo);

  let ketQua = cacSan;
  if (coKhungGio) {
    // Lọc theo giờ mở/đóng cửa + thời lượng tối thiểu (khung giờ nằm trong ngày nên lọc ở đây).
    ketQua = ketQua.filter((san) =>
      batDau >= doiGioRaPhut(san.gioMoCua)
      && ketThuc <= doiGioRaPhut(san.gioDongCua)
      && ketThuc - batDau >= san.soPhutDatToiThieu);
  }

  const giaTheoCoSo = new Map();
  if (coGia && ketQua.length) {
    const cacMaCoSo = [...new Set(ketQua.map((san) => san.maCoSo))];
    const [bangGia] = await pool.query(
      `SELECT MaCoSo AS maCoSo, Thu AS thu, GioBatDau AS gioBatDau,
         GioKetThuc AS gioKetThuc, GiaMoiGio AS giaMoiGio
       FROM BangGia WHERE LoaiKhach='walk_in' AND MaCoSo IN (?)`,
      [cacMaCoSo]);
    const theoCoSo = new Map();
    for (const gia of bangGia) {
      if (!theoCoSo.has(gia.maCoSo)) theoCoSo.set(gia.maCoSo, []);
      theoCoSo.get(gia.maCoSo).push(gia);
    }
    for (const maCoSo of cacMaCoSo) {
      giaTheoCoSo.set(maCoSo, giaPhuHopKhoang(
        theoCoSo.get(maCoSo) || [], boLoc, batDau, ketThuc, boLoc.giaToiThieu, boLoc.giaToiDa));
    }
    ketQua = ketQua.filter((san) => giaTheoCoSo.get(san.maCoSo).dat);
  }

  ketQua = ketQua.map((san) => {
    const { viDo, kinhDo, ...con } = san;
    const coToaDo = viDo !== null && viDo !== undefined && kinhDo !== null && kinhDo !== undefined;
    return {
      ...con,
      viDo: coToaDo ? Number(viDo) : null,
      kinhDo: coToaDo ? Number(kinhDo) : null,
      khoangCachMet: coViTri && coToaDo
        ? Math.round(khoangCachMet(boLoc.viDo, boLoc.kinhDo, Number(viDo), Number(kinhDo)))
        : null,
      ...(giaTheoCoSo.get(san.maCoSo)?.giaMoiGio != null
        ? { giaMoiGio: giaTheoCoSo.get(san.maCoSo).giaMoiGio } : {}),
    };
  });

  // Sắp xếp: có lọc giá → rẻ → đắt (ưu tiên trước); hoà giá/không lọc giá → có GPS thì
  // gần → xa (chưa có toạ độ xếp cuối); còn hoà/không GPS → sao cao → thấp.
  const diem = (san) => Number(san.diemTrungBinh) || 0;
  ketQua.sort((a, b) => {
    if (coGia) {
      const giaA = giaTheoCoSo.get(a.maCoSo)?.giaXep ?? Infinity;
      const giaB = giaTheoCoSo.get(b.maCoSo)?.giaXep ?? Infinity;
      if (giaA !== giaB) return giaA - giaB;
    }
    if (coViTri) {
      if (a.khoangCachMet === null && b.khoangCachMet !== null) return 1;
      if (a.khoangCachMet !== null && b.khoangCachMet === null) return -1;
      if (a.khoangCachMet !== b.khoangCachMet && a.khoangCachMet !== null) {
        return a.khoangCachMet - b.khoangCachMet;
      }
    }
    return diem(b) - diem(a)
      || (b.soDanhGia || 0) - (a.soDanhGia || 0)
      || a.maCoSo - b.maCoSo
      || a.maSan - b.maSan;
  });
  return ketQua;
}

async function layDanhSachCoSo() {
  const [cacCoSo] = await pool.query(
    `SELECT cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi,
       cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen, cs.GiaThapNhat AS giaThapNhat,
       cs.GioMoCua AS gioMoCua, cs.GioDongCua AS gioDongCua,
       cs.SoPhutDatToiThieu AS soPhutDatToiThieu,
       cs.ViDo AS viDo, cs.KinhDo AS kinhDo,
       cs.SoDienThoai AS soDienThoai, cs.LinkBanDo AS linkBanDo,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia,
       (SELECT COUNT(*) FROM San s WHERE s.MaCoSo=cs.MaCoSo AND s.TrangThai='active' AND ${SAN_CHUA_XOA('s')}) AS soSan,
       COALESCE((SELECT a.DuongDan FROM AnhCoSo a WHERE a.MaCoSo=cs.MaCoSo AND a.LaAnhBia=1
        ORDER BY a.ThuTu, a.MaAnh LIMIT 1), '${ANH_MAC_DINH.coso}') AS duongDanAnh
     FROM CoSo cs
     WHERE cs.TrangThai='active'
       AND EXISTS (SELECT 1 FROM San s WHERE s.MaCoSo=cs.MaCoSo AND s.TrangThai='active' AND ${SAN_CHUA_XOA('s')})
     ORDER BY cs.DiemTrungBinh DESC, cs.MaCoSo`);
  return cacCoSo;
}

async function layChiTietCoSo(maCoSo) {
  const [[coSo]] = await pool.query(
    `SELECT MaCoSo AS maCoSo, TenCoSo AS tenCoSo, DiaChi AS diaChi,
       SoDienThoai AS soDienThoai, LinkBanDo AS linkBanDo,
       TinhThanh AS tinhThanh, QuanHuyen AS quanHuyen, MoTa AS moTa,
       GioMoCua AS gioMoCua, GioDongCua AS gioDongCua,
       SoPhutDatToiThieu AS soPhutDatToiThieu, SoPhutTreToiDa AS soPhutTreToiDa,
       GiaThapNhat AS giaThapNhat, DiemTrungBinh AS diemTrungBinh, SoDanhGia AS soDanhGia
     FROM CoSo WHERE MaCoSo=? AND TrangThai='active'`,
    [maCoSo]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở đang hoạt động');
  const [cacSan] = await pool.query(
    `SELECT MaSan AS maSan, TenSan AS tenSan FROM San
     WHERE MaCoSo=? AND TrangThai='active' AND ${SAN_CHUA_XOA()} ORDER BY MaSan`,
    [maCoSo]);
  const [anh] = await pool.query(
    `SELECT DuongDan AS duongDan, LaAnhBia AS laAnhBia FROM AnhCoSo
     WHERE MaCoSo=? ORDER BY LaAnhBia DESC, ThuTu, MaAnh`,
    [maCoSo]);
  // Ảnh bìa tính riêng (laAnhBia=1, luôn đứng đầu); chưa có bìa → chèn ảnh cơ sở mặc định làm bìa.
  // Ảnh sân (laAnhBia=0) theo sau, tối đa 12.
  const coBia = anh.some((a) => a.laAnhBia);
  return { ...coSo, cacSan, anh: coBia ? anh : [{ duongDan: ANH_MAC_DINH.coso, laAnhBia: 1 }, ...anh] };
}

// Sân từng bị đóng (phân biệt với sân mới tạo chưa mở, cũng ở trạng thái maintenance).
const DA_TUNG_DONG = (bi) => `EXISTS (SELECT 1 FROM NhatKyHeThong nk
  WHERE nk.DoiTuong='San' AND nk.MaDoiTuong=${bi}.MaSan AND nk.HanhDong='dong_san')`;

async function layChiTietSan(maSan) {
  const [[san]] = await pool.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan, cs.MaCoSo AS maCoSo,
       cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi, cs.TinhThanh AS tinhThanh,
       cs.QuanHuyen AS quanHuyen, cs.MoTa AS moTa, cs.GioMoCua AS gioMoCua,
       cs.GioDongCua AS gioDongCua, cs.SoPhutDatToiThieu AS soPhutDatToiThieu,
       cs.SoPhutTreToiDa AS soPhutTreToiDa,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia,
       (s.TrangThai='maintenance') AS tamDong
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND ${SAN_CHUA_XOA('s')} AND cs.TrangThai='active'
       AND (s.TrangThai='active' OR (s.TrangThai='maintenance' AND ${DA_TUNG_DONG('s')}))`,
    [maSan]);
  if (!san) throw AppError.khongTimThay('Không tìm thấy sân đang hoạt động');
  san.tamDong = !!Number(san.tamDong); // G9.B2: sân tạm đóng trả 200 + tamDong:true thay vì 404
  const [bangGia] = await pool.query(
    `SELECT Thu AS thu, LoaiNgay AS loaiNgay, LoaiKhach AS loaiKhach,
       GioBatDau AS gioBatDau, GioKetThuc AS gioKetThuc, GiaMoiGio AS giaMoiGio
     FROM BangGia WHERE MaCoSo=? ORDER BY Thu, LoaiKhach, GioBatDau`,
    [san.maCoSo]);
  return { ...san, bangGia };
}

async function kiemTraTrong(maSan, boLoc) {
  const san = await layThongTinSan(maSan);
  const conTrong = await kiemTraKhungDat(san, boLoc.ngay, boLoc.gioBatDau, boLoc.gioKetThuc);
  return { maSan, ngay: boLoc.ngay, gioBatDau: boLoc.gioBatDau, gioKetThuc: boLoc.gioKetThuc, conTrong };
}

async function layLichNgay(maCoSo, ngay) {
  kiemTraNgay(ngay);
  const [[coSo]] = await pool.query(
    `SELECT MaCoSo AS maCoSo, TenCoSo AS tenCoSo, DiaChi AS diaChi, SoDienThoai AS soDienThoai,
       GioMoCua AS gioMoCua, GioDongCua AS gioDongCua, SoPhutDatToiThieu AS soPhutDatToiThieu,
       SoPhutTreToiDa AS soPhutTreToiDa
     FROM CoSo WHERE MaCoSo=? AND TrangThai='active'`,
    [maCoSo]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở đang hoạt động');
  // G9.B2: sân đã được chủ sân/admin ĐÓNG (maintenance + có nhật ký dong_san) vẫn hiện kèm `tamDong:true`, không có ô đặt được.
  // Sân mới tạo chưa từng mở (cũng maintenance nhưng chưa có nhật ký đóng) thì KHÔNG hiện cho khách.
  const [cacSan] = await pool.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan, (s.TrangThai='maintenance') AS tamDong FROM San s
     WHERE s.MaCoSo=? AND ${SAN_CHUA_XOA('s')} AND (s.TrangThai='active' OR (s.TrangThai='maintenance' AND ${DA_TUNG_DONG('s')}))
     ORDER BY s.MaSan`,
    [maCoSo]);
  const [cacDon] = await pool.query(
    `SELECT d.MaSan AS maSan, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan
     WHERE s.MaCoSo=? AND d.NgayChoi=?
       AND ${SLOT_BAN('d')}`,
    [maCoSo, ngay]);
  const [cacKhoa] = await pool.query(
    `SELECT k.MaSan AS maSan, k.GioBatDau AS gioBatDau, k.GioKetThuc AS gioKetThuc,
       (k.MaSuKien IS NOT NULL) AS laSuKien,
       CASE WHEN k.MaSuKien IS NOT NULL AND sk.BiAn=1 THEN 'Sân được giữ cho sự kiện'
         WHEN k.MaSuKien IS NOT NULL THEN CONCAT('Sự kiện: ', sk.TieuDe)
         ELSE k.LyDo END AS lyDo
     FROM KhoaSan k JOIN San s ON s.MaSan=k.MaSan
       LEFT JOIN SuKien sk ON sk.MaSuKien=k.MaSuKien
     WHERE s.MaCoSo=? AND k.NgayKhoa=?`,
    [maCoSo, ngay]);
  const [bangGia] = await pool.query(
    `SELECT GioBatDau AS gioBatDau, GioKetThuc AS gioKetThuc, GiaMoiGio AS giaMoiGio
     FROM BangGia WHERE MaCoSo=? AND Thu=? AND LoaiKhach='walk_in'
     ORDER BY GioBatDau`,
    [maCoSo, thuTuNgay(ngay)]);
  const gioNgan = (gio) => String(gio).slice(0, 5);
  // loai: 'booked' (đơn) · 'locked' (chủ sân khóa tay) · 'event' (sân được giữ cho sự kiện — app tô màu tím, chú thích "Sự kiện").
  const khungBan = (danhSach, loai, maSan) => danhSach
    .filter((muc) => muc.maSan === maSan)
    .map((muc) => ({
      gioBatDau: gioNgan(muc.gioBatDau), gioKetThuc: gioNgan(muc.gioKetThuc), loai,
      ...(loai !== 'booked' && muc.lyDo ? { lyDo: muc.lyDo } : {}),
    }));
  return {
    maCoSo: coSo.maCoSo,
    tenCoSo: coSo.tenCoSo,
    diaChi: coSo.diaChi,
    soDienThoai: coSo.soDienThoai,
    ngay,
    gioMoCua: gioNgan(coSo.gioMoCua),
    gioDongCua: gioNgan(coSo.gioDongCua),
    soPhutDatToiThieu: coSo.soPhutDatToiThieu,
    soPhutTreToiDa: coSo.soPhutTreToiDa,
    cacSan: cacSan.map((san) => ({
      maSan: san.maSan,
      tenSan: san.tenSan,
      tamDong: !!Number(san.tamDong),
      cacKhungBan: san.tamDong ? [] : [
        ...khungBan(cacDon, 'booked', san.maSan),
        ...khungBan(cacKhoa.filter((k) => !Number(k.laSuKien)), 'locked', san.maSan),
        ...khungBan(cacKhoa.filter((k) => Number(k.laSuKien)), 'event', san.maSan),
      ],
    })),
    bangGia: bangGia.map((khung) => ({
      gioBatDau: gioNgan(khung.gioBatDau),
      gioKetThuc: gioNgan(khung.gioKetThuc),
      giaMoiGio: Number(khung.giaMoiGio),
    })),
  };
}

async function lietKeDatSan(maNguoiDung) {
  await hetHanDatSan(maNguoiDung);
  const moSomPhut = await layCauHinhSo(pool, 'checkin_open_minutes', 30);
  const cauHinhDatGap = await chungTu.docCauHinhDatGap(pool);
  const [cacDon] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaLichCoDinh AS maLichCoDinh,
       d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       d.TongTien AS tongTien, d.TrangThai AS trangThai, d.Nguon AS nguon,
       t.TrangThai AS trangThaiThanhToan,
       t.NgayThanhToan AS ngayThanhToan, t.NgayGuiAnh AS ngayGuiAnh,
       -- G9.C8: chậm duyệt = quá HẠN XÁC NHẬN thật của thanh toán (HanXacNhan, G9.C3), không còn cộng phút cấu hình.
       (t.TrangThai='confirming' AND t.HanXacNhan IS NOT NULL AND t.HanXacNhan < NOW()) AS chamDuyet,
       (t.TrangThai='confirming') AS dangChoDuyet,
       t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan, t.LyDoLoi AS lyDoLoi,
       d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoaiLienHe,
       s.MaSan AS maSan, s.TenSan AS tenSan,
       -- G9.E: đơn bị chủ sân chuyển sân (sân cũ lấy cả sân đã xoá mềm để vẫn hiện tên)
       d.MaSanCu AS maSanCu, sc.TenSan AS tenSanCu, d.NgayChuyenSan AS ngayChuyenSan,
       d.NgayKhachDongYChuyen AS ngayDongYChuyenSan,
       (TIMESTAMP(d.NgayChoi, d.GioBatDau) <= NOW()) AS daDenGio,
       -- còn buổi nào của đợt hiệu lực mà KHÔNG nằm trong phạm vi từ chối chuyển sân (chưa chuyển / đã tới giờ)
       EXISTS (SELECT 1 FROM DatSan y WHERE d.MaSanCu IS NOT NULL
           AND CASE WHEN d.MaLichCoDinh IS NULL
             THEN COALESCE(y.MaNhomDat, y.MaDatSan) = COALESCE(d.MaNhomDat, d.MaDatSan) AND y.MaLichCoDinh IS NULL
             ELSE y.MaLichCoDinh = d.MaLichCoDinh END
           AND y.TrangThai IN ('pending_payment','confirmed')
           AND (y.MaSanCu IS NULL OR TIMESTAMP(y.NgayChoi, y.GioBatDau) <= NOW())) AS conBuoiNgoaiPhamViChuyen,
       -- G9: hạn hoàn theo loại + cờ đặt gấp (số phút từ mốc tính đến giờ chơi sớm nhất của đợt)
       ht.Loai AS loaiHoanTienTho, kr.TrangThai AS trangThaiKhieuNaiHoan,
       ${chungTu.sqlPhutDenGioChoiLucGui('d', 't')} AS phutDenGioChoiLucGui,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi, cs.LinkBanDo AS linkBanDo,
       dg.MaDanhGia AS maDanhGia, dg.SoSao AS soSaoDanhGia, dg.NoiDung AS noiDungDanhGia, dg.MaDatSan AS maDatSanDanhGia,
       dg.BiAn AS danhGiaBiAn, (dg.NgayTao + INTERVAL ${SO_NGAY_SUA_DANH_GIA} DAY >= NOW()) AS trongHanSuaDanhGia,
       kn.MaKhieuNai AS maKhieuNai, kn.TrangThai AS trangThaiKhieuNai,
       ci.ThoiDiem AS thoiDiemCheckIn,
       -- G4: khoản hoàn mới nhất của thanh toán (khách bấm Đã nhận / Chưa nhận theo maHoanTien)
       ht.MaHoanTien AS maHoanTien, ht.TrangThai AS trangThaiHoanTienChiTiet, ht.AnhChungTu AS anhChungTuHoan,
       ht.HanHoan AS hanHoan,
       (ht.TrangThai='refunded') AS coTheXacNhanNhanHoan,
       -- G9.C8: khiếu nại hoàn tiền ("Chưa nhận được tiền hoàn") mở khi khoản hoàn đã QUÁ HanHoan thật
       -- (cancel 3 ngày; owner_cancel/closure/incident 30'; theo HoanTien.Loai). HanHoan NULL (late_proof...) → chưa mở.
       kr.MaKhieuNai AS maKhieuNaiHoan,
       (ht.MaHoanTien IS NOT NULL AND kr.MaKhieuNai IS NULL AND ht.TrangThai IN ('processing','not_received','escalated')
         AND ht.HanHoan IS NOT NULL AND ht.HanHoan < NOW()) AS coTheKhieuNaiHoan,
       DATE_FORMAT(ht.HanHoan, '%Y-%m-%d %H:%i:%s') AS choKhieuNaiHoanDen,
       -- G3: nút "Quét QR check-in" hiện cả ngày chơi cho đơn hợp lệ chưa check-in; trongCuaSoCheckIn = đang trong cửa sổ
       -- thật (server tính bằng NOW()); quét ngoài cửa sổ vẫn được hướng dẫn liên hệ chủ sân (OUT_OF_WINDOW).
       (ci.MaCheckIn IS NULL AND d.Nguon='app'
         AND (d.TrangThai='confirmed' OR (d.TrangThai='pending_payment' AND t.TrangThai IN ('confirming','overdue')))
         AND d.NgayChoi=CURDATE() AND NOW() < TIMESTAMP(d.NgayChoi, d.GioKetThuc)) AS coTheCheckIn,
       (ci.MaCheckIn IS NULL
         AND NOW() >= TIMESTAMP(d.NgayChoi, d.GioBatDau) - INTERVAL ${Number(moSomPhut)} MINUTE
         AND NOW() <= TIMESTAMP(d.NgayChoi, d.GioBatDau) + INTERVAL cs.SoPhutTreToiDa MINUTE) AS trongCuaSoCheckIn
     FROM DatSan d
     JOIN San s ON s.MaSan=d.MaSan
     LEFT JOIN San sc ON sc.MaSan=d.MaSanCu
     JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     LEFT JOIN ThanhToan t ON t.MaDatSan=CASE
       WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
       ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
     END
     -- Đánh giá của đơn; đơn thuộc lịch cố định thì dùng chung đánh giá của cả lịch (mỗi lịch 1 đánh giá).
     LEFT JOIN DanhGia dg ON dg.MaDanhGia=(
       SELECT x.MaDanhGia FROM DanhGia x JOIN DatSan dx ON dx.MaDatSan=x.MaDatSan
       WHERE dx.MaDatSan=d.MaDatSan OR (d.MaLichCoDinh IS NOT NULL AND dx.MaLichCoDinh=d.MaLichCoDinh)
       ORDER BY (dx.MaDatSan=d.MaDatSan) DESC, x.MaDanhGia LIMIT 1)
     LEFT JOIN KhieuNai kn ON kn.MaDatSan=d.MaDatSan AND kn.Loai='service'
     LEFT JOIN CheckIn ci ON ci.MaDatSan=d.MaDatSan
     LEFT JOIN HoanTien ht ON ht.MaHoanTien=(SELECT MAX(h2.MaHoanTien) FROM HoanTien h2 WHERE h2.MaThanhToan=t.MaThanhToan)
     LEFT JOIN KhieuNai kr ON kr.MaDatSan=d.MaDatSan AND kr.Loai='refund'
     WHERE d.MaKhachHang=? ORDER BY d.NgayChoi DESC, d.GioBatDau DESC`,
    [maNguoiDung]);
  // G9: hạn hoàn (phút) theo loại khoản hoàn, đọc cấu hình 1 lần cho mỗi loại. Khiếu nại hoàn tiền đã được Admin chấp nhận
  // thì HanHoan đã bị đặt lại thành refund_grace_hours (complaintService) → nêu hạn mới, không nêu hạn gốc.
  const phutDatLaiHan = (await layCauHinhSo(pool, 'refund_grace_hours', 24)) * 60;
  const hanPhutTheoLoai = new Map();
  for (const loai of new Set(cacDon.map((don) => don.loaiHoanTienTho).filter(Boolean))) {
    hanPhutTheoLoai.set(loai, await hoanTienService.layHanHoanPhutChoKhach(pool, loai));
  }
  return cacDon.map(({
    maDanhGia, maKhieuNai, lyDoLoi, danhGiaBiAn, chamDuyet, dangChoDuyet, trongHanSuaDanhGia, coTheCheckIn, trongCuaSoCheckIn,
    anhChungTuHoan, coTheXacNhanNhanHoan, maKhieuNaiHoan, coTheKhieuNaiHoan, choKhieuNaiHoanDen,
    daDenGio, conBuoiNgoaiPhamViChuyen, loaiHoanTienTho, trangThaiKhieuNaiHoan, phutDenGioChoiLucGui, ...don
  }) => {
    const daDanhGia = maDanhGia != null;
    const daKhieuNai = maKhieuNai != null;
    // Lý do chủ sân từ chối ảnh chuyển khoản: chỉ có nghĩa khi thanh toán đang chờ gửi lại.
    const lyDoTuChoi = don.trangThaiThanhToan === 'pending' && lyDoLoi ? lyDoLoi : null;
    // G9.E6: nút "Từ chối chuyển sân" — điều kiện CẦN theo đúng các luật của tuChoiChuyenSan (buổi đã bị chuyển, còn hiệu lực,
    // chưa tới giờ chơi, chưa gửi ảnh chờ duyệt, không còn khoản hoàn dở, chưa trả tiền thì không còn buổi nào ngoài phạm vi chuyển).
    const hieuLuc = ['pending_payment', 'confirmed'].includes(don.trangThai);
    const dangHoanDo = ['waiting_info', 'processing', 'not_received', 'escalated'].includes(don.trangThaiHoanTienChiTiet);
    // G9.H: khách đã bấm "Đồng ý chuyển sân" thì chốt, không còn nút từ chối (chủ sân chuyển lại thì reset).
    const daDongYChuyenSan = don.maSanCu != null && don.ngayDongYChuyenSan != null;
    const coTheDongYChuyenSan = don.maSanCu != null && hieuLuc && !Number(daDenGio) && !daDongYChuyenSan;
    const coTheTuChoiChuyenSan = don.maSanCu != null && hieuLuc && !Number(daDenGio) && !daDongYChuyenSan
      && don.trangThaiThanhToan !== 'confirming' && !dangHoanDo
      && !(don.trangThaiThanhToan === 'pending' && Number(conBuoiNgoaiPhamViChuyen));
    // G9: hạn hoàn để nêu cho khách (null khi đơn không có khoản hoàn hoặc late_proof do Admin xử lý).
    const hanHoanPhut = trangThaiKhieuNaiHoan === 'upheld' && loaiHoanTienTho
      ? phutDatLaiHan : (hanPhutTheoLoai.get(loaiHoanTienTho) ?? null);
    // G9: đặt gấp do BE tính (null/false khi đơn không còn trong luồng chờ trả / chờ duyệt).
    const datGapDon = phutDenGioChoiLucGui == null
      ? { datGap: false, soPhutXacNhan: null }
      : chungTu.danhGiaDatGap(phutDenGioChoiLucGui, cauHinhDatGap);
    // `loaiHoanTien` KHÔNG đưa vào ganTrangThaiHienThi: tránh làm đơn `confirmed` + khoản overpay đổi sang mã
    // `paid_overpay_refund_pending` (trước giờ danh sách đơn của khách chưa bao giờ truyền loại hoàn tiền vào đó).
    return {
      ...ganTrangThaiHienThi({
        ...don,
        anhChungTuHoanUrl: anhChungTuHoan || null,
        coTheXacNhanNhanHoan: !!Number(coTheXacNhanNhanHoan),
        coTheCheckIn: !!Number(coTheCheckIn),
        trongCuaSoCheckIn: !!Number(trongCuaSoCheckIn),
        lyDoTuChoi,
        // Nút "Khiếu nại chủ sân" CHỈ còn cho đơn chủ sân chậm duyệt ảnh chuyển khoản (đã quá HanXacNhan).
        // Đã duyệt thanh toán / đã huỷ → không còn khiếu nại ngoài; tiền hoàn chậm dùng `coTheKhieuNaiHoan` bên dưới.
        daKhieuNai,
        chamDuyet: !!Number(chamDuyet),
        coTheKhieuNai: !daKhieuNai && don.nguon === 'app' && !!Number(dangChoDuyet) && !!Number(chamDuyet),
        // "Chưa nhận được tiền hoàn": hiện khi chủ sân chưa hoàn mà đã quá HanHoan; `choKhieuNaiHoanDen` = HanHoan (mốc được phép bấm).
        coTheKhieuNaiHoan: !!Number(coTheKhieuNaiHoan),
        daKhieuNaiHoan: maKhieuNaiHoan != null,
        choKhieuNaiHoanDen: choKhieuNaiHoanDen || null,
        daDanhGia,
        soSaoDanhGia: daDanhGia ? Number(don.soSaoDanhGia) : null,
        // Buổi đang giữ đánh giá (chính đơn này, hoặc buổi khác cùng lịch cố định): FE sửa/xoá theo mã này.
        maDatSanDanhGia: daDanhGia ? Number(don.maDatSanDanhGia) : null,
        // Đã check-in hoặc chơi xong (checked_in/completed) + đã thanh toán + chưa đánh giá (kể cả theo lịch cố định) → nút "Đánh giá sân".
        coTheDanhGia: !daDanhGia && coTheDanhGiaDon(don.trangThai, don.trangThaiThanhToan),
        // Sửa được trong 7 ngày kể từ lúc đánh giá và khi chưa bị admin ẩn (server tính, FE chỉ hiển thị).
        coTheSuaDanhGia: daDanhGia && !Number(danhGiaBiAn) && !!Number(trongHanSuaDanhGia),
      }),
      daChuyenSan: don.maSanCu != null,
      daDongYChuyenSan,
      coTheDongYChuyenSan,
      coTheTuChoiChuyenSan,
      loaiHoanTien: loaiHoanTienTho || null,
      hanHoanPhut,
      hanHoanChu: hanHoanPhut == null ? null : hoanTienService.dinhDangThoiGianPhut(hanHoanPhut),
      datGap: datGapDon.datGap,
      soPhutXacNhan: datGapDon.soPhutXacNhan,
    };
  });
}

async function layHoaDonNhap(maNguoiDung, maDatSan) {
  await hetHanDatSan(maNguoiDung);
  const [[hoaDon]] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaNhomDat AS maNhomDat, d.MaDon AS maDon, d.NgayChoi AS ngay,
       d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc, d.TongTien AS tongTien,
       d.TrangThai AS trangThaiDatSan, d.HetHanGiuCho AS hetHanGiuCho,
       TIMESTAMPDIFF(SECOND, NOW(), d.HetHanGiuCho) AS conLaiGiay,
       t.MaThanhToan AS maThanhToan, t.SoTien AS soTien, t.TrangThai AS trangThaiThanhToan,
       t.NoiDungChuyenKhoan AS noiDungChuyenKhoan, t.AnhChuyenKhoan AS anhChuyenKhoanUrl,
       t.NgayGuiAnh AS ngayGuiAnh, t.HanXacNhan AS hanXacNhan,
       TIMESTAMPDIFF(SECOND, NOW(), t.HanXacNhan) AS conLaiXacNhanGiay, t.LyDoLoi AS lyDoLoi,
       (t.TrangThai='confirming' AND t.HanXacNhan IS NOT NULL AND t.HanXacNhan < NOW()) AS chamDuyet,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan,
       ${chungTu.sqlPhutDenGioChoiLucGui('d', 't')} AS phutDenGioChoiLucGui
     FROM DatSan d JOIN ThanhToan t ON t.MaDatSan=CASE
       WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
       ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
     END
     WHERE d.MaDatSan=? AND d.MaKhachHang=?`,
    [maDatSan, maNguoiDung]);
  if (!hoaDon) throw AppError.khongTimThay('Không tìm thấy hóa đơn');
  const { lyDoLoi, trangThaiHoanTien, soTienHoan, chamDuyet, phutDenGioChoiLucGui, ...phanConLai } = hoaDon;
  phanConLai.chamDuyet = !!Number(chamDuyet); // quá hạn chủ sân duyệt → app hiện nút "Khiếu nại (Chậm duyệt)"
  // G9: đặt gấp do BE tính (chưa gửi ảnh: nếu gửi NGAY BÂY GIỜ; đã gửi: theo lúc gửi ảnh đầu tiên của lượt chờ duyệt).
  const datGapHoaDon = phutDenGioChoiLucGui == null
    ? { datGap: false, soPhutXacNhan: null }
    : chungTu.danhGiaDatGap(phutDenGioChoiLucGui, await chungTu.docCauHinhDatGap(pool));
  phanConLai.datGap = datGapHoaDon.datGap;
  phanConLai.soPhutXacNhan = datGapHoaDon.soPhutXacNhan;
  // G2: đã gửi ảnh (confirming) thì giữ chỗ vô thời hạn → hetHanGiuCho/conLaiGiay = null; app đếm ngược theo
  // hanXacNhan/conLaiXacNhanGiay (chỉ để khách biết chủ sân còn bao lâu để xem). Chứng từ = các ảnh khách đã gửi
  // (không có cảnh báo trùng ảnh: chỉ chủ sân/Admin thấy).
  phanConLai.conLaiGiay = phanConLai.conLaiGiay === null ? null : Number(phanConLai.conLaiGiay);
  phanConLai.conLaiXacNhanGiay = phanConLai.conLaiXacNhanGiay === null ? null : Number(phanConLai.conLaiXacNhanGiay);
  phanConLai.chungTu = await chungTu.layChungTu(pool, hoaDon.maThanhToan, { goc: 'khach' });
  phanConLai.soAnhToiDa = chungTu.TOI_DA_CHUNG_TU_MOI_DON;
  // Thêm trangThaiHienThi/nhanTrangThai/nhomTrangThai (backend tính, app chỉ hiển thị).
  const kemTrangThai = (duLieu) => {
    const { ma, nhan, nhom } = tinhTrangThaiHienThi({
      trangThai: hoaDon.trangThaiDatSan,
      trangThaiThanhToan: hoaDon.trangThaiThanhToan,
      trangThaiHoanTien,
      soTienHoan,
      lyDoTuChoi: duLieu.lyDoTuChoi,
    });
    return { ...duLieu, trangThaiHienThi: ma, nhanTrangThai: nhan, nhomTrangThai: nhom };
  };
  if (!['pending', 'confirming'].includes(hoaDon.trangThaiThanhToan)) {
    return kemTrangThai({
      ...phanConLai, anhQrUrl: null, maQr: null, taiKhoanNhan: null, chuaCauHinhThanhToan: false, lyDoTuChoi: null,
    });
  }
  // Tài khoản của chủ sân; null nếu chủ sân chưa nhập ngân hàng: vẫn trả hoá đơn, chưa có QR.
  const taiKhoan = await layTaiKhoanNhanTheoDatSan(pool, maDatSan);
  return kemTrangThai({
    ...phanConLai,
    anhQrUrl: taoAnhQrUrl(hoaDon.noiDungChuyenKhoan, Number(hoaDon.soTien), taiKhoan),
    maQr: taoNoiDungQr(hoaDon.noiDungChuyenKhoan, Number(hoaDon.soTien), taiKhoan),
    chuaCauHinhThanhToan: !taiKhoan,
    // Thông tin hiển thị cạnh QR (chủ sân từ chối ảnh → lyDoTuChoi để khách biết gửi lại).
    taiKhoanNhan: taiKhoan && {
      tenNganHang: taiKhoan.tenNganHang,
      maNganHang: taiKhoan.maNganHang,
      soTaiKhoan: taiKhoan.soTaiKhoan,
      chuTaiKhoan: taiKhoan.chuTaiKhoan,
    },
    lyDoTuChoi: hoaDon.trangThaiThanhToan === 'pending' ? lyDoLoi : null,
  });
}

// Cấu hình chính sách hoàn tiền (bảng cấu hình; thiếu thì dùng mặc định 24h/12h/50%).
async function layCauHinhHoan(ketNoi) {
  return {
    gioMienPhi: await layCauHinhSo(ketNoi, 'cancel_free_hours', HOAN_MAC_DINH.gioMienPhi),
    gioNuaTien: await layCauHinhSo(ketNoi, 'cancel_half_hours', HOAN_MAC_DINH.gioNuaTien),
    tiLeNuaTien: await layCauHinhSo(ketNoi, 'late_cancel_refund_percent', HOAN_MAC_DINH.tiLeNuaTien),
  };
}

// Hàm thuần: tổng đã trả + số tiền hoàn nếu huỷ ngay bây giờ (mỗi buổi tính theo số giờ còn lại tới giờ chơi).
function tinhHoanTheoBuoi(danhSachBuoi, cauHinhHoan, bayGio = Date.now()) {
  let soTienHoan = 0;
  let tongDaTra = 0;
  let conGioNhoNhat = Infinity;
  for (const muc of danhSachBuoi) {
    const batDau = new Date(`${muc.ngay}T${String(muc.gioBatDau).slice(0, 8)}+07:00`);
    const conGio = (batDau.getTime() - bayGio) / 3_600_000;
    conGioNhoNhat = Math.min(conGioNhoNhat, conGio);
    tongDaTra += Number(muc.tongTien);
    soTienHoan += tinhSoTienHoan(muc.tongTien, conGio, cauHinhHoan);
  }
  return { soTienHoan, tongDaTra, conGioNhoNhat };
}

// Các đơn con CÒN HIỆU LỰC của cùng một đợt đặt: lịch cố định → các buổi từ hôm nay; còn lại → mọi đơn con cùng
// MaNhomDat (đặt nhiều sân/khung giờ, G1.3; đơn lẻ = nhóm 1 dòng). Hủy phải giải phóng TẤT CẢ các đơn này.
async function layCacBuoiCuaDot(ketNoi, don, khoa = false) {
  const hauTo = khoa ? 'FOR UPDATE' : '';
  if (don.maLichCoDinh) {
    return (await ketNoi.query(
      `SELECT MaDatSan AS maDatSan, NgayChoi AS ngay, GioBatDau AS gioBatDau, TongTien AS tongTien FROM DatSan
       WHERE MaLichCoDinh=? AND NgayChoi>=CURDATE() AND TrangThai IN ('pending_payment','confirmed') ${hauTo}`,
      [don.maLichCoDinh]))[0];
  }
  return (await ketNoi.query(
    `SELECT MaDatSan AS maDatSan, NgayChoi AS ngay, GioBatDau AS gioBatDau, TongTien AS tongTien FROM DatSan
     WHERE COALESCE(MaNhomDat, MaDatSan)=? AND MaLichCoDinh IS NULL
       AND TrangThai IN ('pending_payment','confirmed') ${hauTo}`,
    [don.maNhomDat ?? don.maDatSan]))[0];
}

// Xem trước kết quả huỷ (KHÔNG ghi DB): FE hiện cảnh báo đúng trường hợp 100% / 50% / không hoàn trước khi khách xác nhận.
async function xemTruocHuy(maNguoiDung, maDatSan) {
  const [[donDatSan]] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh, d.MaNhomDat AS maNhomDat, d.NgayChoi AS ngay,
       d.GioBatDau AS gioBatDau, d.TongTien AS tongTien, d.TrangThai AS trangThai,
       t.TrangThai AS trangThaiThanhToan
     FROM DatSan d LEFT JOIN ThanhToan t ON t.MaDatSan=CASE
       WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
       ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
     END
     WHERE d.MaDatSan=? AND d.MaKhachHang=?`,
    [maDatSan, maNguoiDung]);
  if (!donDatSan) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
  if (!['pending_payment', 'confirmed'].includes(donDatSan.trangThai)) {
    throw AppError.biTrung('Đơn đặt sân không thể hủy ở trạng thái hiện tại');
  }
  const danhSachBuoi = await layCacBuoiCuaDot(pool, donDatSan);
  if (!danhSachBuoi.length) throw AppError.biTrung('Không còn buổi nào có thể hủy');

  const daThanhToan = donDatSan.trangThaiThanhToan === 'success';
  const cauHinhHoan = await layCauHinhHoan(pool);
  const { soTienHoan, tongDaTra, conGioNhoNhat } = tinhHoanTheoBuoi(danhSachBuoi, cauHinhHoan);
  const tiLeHoan = daThanhToan && tongDaTra > 0 ? Math.round(soTienHoan * 100 / tongDaTra) : 0;
  return {
    daThanhToan,
    soBuoiHuy: danhSachBuoi.length,
    tongDaTra: daThanhToan ? tongDaTra : 0,
    soTienHoan: daThanhToan ? soTienHoan : 0,
    tiLeHoan,
    gioMienPhi: cauHinhHoan.gioMienPhi,
    gioNuaTien: cauHinhHoan.gioNuaTien,
    // Số giờ còn lại tới buổi gần nhất (làm tròn 1 số lẻ) — chỉ để FE hiển thị.
    soGioConLai: Math.round(conGioNhoNhat * 10) / 10,
  };
}

async function huyDatSan(maNguoiDung, maDatSan, taiKhoanHoan = null) {
  return thucHienGiaoDich(async (ketNoi) => {
    await hetHanDatSan(maNguoiDung, ketNoi);
    const [[donDatSan]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh, d.MaNhomDat AS maNhomDat, d.NgayChoi AS ngay,
         d.GioBatDau AS gioBatDau, d.TongTien AS tongTien, d.TrangThai AS trangThai,
         t.MaThanhToan AS maThanhToan, t.TrangThai AS trangThaiThanhToan
       FROM DatSan d LEFT JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
       WHERE d.MaDatSan=? AND d.MaKhachHang=? FOR UPDATE`,
      [maDatSan, maNguoiDung]);
    if (!donDatSan) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    if (!['pending_payment', 'confirmed'].includes(donDatSan.trangThai)) {
      throw AppError.biTrung('Đơn đặt sân không thể hủy ở trạng thái hiện tại');
    }
    // Đã gửi ảnh chuyển khoản mà chủ sân chưa duyệt: không cho huỷ, nếu không đơn thành `cancelled`
    // còn thanh toán kẹt ở `confirming` (chủ sân không xử lý được, khách có thể đã chuyển tiền).
    if (donDatSan.trangThaiThanhToan === 'confirming') {
      throw AppError.biTrung(
        'Bạn đã gửi ảnh chuyển khoản, đang chờ chủ sân xác nhận. Vui lòng chờ chủ sân xác nhận hoặc từ chối rồi mới huỷ đơn.',
        'PAYMENT_CONFIRMING');
    }
    const danhSachMaDon = await layCacBuoiCuaDot(ketNoi, donDatSan, true);
    if (!danhSachMaDon.length) throw AppError.biTrung('Không còn buổi nào có thể hủy');

    // Chính sách hoàn tiền (đơn đã thanh toán): còn ≥24h → 100%; 12–24h → 50%; <12h → không hoàn.
    let soTienHoan = 0;
    let tongDaTra = 0;
    const daThanhToan = donDatSan.trangThaiThanhToan === 'success';
    if (daThanhToan) {
      const cauHinhHoan = await layCauHinhHoan(ketNoi);
      ({ soTienHoan, tongDaTra } = tinhHoanTheoBuoi(danhSachMaDon, cauHinhHoan));
    }
    // Có tiền hoàn → BẮT BUỘC khách cung cấp tài khoản nhận (mã ngân hàng, số tài khoản, họ tên chủ TK) ngay lúc huỷ.
    let taiKhoan = null;
    if (soTienHoan > 0) {
      if (!taiKhoanHoan) {
        throw AppError.duLieuKhongHopLe(
          'Đơn này được hoàn tiền nên bạn cần nhập tài khoản nhận hoàn (ngân hàng, số tài khoản, tên chủ tài khoản).',
          [{ truong: 'taiKhoanHoan', thongBao: 'Vui lòng nhập tài khoản nhận hoàn tiền.' }]);
      }
      const nganHang = timNganHang(taiKhoanHoan.maNganHang);
      if (!nganHang) {
        throw AppError.duLieuKhongHopLe('Ngân hàng không hợp lệ.', [{ truong: 'maNganHang', thongBao: 'Vui lòng chọn ngân hàng.' }]);
      }
      taiKhoan = { ...taiKhoanHoan, tenNganHang: nganHang.tenNganHang };
    }
    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='cancelled', NguoiHuy='customer',
         LyDoHuy='Khach hang huy don', NgayHuy=NOW()
       WHERE TrangThai IN ('pending_payment','confirmed') AND MaDatSan IN (${danhSachMaDon.map(() => '?').join(',')})`,
      danhSachMaDon.map((muc) => muc.maDatSan));
    if (donDatSan.maLichCoDinh) {
      await ketNoi.query("UPDATE LichCoDinh SET TrangThai='cancelled' WHERE MaLichCoDinh=?", [donDatSan.maLichCoDinh]);
    }
    if (donDatSan.maThanhToan) {
      if (soTienHoan > 0) {
        await ketNoi.query(
          `UPDATE ThanhToan SET TenNganHangHoan=?, MaNganHangHoan=?, SoTaiKhoanHoan=?, ChuTaiKhoanHoan=? WHERE MaThanhToan=?`,
          [taiKhoan.tenNganHang, taiKhoan.maNganHang, taiKhoan.soTaiKhoan, taiKhoan.chuTaiKhoan, donDatSan.maThanhToan]);
        // Chủ sân tự chuyển khoản hoàn cho khách rồi tải ảnh chứng từ (hoanTienService, G4).
        await hoanTienService.taoYeuCauHoan(ketNoi, {
          maThanhToan: donDatSan.maThanhToan, maDatSan, loai: 'cancel', soTien: soTienHoan,
          tyLe: tongDaTra > 0 ? Math.round(soTienHoan * 100 / tongDaTra) : null,
          lyDo: 'Khach hang huy don',
        });
      } else {
        await ketNoi.query(
          `UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan=? AND TrangThai='pending'`,
          [donDatSan.maThanhToan]);
      }
    }

    // Thông báo: khách luôn nhận một thông báo; chủ sân chỉ nhận khi đơn đã trả tiền (có việc phải làm/biết).
    const [[thongTinDon]] = await ketNoi.query(
      `SELECT d.MaDon AS maDon, d.TenKhach AS tenKhach, s.TenSan AS tenSan,
         cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       WHERE d.MaDatSan=?`, [maDatSan]);
    const tiLeHoan = tongDaTra > 0 ? Math.round(soTienHoan * 100 / tongDaTra) : 0;
    if (thongTinDon) {
      const nhanDon = `${thongTinDon.tenSan} - ${thongTinDon.tenCoSo} (mã ${thongTinDon.maDon})`;
      if (soTienHoan > 0) {
        await guiThongBao(ketNoi, {
          maNguoiDung,
          loai: 'refund_requested',
          tieuDe: 'Yêu cầu hoàn tiền đã được gửi',
          noiDung: `Bạn đã huỷ ${nhanDon}. Yêu cầu hoàn ${dinhDangTien(soTienHoan)} (${tiLeHoan}%) `
            + 'đã được gửi đến chủ sân. Bạn sẽ nhận thông báo khi chủ sân hoàn tiền.',
          loaiThamChieu: 'booking',
          maThamChieu: Number(maDatSan),
          khoa: `refund_requested:${maDatSan}`,
        });
        await guiThongBao(ketNoi, {
          maNguoiDung: thongTinDon.maChuSan,
          loai: 'refund_requested',
          tieuDe: 'Có yêu cầu hoàn tiền mới',
          noiDung: `${thongTinDon.tenKhach} huỷ ${nhanDon}. Vui lòng chuyển khoản hoàn `
            + `${dinhDangTien(soTienHoan)} (${tiLeHoan}%) cho khách rồi bấm "Đã hoàn tiền".`,
          loaiThamChieu: 'payment',
          maThamChieu: donDatSan.maThanhToan,
          khoa: `refund_requested_owner:${maDatSan}`,
        });
      } else {
        await guiThongBao(ketNoi, {
          maNguoiDung,
          loai: 'booking_cancelled',
          tieuDe: 'Đã huỷ đơn đặt sân',
          noiDung: daThanhToan
            ? `Bạn đã huỷ ${nhanDon}. Đơn huỷ trong vòng ${HOAN_MAC_DINH.gioNuaTien} giờ trước giờ chơi nên không được hoàn tiền.`
            : `Bạn đã huỷ ${nhanDon}.`,
          loaiThamChieu: 'booking',
          maThamChieu: Number(maDatSan),
          khoa: `booking_cancelled:${maDatSan}`,
        });
        if (daThanhToan) {
          await guiThongBao(ketNoi, {
            maNguoiDung: thongTinDon.maChuSan,
            loai: 'booking_cancelled',
            tieuDe: 'Khách đã huỷ đơn',
            noiDung: `${thongTinDon.tenKhach} huỷ ${nhanDon} sát giờ chơi, không phát sinh hoàn tiền.`,
            loaiThamChieu: 'booking',
            maThamChieu: Number(maDatSan),
            khoa: `booking_cancelled_owner:${maDatSan}`,
          });
        }
      }
    }

    let thongBaoHuy = null;
    if (soTienHoan > 0) {
      thongBaoHuy = 'Yêu cầu hoàn tiền đã được gửi đến chủ sân. Chủ sân sẽ hoàn tiền cho bạn trong thời gian sớm nhất.';
    } else if (daThanhToan) {
      thongBaoHuy = `Đơn huỷ trong vòng ${HOAN_MAC_DINH.gioNuaTien} giờ trước giờ chơi nên không được hoàn tiền.`;
    }
    return {
      daHuy: true,
      maDatSan: Number(maDatSan),
      daThanhToan,
      soTienHoanDuKien: soTienHoan,
      tiLeHoan,
      // Chủ sân hoàn tiền; khách có thể (không bắt buộc) bổ sung TK nhận hoàn để chủ sân chuyển nhanh.
      canCapNhatTaiKhoanHoan: soTienHoan > 0,
      // Nút khiếu nại do danh sách đơn (lietKeDatSan) quyết định; kết quả huỷ không dùng cờ này.
      coTheKhieuNai: false,
      thongBao: thongBaoHuy,
    };
  });
}

// G9.E6: khách TỪ CHỐI việc chủ sân chuyển sân → huỷ + hoàn 100% NGAY (HoanTien.Loai='closure', hạn 30'), KHÔNG áp chính sách 24h/12h.
// Phạm vi: mọi buổi của ĐỢT thanh toán chứa đơn trên URL mà đã bị chuyển sân (MaSanCu IS NOT NULL), còn hiệu lực và CHƯA tới giờ chơi.
// Đơn không bị chuyển sân → 409 BOOKING_NOT_MOVED; đã tới giờ chơi/đã check-in → 409 BOOKING_STARTED; khách đã gửi ảnh chờ duyệt → 409
// PAYMENT_CONFIRMING (như huỷ thường); đợt còn khoản hoàn chưa xong → 409 REFUND_PENDING; chưa trả tiền mà đợt còn buổi khác chưa chuyển
// → 409 PARTIAL_CANCEL_UNPAID (dùng huỷ cả đơn). Không bắt nhập tài khoản nhận hoàn ngay (bổ sung sau qua PUT tai-khoan-hoan-tien).
async function tuChoiChuyenSan(maNguoiDung, maDatSan) {
  return thucHienGiaoDich(async (ketNoi) => {
    await hetHanDatSan(maNguoiDung, ketNoi);
    const [[don]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaLichCoDinh AS maLichCoDinh, d.TrangThai AS trangThai,
         d.MaSanCu AS maSanCu, (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh = d.MaLichCoDinh) AS dauLich,
         COALESCE(d.MaNhomDat, d.MaDatSan) AS maNhom
       FROM DatSan d WHERE d.MaDatSan=? AND d.MaKhachHang=? FOR UPDATE`,
      [maDatSan, maNguoiDung]);
    if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    const khoaDot = don.maLichCoDinh ? don.dauLich : don.maNhom;
    const [[thanhToan]] = await ketNoi.query(
      'SELECT MaThanhToan AS maThanhToan, TrangThai AS trangThai FROM ThanhToan WHERE MaDatSan=? FOR UPDATE', [khoaDot]);
    // Mọi buổi của đợt (khoá), để xét từng buổi.
    const [cacBuoiDot] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, DATE_FORMAT(d.NgayChoi, '%Y-%m-%d') AS ngay, TIME_FORMAT(d.GioBatDau, '%H:%i') AS gioBatDau,
         TIME_FORMAT(d.GioKetThuc, '%H:%i') AS gioKetThuc, d.TongTien AS tongTien, d.TrangThai AS trangThai, d.MaSanCu AS maSanCu,
         d.NgayKhachDongYChuyen AS ngayDongY,
         (TIMESTAMP(d.NgayChoi, d.GioBatDau) <= NOW()) AS daDenGio, s.TenSan AS tenSan
       FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
       WHERE ${don.maLichCoDinh ? 'd.MaLichCoDinh = ?' : 'COALESCE(d.MaNhomDat, d.MaDatSan) = ? AND d.MaLichCoDinh IS NULL'}
       ORDER BY d.NgayChoi, d.GioBatDau, d.MaDatSan FOR UPDATE`,
      [don.maLichCoDinh ?? don.maNhom]);
    const hieuLuc = (b) => ['pending_payment', 'confirmed'].includes(b.trangThai);
    const buoiNay = cacBuoiDot.find((b) => Number(b.maDatSan) === Number(maDatSan));
    if (!buoiNay || !hieuLuc(buoiNay)) {
      throw AppError.biTrung('Đơn đặt sân không thể từ chối chuyển sân ở trạng thái hiện tại');
    }
    if (buoiNay.maSanCu == null) {
      throw AppError.biTrung('Đơn này chưa bị chủ sân chuyển sân nên không có gì để từ chối.', 'BOOKING_NOT_MOVED');
    }
    if (Number(buoiNay.daDenGio)) {
      throw AppError.biTrung('Đơn đã đến giờ chơi hoặc đã qua, không thể từ chối chuyển sân.', 'BOOKING_STARTED');
    }
    if (buoiNay.ngayDongY) {
      throw AppError.biTrung('Bạn đã đồng ý việc chuyển sân này nên không thể từ chối nữa.', 'MOVE_ALREADY_ACCEPTED');
    }
    if (thanhToan?.trangThai === 'confirming') {
      throw AppError.biTrung(
        'Bạn đã gửi ảnh chuyển khoản, đang chờ chủ sân xác nhận. Vui lòng chờ chủ sân xác nhận hoặc từ chối rồi mới từ chối chuyển sân.',
        'PAYMENT_CONFIRMING');
    }
    // Các buổi bị huỷ = buổi đã chuyển sân, còn hiệu lực, chưa tới giờ chơi.
    const cacBuoiHuy = cacBuoiDot.filter((b) => hieuLuc(b) && b.maSanCu != null && !Number(b.daDenGio));
    const cacMaHuy = cacBuoiHuy.map((b) => Number(b.maDatSan));
    const tongTienHuy = cacBuoiHuy.reduce((tong, b) => tong + Number(b.tongTien), 0);
    const conBuoiHieuLuc = cacBuoiDot.some((b) => hieuLuc(b) && !cacMaHuy.includes(Number(b.maDatSan)));
    const daThanhToan = thanhToan?.trangThai === 'success';
    if (thanhToan && daThanhToan) {
      const [[dangHoan]] = await ketNoi.query(
        `SELECT COUNT(*) AS so FROM HoanTien WHERE MaThanhToan = ? AND TrangThai IN ('waiting_info','processing','not_received','escalated')`,
        [thanhToan.maThanhToan]);
      if (Number(dangHoan.so) > 0) {
        throw AppError.biTrung(
          'Đơn này còn một khoản hoàn tiền chưa xử lý xong. Vui lòng chờ chủ sân hoàn tiền rồi thử lại.', 'REFUND_PENDING');
      }
    } else if (thanhToan?.trangThai === 'pending' && conBuoiHieuLuc) {
      throw AppError.biTrung(
        'Bạn chưa thanh toán nên chỉ huỷ được toàn bộ đơn, không huỷ riêng các buổi bị chuyển sân. Hãy dùng chức năng huỷ đơn.',
        'PARTIAL_CANCEL_UNPAID');
    }

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='cancelled', NguoiHuy='customer', LyDoHuy='Khach tu choi chuyen san', NgayHuy=NOW()
       WHERE TrangThai IN ('pending_payment','confirmed') AND MaDatSan IN (${cacMaHuy.map(() => '?').join(',')})`, cacMaHuy);
    if (don.maLichCoDinh && !conBuoiHieuLuc) {
      await ketNoi.query("UPDATE LichCoDinh SET TrangThai='cancelled' WHERE MaLichCoDinh=?", [don.maLichCoDinh]);
    } else if (don.maLichCoDinh) {
      const [[conSapChoi]] = await ketNoi.query(
        `SELECT COUNT(*) AS so FROM DatSan WHERE MaLichCoDinh=? AND TrangThai IN ('pending_payment','confirmed') AND TIMESTAMP(NgayChoi, GioBatDau) > NOW()`,
        [don.maLichCoDinh]);
      if (!Number(conSapChoi.so)) await ketNoi.query("UPDATE LichCoDinh SET TrangThai='cancelled' WHERE MaLichCoDinh=?", [don.maLichCoDinh]);
    }
    let hoanTien = null;
    if (thanhToan) {
      if (daThanhToan) {
        hoanTien = await hoanTienService.taoYeuCauHoan(ketNoi, {
          maThanhToan: thanhToan.maThanhToan, maDatSan: cacMaHuy[0], loai: 'closure', soTien: tongTienHuy, tyLe: 100,
          lyDo: 'Khach tu choi chuyen san',
        });
      } else if (thanhToan.trangThai === 'pending') {
        await ketNoi.query("UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan=? AND TrangThai='pending'", [thanhToan.maThanhToan]);
      }
    }
    const soTienHoan = hoanTien ? Number(hoanTien.soTien) : 0;

    const [[thongTin]] = await ketNoi.query(
      `SELECT d.MaDon AS maDon, d.TenKhach AS tenKhach, cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo WHERE d.MaDatSan=?`, [maDatSan]);
    if (thongTin) {
      const nhanDon = `${cacBuoiHuy.length} buổi của đơn ${thongTin.maDon} - ${thongTin.tenCoSo}`;
      await guiThongBao(ketNoi, {
        maNguoiDung,
        loai: soTienHoan > 0 ? 'refund_requested' : 'booking_cancelled',
        tieuDe: soTienHoan > 0 ? 'Yêu cầu hoàn tiền đã được gửi' : 'Đã huỷ đơn do từ chối chuyển sân',
        noiDung: `Bạn đã từ chối việc chuyển sân và huỷ ${nhanDon}.`
          + (soTienHoan > 0 ? ` Bạn được hoàn 100% (${dinhDangTien(soTienHoan)}); chủ sân sẽ chuyển khoản hoàn cho bạn.` : ''),
        loaiThamChieu: 'booking', maThamChieu: cacMaHuy[0], khoa: `tu_choi_chuyen_san:${cacMaHuy[0]}`,
      });
      await guiThongBao(ketNoi, {
        maNguoiDung: thongTin.maChuSan,
        loai: soTienHoan > 0 ? 'refund_requested' : 'booking_cancelled',
        tieuDe: 'Khách từ chối chuyển sân',
        noiDung: `${thongTin.tenKhach} không đồng ý việc chuyển sân và đã huỷ ${nhanDon}.`
          + (soTienHoan > 0 ? ` Vui lòng chuyển khoản hoàn ${dinhDangTien(soTienHoan)} (100%) cho khách rồi bấm "Đã hoàn tiền".` : ''),
        loaiThamChieu: soTienHoan > 0 ? 'payment' : 'booking',
        maThamChieu: soTienHoan > 0 ? thanhToan.maThanhToan : cacMaHuy[0],
        khoa: `tu_choi_chuyen_san_owner:${cacMaHuy[0]}`,
      });
    }
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maNguoiDung, hanhDong: 'tu_choi_chuyen_san', doiTuong: 'DatSan', maDoiTuong: Number(maDatSan),
      chiTiet: `Khách từ chối chuyển sân, huỷ ${cacMaHuy.length} buổi của đơn ${thongTin?.maDon} (${cacMaHuy.join(',')})`
        + `${soTienHoan > 0 ? `, hoàn ${dinhDangTien(soTienHoan)} (closure)` : ''}`,
    });
    return {
      daHuy: true,
      maDatSan: Number(maDatSan),
      maDon: thongTin?.maDon ?? don.maDon,
      cacBuoiDaHuy: cacMaHuy,
      soBuoiHuy: cacMaHuy.length,
      daThanhToan,
      tiLeHoan: daThanhToan ? 100 : 0,
      soTienHoanDuKien: soTienHoan,
      maHoanTien: hoanTien ? Number(hoanTien.maHoanTien) : null,
      canCapNhatTaiKhoanHoan: soTienHoan > 0,
      thongBao: soTienHoan > 0
        ? 'Đã huỷ đơn. Chủ sân sẽ hoàn 100% tiền cho bạn; bạn có thể bổ sung tài khoản nhận hoàn để được chuyển nhanh.'
        : 'Đã huỷ đơn do bạn từ chối chuyển sân.',
    };
  });
}

// G9.H: khách ĐỒNG Ý việc chủ sân chuyển sân. Ghi nhận cho mọi buổi của ĐỢT đã bị chuyển sân, còn hiệu lực, chưa tới giờ chơi;
// sau đó không còn từ chối được (chủ sân chuyển lại thì reset). Không đổi tiền/trạng thái đơn.
// Lỗi 409: BOOKING_NOT_MOVED, BOOKING_STARTED, MOVE_ALREADY_ACCEPTED.
async function dongYChuyenSan(maNguoiDung, maDatSan) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[don]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaLichCoDinh AS maLichCoDinh, d.TrangThai AS trangThai,
         d.MaSanCu AS maSanCu, d.NgayKhachDongYChuyen AS ngayDongY, COALESCE(d.MaNhomDat, d.MaDatSan) AS maNhom,
         (TIMESTAMP(d.NgayChoi, d.GioBatDau) <= NOW()) AS daDenGio
       FROM DatSan d WHERE d.MaDatSan=? AND d.MaKhachHang=? FOR UPDATE`, [maDatSan, maNguoiDung]);
    if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    if (!['pending_payment', 'confirmed'].includes(don.trangThai)) {
      throw AppError.biTrung('Đơn đặt sân không thể đồng ý chuyển sân ở trạng thái hiện tại');
    }
    if (don.maSanCu == null) {
      throw AppError.biTrung('Đơn này chưa bị chủ sân chuyển sân nên không có gì để đồng ý.', 'BOOKING_NOT_MOVED');
    }
    if (Number(don.daDenGio)) {
      throw AppError.biTrung('Đơn đã đến giờ chơi hoặc đã qua, không cần đồng ý chuyển sân.', 'BOOKING_STARTED');
    }
    if (don.ngayDongY) {
      throw AppError.biTrung('Bạn đã đồng ý việc chuyển sân này rồi.', 'MOVE_ALREADY_ACCEPTED');
    }
    const [cacBuoi] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan FROM DatSan d
       WHERE ${don.maLichCoDinh ? 'd.MaLichCoDinh = ?' : 'COALESCE(d.MaNhomDat, d.MaDatSan) = ? AND d.MaLichCoDinh IS NULL'}
         AND d.TrangThai IN ('pending_payment','confirmed') AND d.MaSanCu IS NOT NULL
         AND d.NgayKhachDongYChuyen IS NULL AND TIMESTAMP(d.NgayChoi, d.GioBatDau) > NOW() FOR UPDATE`,
      [don.maLichCoDinh ?? don.maNhom]);
    const cacMa = cacBuoi.map((b) => Number(b.maDatSan));
    if (!cacMa.length) throw AppError.biTrung('Không còn buổi nào cần đồng ý chuyển sân.', 'BOOKING_NOT_MOVED');
    await ketNoi.query(
      `UPDATE DatSan SET NgayKhachDongYChuyen = NOW() WHERE MaDatSan IN (${cacMa.map(() => '?').join(',')})`, cacMa);
    const [[thongTin]] = await ketNoi.query(
      `SELECT d.MaDon AS maDon, d.TenKhach AS tenKhach, cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo WHERE d.MaDatSan=?`, [maDatSan]);
    if (thongTin) {
      await guiThongBao(ketNoi, {
        maNguoiDung: thongTin.maChuSan, loai: 'booking_moved', tieuDe: 'Khách đồng ý chuyển sân',
        noiDung: `${thongTin.tenKhach} đã đồng ý việc chuyển sân của ${cacMa.length} buổi thuộc đơn ${thongTin.maDon} - ${thongTin.tenCoSo}.`,
        loaiThamChieu: 'booking', maThamChieu: cacMa[0], khoa: `dong_y_chuyen_san_owner:${cacMa[0]}:${Date.now()}`,
      });
    }
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maNguoiDung, hanhDong: 'dong_y_chuyen_san', doiTuong: 'DatSan', maDoiTuong: Number(maDatSan),
      chiTiet: `Khách đồng ý chuyển sân ${cacMa.length} buổi của đơn ${thongTin?.maDon} (${cacMa.join(',')})`,
    });
    return {
      daDongY: true, maDatSan: Number(maDatSan), maDon: thongTin?.maDon ?? don.maDon, cacBuoiDaDongY: cacMa,
      thongBao: 'Đã ghi nhận bạn đồng ý việc chuyển sân.',
    };
  });
}

async function capNhatTaiKhoanHoan(maNguoiDung, maDatSan, thongTin) {
  const [ketQua] = await pool.query(
    `UPDATE ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
     SET t.TenNganHangHoan=?, t.MaNganHangHoan=?, t.SoTaiKhoanHoan=?, t.ChuTaiKhoanHoan=?
     WHERE d.MaDatSan=? AND d.MaKhachHang=? AND t.TrangThaiHoanTien IN ('waiting_info','processing')`,
    [thongTin.tenNganHang, thongTin.maNganHang, thongTin.soTaiKhoan, thongTin.chuTaiKhoan, maDatSan, maNguoiDung]);
  if (!ketQua.affectedRows) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền cần bổ sung tài khoản');
  // G4: cập nhật cả dòng HoanTien đang chờ (khách sửa TK sai → chủ sân chuyển lại).
  const [[thanhToan]] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan FROM ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
     WHERE d.MaDatSan=? AND d.MaKhachHang=?`, [maDatSan, maNguoiDung]);
  if (thanhToan) await hoanTienService.capNhatTaiKhoanNhan(pool, thanhToan.maThanhToan, thongTin);
  return { daCapNhat: true };
}

async function layDanhSachYeuThich(maNguoiDung) {
  const [cacDong] = await pool.query(
    `SELECT MaCoSo AS maCoSo, NgayTao AS ngayTao FROM YeuThich
     WHERE MaKhachHang=? ORDER BY NgayTao DESC`,
    [maNguoiDung]);
  return cacDong;
}

async function themYeuThich(maNguoiDung, maCoSo) {
  const [[coSo]] = await pool.query(
    "SELECT MaCoSo FROM CoSo WHERE MaCoSo=? AND TrangThai='active'", [maCoSo]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở');
  await pool.query(
    'INSERT IGNORE INTO YeuThich (MaKhachHang, MaCoSo) VALUES (?, ?)',
    [maNguoiDung, maCoSo]);
  return { maCoSo: Number(maCoSo), yeuThich: true };
}

async function boYeuThich(maNguoiDung, maCoSo) {
  await pool.query(
    'DELETE FROM YeuThich WHERE MaKhachHang=? AND MaCoSo=?', [maNguoiDung, maCoSo]);
  return { maCoSo: Number(maCoSo), yeuThich: false };
}

// Đơn được đánh giá khi: khách đã check-in (checked_in) hoặc đã chơi xong (completed), và thanh toán đã
// hoàn tất. Đơn app chỉ lên confirmed khi thanh toán 'success', nên checked_in/completed ⇒ đã trả tiền;
// vẫn chặn thêm nếu có dòng ThanhToan mà chưa 'success' (vd. dữ liệu lệch). Đơn không có dòng ThanhToan
// (dữ liệu mẫu) coi như hợp lệ.
const TRANG_THAI_DUOC_DANH_GIA = ['checked_in', 'completed'];
function coTheDanhGiaDon(trangThaiDon, trangThaiThanhToan) {
  return TRANG_THAI_DUOC_DANH_GIA.includes(trangThaiDon)
    && (trangThaiThanhToan == null || trangThaiThanhToan === 'success');
}

const THONG_BAO_CHUA_DANH_GIA = {
  pending_payment: 'Đơn chưa thanh toán nên chưa thể đánh giá.',
  confirmed: 'Bạn chỉ có thể đánh giá sau khi check-in hoặc chơi xong.',
  cancelled: 'Đơn đã huỷ nên không thể đánh giá.',
  expired: 'Đơn đã hết hạn giữ chỗ nên không thể đánh giá.',
};

// Danh sách đánh giá công khai của một cơ sở (bỏ đánh giá bị admin ẩn), mới nhất trước.
async function layDanhSachDanhGia(maCoSo, { trang = 1, soLuong = 20 } = {}) {
  const [[coSo]] = await pool.query(
    "SELECT MaCoSo FROM CoSo WHERE MaCoSo=? AND TrangThai='active'", [maCoSo]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở đang hoạt động');
  const [[tong]] = await pool.query(
    'SELECT COUNT(*) AS tongSo FROM DanhGia WHERE MaCoSo=? AND BiAn=0', [maCoSo]);
  const [danhSach] = await pool.query(
    `SELECT dg.MaDanhGia AS maDanhGia, nd.HoTen AS tenKhach, dg.SoSao AS soSao,
       dg.NoiDung AS noiDung, dg.NgayTao AS ngayTao,
       dg.PhanHoiChuSan AS phanHoiChuSan, dg.NgayPhanHoi AS ngayPhanHoi
     FROM DanhGia dg JOIN NguoiDung nd ON nd.MaNguoiDung=dg.MaKhachHang
     WHERE dg.MaCoSo=? AND dg.BiAn=0
     ORDER BY dg.NgayTao DESC, dg.MaDanhGia DESC
     LIMIT ? OFFSET ?`,
    [maCoSo, soLuong, (trang - 1) * soLuong]);
  return { danhSach, trang, soLuong, tongSo: Number(tong.tongSo) };
}

// Khách đánh giá cơ sở sau khi check-in (hoặc chơi xong) và đã thanh toán. Mỗi đơn 1 đánh giá (UNIQUE MaDatSan);
// đơn thuộc lịch cố định thì cả lịch chỉ 1 đánh giá (buổi đầu tiên được đánh giá).
// Ghi đánh giá + tính lại CoSo.DiemTrungBinh/SoDanhGia + thông báo, tất cả trong một giao dịch.
async function guiDanhGia(maNguoiDung, maDatSan, { soSao, noiDung }) {
  return thucHienGiaoDich(async (ketNoi) => {
    await hetHanDatSan(maNguoiDung, ketNoi);
    const [[don]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.TrangThai AS trangThai, s.MaCoSo AS maCoSo,
         d.MaLichCoDinh AS maLichCoDinh,
         COALESCE((SELECT MIN(d2.MaDatSan) FROM DatSan d2
                   WHERE d2.MaLichCoDinh=d.MaLichCoDinh), d.MaNhomDat, d.MaDatSan) AS maDatSanThanhToan
       FROM DatSan d JOIN San s ON s.MaSan=d.MaSan
       WHERE d.MaDatSan=? AND d.MaKhachHang=? FOR UPDATE`,
      [maDatSan, maNguoiDung]);
    if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    if (!TRANG_THAI_DUOC_DANH_GIA.includes(don.trangThai)) {
      throw AppError.biTrung(
        THONG_BAO_CHUA_DANH_GIA[don.trangThai] || 'Đơn này chưa thể đánh giá.',
        'BOOKING_NOT_COMPLETED');
    }
    // Đơn lịch cố định dùng chung 1 hoá đơn (gắn vào đơn đầu tiên của lịch).
    const [[thanhToan]] = await ketNoi.query(
      `SELECT TrangThai AS trangThai FROM ThanhToan
       WHERE MaDatSan=? ORDER BY MaThanhToan DESC LIMIT 1`,
      [don.maDatSanThanhToan]);
    if (!coTheDanhGiaDon(don.trangThai, thanhToan?.trangThai)) {
      throw AppError.biTrung(
        'Đơn chưa hoàn tất thanh toán nên chưa thể đánh giá.', 'PAYMENT_NOT_COMPLETED');
    }
    const loiDaDanhGia = () => AppError.biTrung('Bạn đã đánh giá đơn này rồi.', 'REVIEW_EXISTS');
    const [[daCo]] = await ketNoi.query(
      'SELECT MaDanhGia FROM DanhGia WHERE MaDatSan=?', [maDatSan]);
    if (daCo) throw loiDaDanhGia();

    // Khoá dòng cơ sở để 2 đánh giá cùng lúc không tính điểm trung bình chồng nhau
    // (và để kiểm tra "mỗi lịch cố định 1 đánh giá" bên dưới không bị 2 buổi vượt qua cùng lúc).
    await ketNoi.query('SELECT MaCoSo FROM CoSo WHERE MaCoSo=? FOR UPDATE', [don.maCoSo]);
    if (don.maLichCoDinh) {
      const [[daCoTheoLich]] = await ketNoi.query(
        `SELECT dg.MaDanhGia AS maDanhGia FROM DanhGia dg
         JOIN DatSan dl ON dl.MaDatSan=dg.MaDatSan
         WHERE dl.MaLichCoDinh=? LIMIT 1`, [don.maLichCoDinh]);
      if (daCoTheoLich) {
        throw AppError.biTrung('Bạn đã đánh giá lịch cố định này rồi.', 'REVIEW_EXISTS');
      }
    }
    let maDanhGia;
    try {
      const [ketQua] = await ketNoi.query(
        `INSERT INTO DanhGia (MaDatSan, MaKhachHang, MaCoSo, SoSao, NoiDung)
         VALUES (?, ?, ?, ?, ?)`,
        [maDatSan, maNguoiDung, don.maCoSo, soSao, noiDung ? noiDung : null]);
      maDanhGia = ketQua.insertId;
    } catch (loi) {
      if (loi.code === 'ER_DUP_ENTRY') throw loiDaDanhGia();
      throw loi;
    }
    const diem = await tinhLaiDiemCoSo(ketNoi, don.maCoSo);
    const [[danhGia]] = await ketNoi.query(
      'SELECT NgayTao AS ngayTao FROM DanhGia WHERE MaDanhGia=?', [maDanhGia]);
    // Thông báo chủ sân + cảm ơn khách (best-effort, không làm hỏng việc gửi đánh giá).
    await baoDanhGiaMoi(ketNoi, {
      maDanhGia, maCoSo: don.maCoSo, maKhachHang: maNguoiDung, soSao, noiDung,
    });
    return {
      maDanhGia,
      maDatSan: Number(maDatSan),
      maCoSo: don.maCoSo,
      soSao,
      noiDung: noiDung || null,
      ngayTao: danhGia.ngayTao,
      ...diem,
    };
  });
}

// Lấy (và khoá) đánh giá của khách theo đơn; 404 nếu không phải của khách / chưa có.
async function layDanhGiaCuaKhach(ketNoi, maNguoiDung, maDatSan) {
  const [[danhGia]] = await ketNoi.query(
    `SELECT MaDanhGia AS maDanhGia, MaCoSo AS maCoSo, SoSao AS soSao, NoiDung AS noiDung,
       BiAn AS biAn, NgayTao AS ngayTao,
       (NgayTao + INTERVAL ${SO_NGAY_SUA_DANH_GIA} DAY < NOW()) AS quaHanSua
     FROM DanhGia WHERE MaDatSan=? AND MaKhachHang=? FOR UPDATE`,
    [maDatSan, maNguoiDung]);
  if (!danhGia) throw AppError.khongTimThay('Không tìm thấy đánh giá');
  return danhGia;
}

// Khách sửa đánh giá của mình (soSao và/hoặc noiDung) trong vòng 7 ngày kể từ lúc đánh giá.
// `maDatSan` là buổi đang giữ đánh giá (lietKeDatSan trả maDatSanDanhGia).
async function suaDanhGia(maNguoiDung, maDatSan, { soSao, noiDung }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const danhGia = await layDanhGiaCuaKhach(ketNoi, maNguoiDung, maDatSan);
    if (Number(danhGia.quaHanSua)) {
      throw AppError.biTrung(
        `Đã quá ${SO_NGAY_SUA_DANH_GIA} ngày kể từ lúc đánh giá nên không thể sửa.`, 'REVIEW_EDIT_EXPIRED');
    }
    if (Number(danhGia.biAn)) {
      throw AppError.biTrung('Đánh giá đã bị ẩn nên không thể sửa.', 'REVIEW_HIDDEN');
    }
    const soSaoMoi = soSao !== undefined ? soSao : Number(danhGia.soSao);
    const noiDungMoi = noiDung !== undefined ? (noiDung || null) : danhGia.noiDung;
    // Khoá dòng cơ sở trước khi tính lại điểm.
    await ketNoi.query('SELECT MaCoSo FROM CoSo WHERE MaCoSo=? FOR UPDATE', [danhGia.maCoSo]);
    await ketNoi.query(
      'UPDATE DanhGia SET SoSao=?, NoiDung=? WHERE MaDanhGia=?',
      [soSaoMoi, noiDungMoi, danhGia.maDanhGia]);
    const diem = await tinhLaiDiemCoSo(ketNoi, danhGia.maCoSo);
    return {
      maDanhGia: danhGia.maDanhGia,
      maDatSan: Number(maDatSan),
      maCoSo: danhGia.maCoSo,
      soSao: soSaoMoi,
      noiDung: noiDungMoi,
      ngayTao: danhGia.ngayTao,
      ...diem,
    };
  });
}

// Khách xoá đánh giá của mình (không giới hạn thời gian) rồi được đánh giá lại.
async function xoaDanhGia(maNguoiDung, maDatSan) {
  return thucHienGiaoDich(async (ketNoi) => {
    const danhGia = await layDanhGiaCuaKhach(ketNoi, maNguoiDung, maDatSan);
    await ketNoi.query('SELECT MaCoSo FROM CoSo WHERE MaCoSo=? FOR UPDATE', [danhGia.maCoSo]);
    await ketNoi.query('DELETE FROM DanhGia WHERE MaDanhGia=?', [danhGia.maDanhGia]);
    const diem = await tinhLaiDiemCoSo(ketNoi, danhGia.maCoSo);
    return {
      maDanhGia: danhGia.maDanhGia, maDatSan: Number(maDatSan), maCoSo: danhGia.maCoSo, daXoa: true, ...diem,
    };
  });
}

module.exports = {
  layDanhSachYeuThich,
  themYeuThich,
  boYeuThich,
  timCoSo,
  layDanhSachCoSo,
  layChiTietCoSo,
  layChiTietSan,
  kiemTraTrong,
  layLichNgay,
  taoDatSan,
  taoDatNhieuSan,
  lietKeDatSan,
  layHoaDonNhap,
  huyDatSan,
  tuChoiChuyenSan,
  dongYChuyenSan,
  xemTruocHuy,
  capNhatTaiKhoanHoan,
  layDanhSachDanhGia,
  guiDanhGia,
  suaDanhGia,
  xoaDanhGia,
  // Dùng chung cho đơn do chủ sân tạo (ownerBookingService).
  layThongTinSan,
  kiemTraKhungDat,
  tinhTongTien,
  taoDanhSachNgay,
  taoMaDon,
};
