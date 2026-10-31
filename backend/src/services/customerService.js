const crypto = require('crypto');
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { doiGioRaPhut } = require('../utils/time');
const { taoAnhQrUrl } = require('../utils/sepay');

const GIOI_HAN_DAT_CO_DINH_NGAY = 90;

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
  if (ngay < ngayHienTai || (ngay === ngayHienTai && gioBatDau <= gioHienTai)) {
    throw AppError.duLieuKhongHopLe('Không thể đặt sân trong quá khứ');
  }
}

async function hetHanDatSan(maNguoiDung, ketNoi = pool) {
  await ketNoi.query(
    `UPDATE DatSan SET TrangThai='expired'
     WHERE MaKhachHang=? AND TrangThai='pending_payment' AND HetHanGiuCho<=NOW()`,
    [maNguoiDung]);
  await ketNoi.query(
    `UPDATE ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
     SET t.TrangThai='expired'
     WHERE d.MaKhachHang=? AND d.TrangThai='expired' AND t.TrangThai IN ('pending','confirming')`,
    [maNguoiDung]);
  await ketNoi.query(
    `UPDATE LichCoDinh lc SET TrangThai='ended'
     WHERE lc.MaKhachHang=? AND lc.TrangThai='active'
       AND NOT EXISTS (
         SELECT 1 FROM DatSan d WHERE d.MaLichCoDinh=lc.MaLichCoDinh
           AND d.TrangThai IN ('pending_payment','confirmed')
       )`,
    [maNguoiDung]);
}

async function layThongTinSan(maSan, ketNoi = pool, khoa = false) {
  const [[san]] = await ketNoi.query(
    `SELECT s.MaSan AS maSan, s.MaCoSo AS maCoSo, s.TenSan AS tenSan,
       s.TrangThai AS trangThaiSan, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi,
       cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen, cs.GioMoCua AS gioMoCua,
       cs.GioDongCua AS gioDongCua, cs.SoPhutDatToiThieu AS soPhutDatToiThieu,
       cs.MaChuSan AS maChuSan
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND cs.TrangThai='active' ${khoa ? 'FOR UPDATE' : ''}`,
    [maSan]);
  if (!san || san.trangThaiSan !== 'active') throw AppError.khongTimThay('Không tìm thấy sân đang hoạt động');
  return san;
}

async function kiemTraKhungDat(san, ngay, gioBatDau, gioKetThuc, ketNoi = pool) {
  kiemTraNgay(ngay);
  const batDau = doiGioRaPhut(gioBatDau);
  const ketThuc = doiGioRaPhut(gioKetThuc);
  const soPhut = ketThuc - batDau;
  kiemTraBatDauTuongLai(ngay, gioBatDau);
  if (soPhut <= 0 || soPhut % 30 !== 0 || batDau % 30 !== 0 || ketThuc % 30 !== 0
    || soPhut < san.soPhutDatToiThieu) {
    throw AppError.duLieuKhongHopLe(`Thời lượng phải là bội số của 30 phút và tối thiểu ${san.soPhutDatToiThieu} phút`);
  }
  if (batDau < doiGioRaPhut(san.gioMoCua) || ketThuc > doiGioRaPhut(san.gioDongCua)) {
    throw AppError.duLieuKhongHopLe('Khung giờ nằm ngoài giờ hoạt động của cơ sở');
  }

  const [[donTrung]] = await ketNoi.query(
    `SELECT MaDatSan FROM DatSan
     WHERE MaSan=? AND NgayChoi=?
       AND (TrangThai='confirmed' OR (TrangThai='pending_payment' AND HetHanGiuCho>NOW()))
       AND GioBatDau<? AND GioKetThuc>? LIMIT 1 FOR UPDATE`,
    [san.maSan, ngay, gioKetThuc, gioBatDau]);
  const [[khoaTrung]] = await ketNoi.query(
    `SELECT MaKhoa FROM KhoaSan
     WHERE MaSan=? AND NgayKhoa=? AND GioBatDau<? AND GioKetThuc>? LIMIT 1 FOR UPDATE`,
    [san.maSan, ngay, gioKetThuc, gioBatDau]);
  return !donTrung && !khoaTrung;
}

async function tinhTongTien(maCoSo, ngay, gioBatDau, gioKetThuc, loaiKhach, ketNoi = pool) {
  const loaiNgay = [0, 6].includes(new Date(`${ngay}T00:00:00Z`).getUTCDay()) ? 'weekend' : 'weekday';
  const [cacGia] = await ketNoi.query(
    `SELECT GioBatDau AS gioBatDau, GioKetThuc AS gioKetThuc, GiaMoiGio AS giaMoiGio
     FROM BangGia WHERE MaCoSo=? AND LoaiNgay=? AND LoaiKhach=?
     ORDER BY GioBatDau`,
    [maCoSo, loaiNgay, loaiKhach]);
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

async function layCauHinh(ketNoi, khoa) {
  const [[muc]] = await ketNoi.query('SELECT GiaTri AS giaTri FROM CauHinhHeThong WHERE KhoaCauHinh=?', [khoa]);
  return Number(muc?.giaTri || 0);
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

async function taoDatSan(maNguoiDung, duLieu, ngayKetThuc = duLieu.ngay) {
  const cacNgay = taoDanhSachNgay(duLieu.ngay, ngayKetThuc);
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    const san = await layThongTinSan(duLieu.maSan, ketNoi, true);
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
    const phiLe = await layCauHinh(ketNoi, 'commission_rate');
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
          phiNenTang, tongTien - phiNenTang, await layCauHinh(ketNoi, 'hold_minutes') || 10,
        ]);
      cacDon.push({ maDatSan: don.insertId, maDon, ngay: cacNgay[viTri], tongTien });
    }
    const tongTien = cacMucGia.reduce((tong, gia) => tong + gia, 0);
    const anhQrUrl = taoAnhQrUrl(cacDon[0].maDon, tongTien);
    const [thanhToan] = await ketNoi.query(
      `INSERT INTO ThanhToan (MaDatSan, SoTien, NoiDungChuyenKhoan, NoiDungQR)
       VALUES (?,?,?,?)`,
      [cacDon[0].maDatSan, tongTien, cacDon[0].maDon, anhQrUrl]);
    return {
      maLichCoDinh,
      cacDon,
      tongTien,
      maThanhToan: thanhToan.insertId,
      maDonThanhToan: cacDon[0].maDon,
      anhQrUrl,
      soNgay: cacNgay.length,
    };
  });
  return ketQua;
}

async function timCoSo(boLoc) {
  kiemTraNgay(boLoc.ngay);
  kiemTraBatDauTuongLai(boLoc.ngay, boLoc.gioBatDau);
  const batDau = doiGioRaPhut(boLoc.gioBatDau);
  const ketThuc = doiGioRaPhut(boLoc.gioKetThuc);
  if (ketThuc <= batDau || batDau % 30 !== 0 || ketThuc % 30 !== 0) {
    throw AppError.duLieuKhongHopLe('Khung giờ phải tăng dần và theo mốc 30 phút');
  }
  const thamSo = [boLoc.ngay, boLoc.gioKetThuc, boLoc.gioBatDau];
  let dieuKienKhuVuc = '';
  if (boLoc.tinhThanh) {
    dieuKienKhuVuc += ' AND cs.TinhThanh=?';
    thamSo.push(boLoc.tinhThanh);
  }
  if (boLoc.quanHuyen) {
    dieuKienKhuVuc += ' AND cs.QuanHuyen=?';
    thamSo.push(boLoc.quanHuyen);
  }
  const [cacSan] = await pool.query(
    `SELECT cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi,
       cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen, cs.GiaThapNhat AS giaThapNhat,
       cs.GioMoCua AS gioMoCua, cs.GioDongCua AS gioDongCua,
       cs.SoPhutDatToiThieu AS soPhutDatToiThieu,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia,
       s.MaSan AS maSan, s.TenSan AS tenSan,
       (SELECT a.DuongDan FROM AnhCoSo a WHERE a.MaCoSo=cs.MaCoSo
        ORDER BY a.LaAnhBia DESC, a.ThuTu, a.MaAnh LIMIT 1) AS duongDanAnh
     FROM CoSo cs JOIN San s ON s.MaCoSo=cs.MaCoSo
     WHERE cs.TrangThai='active' AND s.TrangThai='active' ${dieuKienKhuVuc}
       AND NOT EXISTS (
         SELECT 1 FROM DatSan d WHERE d.MaSan=s.MaSan AND d.NgayChoi=?
           AND (d.TrangThai='confirmed' OR (d.TrangThai='pending_payment' AND d.HetHanGiuCho>NOW()))
           AND d.GioBatDau<? AND d.GioKetThuc>?
       )
       AND NOT EXISTS (
         SELECT 1 FROM KhoaSan k WHERE k.MaSan=s.MaSan AND k.NgayKhoa=?
           AND k.GioBatDau<? AND k.GioKetThuc>?
       )
     ORDER BY cs.DiemTrungBinh DESC, cs.MaCoSo, s.MaSan`,
    [...thamSo.slice(3), boLoc.ngay, boLoc.gioKetThuc, boLoc.gioBatDau,
      boLoc.ngay, boLoc.gioKetThuc, boLoc.gioBatDau]);
  return cacSan.filter((san) =>
    batDau >= doiGioRaPhut(san.gioMoCua)
    && ketThuc <= doiGioRaPhut(san.gioDongCua)
    && ketThuc - batDau >= san.soPhutDatToiThieu);
}

async function layChiTietCoSo(maCoSo) {
  const [[coSo]] = await pool.query(
    `SELECT MaCoSo AS maCoSo, TenCoSo AS tenCoSo, DiaChi AS diaChi,
       SoDienThoai AS soDienThoai, Zalo AS zalo, LinkBanDo AS linkBanDo,
       TinhThanh AS tinhThanh, QuanHuyen AS quanHuyen, MoTa AS moTa,
       GioMoCua AS gioMoCua, GioDongCua AS gioDongCua,
       SoPhutDatToiThieu AS soPhutDatToiThieu, GiaThapNhat AS giaThapNhat,
       DiemTrungBinh AS diemTrungBinh, SoDanhGia AS soDanhGia
     FROM CoSo WHERE MaCoSo=? AND TrangThai='active'`,
    [maCoSo]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở đang hoạt động');
  const [cacSan] = await pool.query(
    `SELECT MaSan AS maSan, TenSan AS tenSan FROM San
     WHERE MaCoSo=? AND TrangThai='active' ORDER BY MaSan`,
    [maCoSo]);
  const [anh] = await pool.query(
    `SELECT DuongDan AS duongDan, LaAnhBia AS laAnhBia FROM AnhCoSo
     WHERE MaCoSo=? ORDER BY LaAnhBia DESC, ThuTu, MaAnh`,
    [maCoSo]);
  return { ...coSo, cacSan, anh };
}

async function layChiTietSan(maSan) {
  const [[san]] = await pool.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan, cs.MaCoSo AS maCoSo,
       cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi, cs.TinhThanh AS tinhThanh,
       cs.QuanHuyen AS quanHuyen, cs.MoTa AS moTa, cs.GioMoCua AS gioMoCua,
       cs.GioDongCua AS gioDongCua, cs.SoPhutDatToiThieu AS soPhutDatToiThieu,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND s.TrangThai='active' AND cs.TrangThai='active'`,
    [maSan]);
  if (!san) throw AppError.khongTimThay('Không tìm thấy sân đang hoạt động');
  const [bangGia] = await pool.query(
    `SELECT LoaiNgay AS loaiNgay, LoaiKhach AS loaiKhach,
       GioBatDau AS gioBatDau, GioKetThuc AS gioKetThuc, GiaMoiGio AS giaMoiGio
     FROM BangGia WHERE MaCoSo=? ORDER BY LoaiNgay, LoaiKhach, GioBatDau`,
    [san.maCoSo]);
  return { ...san, bangGia };
}

async function kiemTraTrong(maSan, boLoc) {
  const san = await layThongTinSan(maSan);
  const conTrong = await kiemTraKhungDat(san, boLoc.ngay, boLoc.gioBatDau, boLoc.gioKetThuc);
  return { maSan, ngay: boLoc.ngay, gioBatDau: boLoc.gioBatDau, gioKetThuc: boLoc.gioKetThuc, conTrong };
}

async function lietKeDatSan(maNguoiDung) {
  await hetHanDatSan(maNguoiDung);
  const [cacDon] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaLichCoDinh AS maLichCoDinh,
       d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       d.TongTien AS tongTien, d.TrangThai AS trangThai, t.TrangThai AS trangThaiThanhToan
     FROM DatSan d LEFT JOIN ThanhToan t ON t.MaDatSan=CASE
       WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
       ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
     END
     WHERE d.MaKhachHang=? ORDER BY d.NgayChoi DESC, d.GioBatDau DESC`,
    [maNguoiDung]);
  return cacDon;
}

async function layHoaDonNhap(maNguoiDung, maDatSan) {
  await hetHanDatSan(maNguoiDung);
  const [[hoaDon]] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.NgayChoi AS ngay,
       d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc, d.TongTien AS tongTien,
       d.TrangThai AS trangThaiDatSan, d.HetHanGiuCho AS hetHanGiuCho,
       t.MaThanhToan AS maThanhToan, t.SoTien AS soTien, t.TrangThai AS trangThaiThanhToan,
       t.NoiDungChuyenKhoan AS noiDungChuyenKhoan, t.NoiDungQR AS noiDungQr
     FROM DatSan d JOIN ThanhToan t ON t.MaDatSan=CASE
       WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
       ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
     END
     WHERE d.MaDatSan=? AND d.MaKhachHang=?`,
    [maDatSan, maNguoiDung]);
  if (!hoaDon) throw AppError.khongTimThay('Không tìm thấy hóa đơn');
  const anhQrUrl = ['pending', 'confirming'].includes(hoaDon.trangThaiThanhToan)
    ? hoaDon.noiDungQr || taoAnhQrUrl(hoaDon.noiDungChuyenKhoan, Number(hoaDon.soTien))
    : null;
  return { ...hoaDon, anhQrUrl };
}

async function huyDatSan(maNguoiDung, maDatSan) {
  return thucHienGiaoDich(async (ketNoi) => {
    await hetHanDatSan(maNguoiDung, ketNoi);
    const [[donDatSan]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh, d.NgayChoi AS ngay,
         d.GioBatDau AS gioBatDau, d.TongTien AS tongTien, d.TrangThai AS trangThai,
         t.MaThanhToan AS maThanhToan, t.TrangThai AS trangThaiThanhToan
       FROM DatSan d LEFT JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
       WHERE d.MaDatSan=? AND d.MaKhachHang=? FOR UPDATE`,
      [maDatSan, maNguoiDung]);
    if (!donDatSan) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    if (!['pending_payment', 'confirmed'].includes(donDatSan.trangThai)) {
      throw AppError.biTrung('Đơn đặt sân không thể hủy ở trạng thái hiện tại');
    }
    const danhSachMaDon = donDatSan.maLichCoDinh
      ? (await ketNoi.query(
        `SELECT MaDatSan AS maDatSan, NgayChoi AS ngay, GioBatDau AS gioBatDau,
           TongTien AS tongTien FROM DatSan
         WHERE MaLichCoDinh=? AND NgayChoi>=CURDATE()
           AND TrangThai IN ('pending_payment','confirmed') FOR UPDATE`,
        [donDatSan.maLichCoDinh]))[0]
      : [{ maDatSan, ngay: donDatSan.ngay, gioBatDau: donDatSan.gioBatDau, tongTien: donDatSan.tongTien }];
    if (!danhSachMaDon.length) throw AppError.biTrung('Không còn buổi nào có thể hủy');

    let soTienHoan = 0;
    if (donDatSan.trangThaiThanhToan === 'success') {
      const gioMienPhi = await layCauHinh(ketNoi, 'cancel_free_hours');
      const tiLeHoanMuon = await layCauHinh(ketNoi, 'late_cancel_refund_percent');
      for (const muc of danhSachMaDon) {
        const batDau = new Date(`${muc.ngay}T${String(muc.gioBatDau).slice(0, 8)}+07:00`);
        const conGio = (batDau.getTime() - Date.now()) / 3_600_000;
        soTienHoan += conGio >= gioMienPhi
          ? Number(muc.tongTien)
          : Math.round(Number(muc.tongTien) * tiLeHoanMuon / 100);
      }
    }
    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='cancelled', NguoiHuy='customer',
         LyDoHuy='Khach hang huy don', NgayHuy=NOW()
       WHERE MaDatSan IN (${danhSachMaDon.map(() => '?').join(',')})`,
      danhSachMaDon.map((muc) => muc.maDatSan));
    if (donDatSan.maLichCoDinh) {
      await ketNoi.query("UPDATE LichCoDinh SET TrangThai='cancelled' WHERE MaLichCoDinh=?", [donDatSan.maLichCoDinh]);
    }
    if (donDatSan.maThanhToan) {
      if (soTienHoan > 0) {
        await ketNoi.query(
          `UPDATE ThanhToan SET SoTienHoan=?, TrangThaiHoanTien='waiting_info'
           WHERE MaThanhToan=? AND TrangThai='success'`,
          [soTienHoan, donDatSan.maThanhToan]);
      } else {
        await ketNoi.query(
          `UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan=? AND TrangThai='pending'`,
          [donDatSan.maThanhToan]);
      }
    }
    return { daHuy: true, soTienHoanDuKien: soTienHoan, canCapNhatTaiKhoanHoan: soTienHoan > 0 };
  });
}

async function capNhatTaiKhoanHoan(maNguoiDung, maDatSan, thongTin) {
  const [ketQua] = await pool.query(
    `UPDATE ThanhToan t JOIN DatSan d ON d.MaDatSan=t.MaDatSan
     SET t.TenNganHangHoan=?, t.MaNganHangHoan=?, t.SoTaiKhoanHoan=?, t.ChuTaiKhoanHoan=?
     WHERE d.MaDatSan=? AND d.MaKhachHang=? AND t.TrangThaiHoanTien='waiting_info'`,
    [thongTin.tenNganHang, thongTin.maNganHang, thongTin.soTaiKhoan, thongTin.chuTaiKhoan, maDatSan, maNguoiDung]);
  if (!ketQua.affectedRows) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền cần bổ sung tài khoản');
  return { daCapNhat: true };
}

module.exports = {
  timCoSo,
  layChiTietCoSo,
  layChiTietSan,
  kiemTraTrong,
  taoDatSan,
  lietKeDatSan,
  layHoaDonNhap,
  huyDatSan,
  capNhatTaiKhoanHoan,
};
