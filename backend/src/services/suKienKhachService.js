// G7.6–G7.7: nghiệp vụ khách xem, lọc, đăng ký/rút, xem hóa đơn và gửi chứng từ phí sự kiện.
// Quy tắc: docs/agent/features/events/rules.md (KH-01…KH-09). G7.11 tích hợp thông báo sự kiện.
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const suKien = require('../utils/suKien');
const { layCauHinhSo } = require('./cauHinhService');
const { tinhTiLeHoan, MAC_DINH: HOAN_MAC_DINH } = require('../utils/chinhSachHoanTien');
const { taoThanhToanChoDangKy } = require('./ownerSuKienService');
const { guiThongBao } = require('./notificationService');
const fs = require('fs/promises');
const { layDuongDanTep, laAnhThat } = require('../middlewares/upload');
const chungTu = require('./chungTuService');
const { timNganHang } = require('../utils/nganHang');
const { taoAnhQrUrl, taoNoiDungQr, layTaiKhoanChuSan } = require('../utils/vietqr');

const TRANG_THAI_DANG_KY = ['pending', 'accepted', 'cancelled', 'rejected'];
const SO_LAN_RUT_TOI_DA = 3;
// Chủ sân quá hạn duyệt chứng từ: thanh toán `confirming` quá HanXacNhan, hoặc đã bị job hủy vì lý do đó.
// Cột/bảng dùng bí danh `tt` (ThanhToanSuKien) và `dk` (DangKySuKien).
// Giống đặt sân: quá HanXacNhan mà chủ sân chưa duyệt → khách được khiếu nại "chậm duyệt" (đơn vẫn giữ chỗ, chủ sân vẫn duyệt muộn được);
// đến hết giờ sự kiện mà vẫn chưa duyệt → hệ thống hủy, hoàn 100% (job).
const SQL_CHAM_DUYET = `((tt.TrangThai = 'confirming' AND tt.HanXacNhan IS NOT NULL AND tt.HanXacNhan < NOW())
  OR (dk.NguoiHuy = 'system' AND dk.LyDo = '${suKien.LY_DO_QUA_HAN_DUYET}'))`;
const SQL_DA_HUY_QUA_HAN = `(dk.NguoiHuy = 'system' AND dk.LyDo = '${suKien.LY_DO_QUA_HAN_DUYET}')`;

function chuanHoaTrang(trang, soLuong) {
  const gioiHan = Math.min(Math.max(Number(soLuong) || 20, 1), 50);
  const soTrang = Math.max(Number(trang) || 1, 1);
  return { trang: soTrang, soLuong: gioiHan, lech: (soTrang - 1) * gioiHan };
}

function chuanHoaTrinhDo(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || !suKien.laTrinhDoHopLe(n)) {
    throw AppError.duLieuKhongHopLe('Trình độ lọc phải từ 1 đến 8', { truong: 'trinhDo' });
  }
  return n;
}

function chuanHoaNgay(ngay) {
  if (ngay === undefined || ngay === null || ngay === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ngay))) {
    throw AppError.duLieuKhongHopLe('Ngày lọc phải có dạng YYYY-MM-DD', { truong: 'ngay' });
  }
  const d = new Date(`${ngay}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ngay) {
    throw AppError.duLieuKhongHopLe('Ngày lọc không hợp lệ', { truong: 'ngay' });
  }
  return ngay;
}

function chuanHoaBoolean(value, truong) {
  if (value === undefined || value === null || value === '') return null;
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  throw AppError.duLieuKhongHopLe(`${truong} không hợp lệ`, { truong });
}

async function kiemTraKhachActive(ketNoi, maKhachHang, khoa = false) {
  const [[khach]] = await ketNoi.query(
    `SELECT MaNguoiDung AS maKhachHang, HoTen AS tenKhach, SoDienThoai AS soDienThoai,
       GioiTinh AS gioiTinh, VaiTro AS vaiTro, TrangThai AS trangThai
     FROM NguoiDung WHERE MaNguoiDung = ? ${khoa ? 'FOR UPDATE' : ''}`,
    [maKhachHang]);
  if (!khach || khach.vaiTro !== 'customer') throw AppError.khongDuQuyen('Chức năng này chỉ dành cho tài khoản khách hàng');
  if (khach.trangThai !== 'active') throw AppError.khongDuQuyen('Tài khoản đang bị khóa, không thể đăng ký sự kiện');
  if (!khach.soDienThoai) {
    throw AppError.duLieuKhongHopLe('Vui lòng cập nhật số điện thoại trong hồ sơ trước khi đăng ký sự kiện', { truong: 'soDienThoai' });
  }
  return khach;
}

// Đếm accepted ở cấp sự kiện (Giao lưu) hoặc hạng mục (Giải đấu).
async function demSoDaNhan(ketNoi, maSuKien, maHangMuc) {
  const dieuKien = maHangMuc === null ? 'MaSuKien = ?' : 'MaHangMuc = ?';
  const thamSo = [maHangMuc === null ? maSuKien : maHangMuc];
  const [[dong]] = await ketNoi.query(
    `SELECT COUNT(*) AS soDaNhan FROM DangKySuKien WHERE ${dieuKien} AND TrangThai = 'accepted'`, thamSo);
  return Number(dong.soDaNhan);
}

async function docSuKienChoKhach(ketNoi, maSuKien, { khoa = false, kiemTraCongKhai = true } = {}) {
  const [[sk]] = await ketNoi.query(
    `SELECT sk.MaSuKien AS maSuKien, sk.MaCoSo AS maCoSo, sk.MaChuSan AS maChuSan,
       sk.Loai AS loai, sk.TieuDe AS tieuDe, sk.MoTa AS moTa, sk.DieuLe AS dieuLe, sk.AnhBia AS anhBia,
       sk.NgaySuKien AS ngay, sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc,
       sk.HanDangKy AS hanDangKy, sk.SoLuongToiDa AS soLuongToiDa,
       sk.TrinhDoTu AS trinhDoTu, sk.TrinhDoDen AS trinhDoDen, sk.CheDoDuyet AS cheDoDuyet,
       sk.Phi AS phi, sk.GhiChuPhi AS ghiChuPhi, sk.TrangThai AS trangThai, sk.BiAn AS biAn,
       cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi, cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen,
       cs.SoDienThoai AS soDienThoaiCoSo, cs.TrangThai AS trangThaiCoSo,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia,
       nd.HoTen AS tenChuSan
     FROM SuKien sk JOIN CoSo cs ON cs.MaCoSo = sk.MaCoSo
       JOIN NguoiDung nd ON nd.MaNguoiDung = sk.MaChuSan
     WHERE sk.MaSuKien = ? ${khoa ? 'FOR UPDATE' : ''}`,
    [maSuKien]);
  if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');
  if (kiemTraCongKhai && sk.biAn) throw AppError.khongTimThay('Sự kiện không tồn tại hoặc đã bị ẩn');
  if (kiemTraCongKhai && sk.trangThaiCoSo !== 'active') throw AppError.khongTimThay('Sự kiện không tồn tại hoặc cơ sở không hoạt động');
  return sk;
}

async function docHangMuc(ketNoi, maSuKien) {
  const [hangMuc] = await ketNoi.query(
    `SELECT hm.MaHangMuc AS maHangMuc, hm.TenHangMuc AS tenHangMuc, hm.LaDoi AS laDoi,
       hm.SoLuongToiDa AS soLuongToiDa,
       (SELECT COUNT(*) FROM DangKySuKien dk WHERE dk.MaHangMuc = hm.MaHangMuc AND dk.TrangThai = 'accepted') AS soDaNhan,
       (SELECT COUNT(*) FROM DangKySuKien dk WHERE dk.MaHangMuc = hm.MaHangMuc AND dk.TrangThai = 'pending') AS soChoDuyet
     FROM HangMucSuKien hm WHERE hm.MaSuKien = ? ORDER BY hm.MaHangMuc`, [maSuKien]);
  return hangMuc.map((hm) => ({
    ...hm, laDoi: !!hm.laDoi, soLuongToiDa: Number(hm.soLuongToiDa),
    soDaNhan: Number(hm.soDaNhan), soChoDuyet: Number(hm.soChoDuyet),
    soChoConLai: Math.max(0, Number(hm.soLuongToiDa) - Number(hm.soDaNhan)),
  }));
}

function taoTrangThaiHienThi(sk, soDaNhan, soToiDa) {
  return suKien.tinhTrangThaiHienThiSuKien({
    trangThai: sk.trangThai,
    hanDangKy: suKien.chuanHoaHanDangKy(sk.hanDangKy),
    soDaNhan,
    soToiDa,
  }, new Date());
}

// KH-01…KH-03: danh sách sự kiện công khai, chỉ trả số lượng đăng ký, không trả danh sách người tham gia.
// Bo loc: khuVuc (khớp tỉnh/quận), maCoSo, ngay, loai, trinhDo, phi=free|paid, conCho=true|false.
async function lietKeSuKien({
  khuVuc, maCoSo, ngay, loai, trinhDo, phi, conCho, trang = 1, soLuong = 20,
} = {}) {
  const phanTrang = chuanHoaTrang(trang, soLuong);
  const ngayLoc = chuanHoaNgay(ngay);
  const trinhDoLoc = chuanHoaTrinhDo(trinhDo);
  const conChoLoc = chuanHoaBoolean(conCho, 'conCho');
  const dieuKien = [
    "sk.TrangThai = 'open'", 'sk.BiAn = 0', "cs.TrangThai = 'active'", "nd.TrangThai = 'active'",
    'TIMESTAMP(sk.NgaySuKien, sk.GioBatDau) > NOW()', 'sk.HanDangKy >= NOW()',
  ];
  const thamSo = [];
  if (khuVuc && String(khuVuc).trim()) {
    dieuKien.push('(cs.TinhThanh LIKE ? OR cs.QuanHuyen LIKE ? OR cs.DiaChi LIKE ?)');
    const tuKhoa = `%${String(khuVuc).trim()}%`;
    thamSo.push(tuKhoa, tuKhoa, tuKhoa);
  }
  if (maCoSo !== undefined && maCoSo !== null && maCoSo !== '') {
    const id = Number(maCoSo);
    if (!Number.isInteger(id) || id < 1) throw AppError.duLieuKhongHopLe('Cơ sở không hợp lệ', { truong: 'maCoSo' });
    dieuKien.push('sk.MaCoSo = ?'); thamSo.push(id);
  }
  if (ngayLoc) { dieuKien.push('sk.NgaySuKien = ?'); thamSo.push(ngayLoc); }
  if (loai) {
    if (!['social', 'tournament'].includes(loai)) throw AppError.duLieuKhongHopLe('Loại sự kiện không hợp lệ', { truong: 'loai' });
    dieuKien.push('sk.Loai = ?'); thamSo.push(loai);
  }
  if (trinhDoLoc !== null) { dieuKien.push('sk.TrinhDoTu <= ? AND sk.TrinhDoDen >= ?'); thamSo.push(trinhDoLoc, trinhDoLoc); }
  if (phi !== undefined && phi !== null && phi !== '') {
    if (!['free', 'paid'].includes(phi)) throw AppError.duLieuKhongHopLe('Bộ lọc phí phải là free hoặc paid', { truong: 'phi' });
    dieuKien.push(phi === 'free' ? 'sk.Phi = 0' : 'sk.Phi > 0');
  }
  const dieuKienConCho = `(
    (sk.Loai = 'social' AND (SELECT COUNT(*) FROM DangKySuKien dk
      WHERE dk.MaSuKien = sk.MaSuKien AND dk.TrangThai = 'accepted') < sk.SoLuongToiDa)
    OR (sk.Loai = 'tournament' AND EXISTS (
      SELECT 1 FROM HangMucSuKien hm WHERE hm.MaSuKien = sk.MaSuKien
        AND (SELECT COUNT(*) FROM DangKySuKien dk WHERE dk.MaHangMuc = hm.MaHangMuc AND dk.TrangThai = 'accepted') < hm.SoLuongToiDa
    ))
  )`;
  if (conChoLoc === true) dieuKien.push(dieuKienConCho);
  if (conChoLoc === false) dieuKien.push(`NOT ${dieuKienConCho}`);

  const where = dieuKien.join(' AND ');
  const [cacSuKien] = await pool.query(
    `SELECT sk.MaSuKien AS maSuKien, sk.MaCoSo AS maCoSo, sk.Loai AS loai,
       sk.TieuDe AS tieuDe, sk.AnhBia AS anhBia, sk.NgaySuKien AS ngay,
       sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc, sk.HanDangKy AS hanDangKy,
       sk.TrinhDoTu AS trinhDoTu, sk.TrinhDoDen AS trinhDoDen, sk.Phi AS phi,
       cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi, cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen,
       cs.DiemTrungBinh AS diemTrungBinh, cs.SoDanhGia AS soDanhGia,
       CASE WHEN sk.Loai = 'social' THEN sk.SoLuongToiDa
         ELSE (SELECT SUM(hm.SoLuongToiDa) FROM HangMucSuKien hm WHERE hm.MaSuKien = sk.MaSuKien) END AS soLuongToiDa,
       (SELECT COUNT(*) FROM DangKySuKien dk WHERE dk.MaSuKien = sk.MaSuKien AND dk.TrangThai = 'accepted') AS soDaNhan,
       (SELECT COUNT(*) FROM DangKySuKien dk WHERE dk.MaSuKien = sk.MaSuKien AND dk.TrangThai = 'pending') AS soChoDuyet,
       (SELECT COUNT(*) FROM HangMucSuKien hm WHERE hm.MaSuKien = sk.MaSuKien) AS soHangMuc,
       EXISTS(SELECT 1 FROM KhoaSan ks WHERE ks.MaSuKien = sk.MaSuKien) AS coSanDaGiu
     FROM SuKien sk JOIN CoSo cs ON cs.MaCoSo = sk.MaCoSo
       JOIN NguoiDung nd ON nd.MaNguoiDung = sk.MaChuSan
     WHERE ${where}
     ORDER BY sk.NgaySuKien ASC, sk.GioBatDau ASC, sk.MaSuKien DESC LIMIT ? OFFSET ?`,
    [...thamSo, phanTrang.soLuong, phanTrang.lech]);
  const [[dem]] = await pool.query(
    `SELECT COUNT(*) AS tong FROM SuKien sk JOIN CoSo cs ON cs.MaCoSo = sk.MaCoSo
       JOIN NguoiDung nd ON nd.MaNguoiDung = sk.MaChuSan WHERE ${where}`, thamSo);

  const danhSach = cacSuKien.map((sk) => {
    const soToiDa = sk.soLuongToiDa === null ? null : Number(sk.soLuongToiDa);
    const soDaNhan = Number(sk.soDaNhan);
    const hienThi = taoTrangThaiHienThi(sk, soDaNhan, soToiDa);
    return {
      ...sk,
      phi: Number(sk.phi),
      soLuongToiDa: soToiDa,
      soDaNhan,
      soChoDuyet: Number(sk.soChoDuyet),
      soChoConLai: soToiDa === null ? null : Math.max(0, soToiDa - soDaNhan),
      soHangMuc: Number(sk.soHangMuc),
      ghiChuTrinhDo: suKien.moTaKhoangTrinhDo(sk.trinhDoTu, sk.trinhDoDen),
      trangThaiHienThi: hienThi.ma,
      nhanTrangThai: hienThi.nhan,
    };
  });
  return { tong: Number(dem.tong), trang: phanTrang.trang, soLuong: phanTrang.soLuong, cacSuKien: danhSach };
}

// KH-02/KH-03: chi tiết công khai, chỉ số lượng; tuyệt đối không trả tên/SĐT người đã đăng ký.
async function docChiTiet(maKhachHang, maSuKien) {
  const sk = await docSuKienChoKhach(pool, maSuKien);
  const [hangMuc, cacSan, dem] = await Promise.all([
    docHangMuc(pool, maSuKien),
    pool.query(
      `SELECT s.MaSan AS maSan, s.TenSan AS tenSan FROM KhoaSan k JOIN San s ON s.MaSan = k.MaSan
       WHERE k.MaSuKien = ? ORDER BY s.TenSan`, [maSuKien]).then(([rows]) => rows),
    pool.query(
      `SELECT SUM(TrangThai = 'accepted') AS soDaNhan, SUM(TrangThai = 'pending') AS soChoDuyet
       FROM DangKySuKien WHERE MaSuKien = ?`, [maSuKien]).then(([rows]) => rows[0]),
  ]);
  const soDaNhan = Number(dem.soDaNhan || 0);
  const soChoDuyet = Number(dem.soChoDuyet || 0);
  const soToiDa = sk.loai === 'social' ? Number(sk.soLuongToiDa) : hangMuc.reduce((tong, hm) => tong + hm.soLuongToiDa, 0);
  const hienThi = taoTrangThaiHienThi(sk, soDaNhan, soToiDa);
  const [[dangKyCuaToi]] = maKhachHang ? await pool.query(
    `SELECT MaDangKy AS maDangKy, TrangThai AS trangThai FROM DangKySuKien
     WHERE MaSuKien = ? AND MaKhachHang = ?`, [maSuKien, maKhachHang]) : [[null]];
  return {
    maSuKien: sk.maSuKien, maCoSo: sk.maCoSo, loai: sk.loai, tieuDe: sk.tieuDe,
    moTa: sk.moTa, dieuLe: sk.dieuLe, anhBia: sk.anhBia, ngay: sk.ngay,
    gioBatDau: sk.gioBatDau, gioKetThuc: sk.gioKetThuc, hanDangKy: sk.hanDangKy,
    trinhDoTu: sk.trinhDoTu, trinhDoDen: sk.trinhDoDen,
    ghiChuTrinhDo: suKien.moTaKhoangTrinhDo(sk.trinhDoTu, sk.trinhDoDen),
    phi: Number(sk.phi), ghiChuPhi: sk.ghiChuPhi, cheDoDuyet: sk.cheDoDuyet,
    coSo: {
      tenCoSo: sk.tenCoSo, diaChi: sk.diaChi, tinhThanh: sk.tinhThanh, quanHuyen: sk.quanHuyen,
      soDienThoai: sk.soDienThoaiCoSo, diemTrungBinh: Number(sk.diemTrungBinh), soDanhGia: Number(sk.soDanhGia),
    },
    tenChuSan: sk.tenChuSan,
    cacSan,
    soLuongToiDa: sk.loai === 'social' ? soToiDa : null,
    soDaNhan, soChoDuyet,
    soChoConLai: sk.loai === 'social' ? Math.max(0, soToiDa - soDaNhan) : null,
    hangMuc,
    trangThaiHienThi: hienThi.ma, nhanTrangThai: hienThi.nhan,
    dangKyCuaToi: dangKyCuaToi ? { maDangKy: dangKyCuaToi.maDangKy, trangThai: dangKyCuaToi.trangThai } : null,
  };
}

// KH-05: chỉ cảnh báo, không chặn nếu khách đã đăng ký sự kiện khác bị trùng giờ.
async function timSuKienTrungGio(ketNoi, maKhachHang, maSuKien) {
  const [cacDong] = await ketNoi.query(
    `SELECT sk.MaSuKien AS maSuKien, sk.TieuDe AS tieuDe, sk.NgaySuKien AS ngay,
       sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc
     FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
     WHERE dk.MaKhachHang = ? AND dk.MaSuKien <> ? AND dk.TrangThai IN ('pending','accepted')
       AND sk.TrangThai <> 'cancelled' AND sk.NgaySuKien = (
         SELECT NgaySuKien FROM SuKien WHERE MaSuKien = ?
       )
       AND sk.GioBatDau < (SELECT GioKetThuc FROM SuKien WHERE MaSuKien = ?)
       AND sk.GioKetThuc > (SELECT GioBatDau FROM SuKien WHERE MaSuKien = ?)
     ORDER BY sk.GioBatDau`, [maKhachHang, maSuKien, maSuKien, maSuKien, maSuKien]);
  return cacDong;
}

// KH-04/KH-06/KH-07/KH-09: tạo mới hoặc tái sử dụng dòng cancelled; auto nhận ngay, manual chờ chủ sân duyệt.
// Khóa SuKien trước, sau đó khóa tài khoản khách + đăng ký cũ/hạng mục để tuần tự hóa số chỗ.
async function dangKySuKien(maKhachHang, maSuKien, du = {}) {
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    const sk = await docSuKienChoKhach(ketNoi, maSuKien, { khoa: true });
    const khach = await kiemTraKhachActive(ketNoi, maKhachHang, true);
    const bayGio = new Date();
    const moDangKy = suKien.kiemTraMoDangKy({
      trangThai: sk.trangThai, biAn: !!sk.biAn,
      hanDangKy: suKien.chuanHoaHanDangKy(sk.hanDangKy),
      batDau: suKien.thoiDiemVN(sk.ngay, sk.gioBatDau), coSoActive: sk.trangThaiCoSo === 'active',
    }, bayGio);
    if (!moDangKy.mo) {
      const thongBao = {
        an: 'Sự kiện không tồn tại hoặc đã bị ẩn',
        co_so_khoa: 'Cơ sở đang không hoạt động, không thể đăng ký',
        khong_mo: 'Sự kiện hiện không nhận đăng ký',
        qua_han: 'Đã hết hạn đăng ký sự kiện',
        da_bat_dau: 'Sự kiện đã bắt đầu, không thể đăng ký',
      }[moDangKy.lyDo] || 'Sự kiện hiện không nhận đăng ký';
      throw AppError.biTrung(thongBao, 'REGISTRATION_CLOSED');
    }

    let maHangMuc = null;
    let laDoi = false;
    if (sk.loai === 'social') {
      if (du.maHangMuc !== undefined && du.maHangMuc !== null && du.maHangMuc !== '') {
        throw AppError.duLieuKhongHopLe('Sự kiện Giao lưu không có hạng mục', { truong: 'maHangMuc' });
      }
      if (sk.cheDoDuyet === 'auto' && !suKien.conCho(await demSoDaNhan(ketNoi, maSuKien, null), Number(sk.soLuongToiDa))) {
        throw AppError.biTrung('Sự kiện đã đủ chỗ', 'EVENT_FULL');
      }
    } else {
      const idHangMuc = Number(du.maHangMuc);
      if (!Number.isInteger(idHangMuc) || idHangMuc < 1) {
        throw AppError.duLieuKhongHopLe('Vui lòng chọn hạng mục của giải đấu', { truong: 'maHangMuc' });
      }
      const [[hm]] = await ketNoi.query(
        `SELECT MaHangMuc AS maHangMuc, TenHangMuc AS tenHangMuc, LaDoi AS laDoi, SoLuongToiDa AS soLuongToiDa
         FROM HangMucSuKien WHERE MaHangMuc = ? AND MaSuKien = ? FOR UPDATE`, [idHangMuc, maSuKien]);
      if (!hm) throw AppError.duLieuKhongHopLe('Hạng mục không thuộc sự kiện này', { truong: 'maHangMuc' });
      maHangMuc = hm.maHangMuc;
      laDoi = !!hm.laDoi;
      // Giới tính lấy từ hồ sơ (không cho khách tự chọn): hạng mục Nam/Nữ chỉ nhận đúng giới tính.
      const gioiTinhYeuCau = suKien.gioiTinhYeuCauCuaHangMuc(hm.tenHangMuc);
      if (gioiTinhYeuCau) {
        if (khach.gioiTinh !== 'male' && khach.gioiTinh !== 'female') {
          throw AppError.duLieuKhongHopLe('Hồ sơ của bạn chưa có giới tính. Vui lòng cập nhật giới tính trong hồ sơ trước khi đăng ký hạng mục này.',
            { truong: 'gioiTinh' });
        }
        if (khach.gioiTinh !== gioiTinhYeuCau) {
          const tenYeuCau = gioiTinhYeuCau === 'male' ? 'Nam' : 'Nữ';
          const tenKhach = khach.gioiTinh === 'male' ? 'Nam' : 'Nữ';
          throw AppError.biTrung(
            `Bạn chọn hạng mục ${tenYeuCau} (${hm.tenHangMuc}) nhưng giới tính của bạn là ${tenKhach} nên không thể đăng ký.`,
            'GENDER_NOT_ALLOWED');
        }
      }
      if (laDoi) {
        const tenDongDoi = typeof du.tenDongDoi === 'string' ? du.tenDongDoi.trim() : '';
        const sdtDongDoi = typeof du.sdtDongDoi === 'string' ? du.sdtDongDoi.trim() : '';
        if (!tenDongDoi) throw AppError.duLieuKhongHopLe('Vui lòng nhập tên đồng đội', { truong: 'tenDongDoi' });
        if (!sdtDongDoi) throw AppError.duLieuKhongHopLe('Vui lòng nhập số điện thoại đồng đội', { truong: 'sdtDongDoi' });
        if (tenDongDoi.length > 100 || sdtDongDoi.length > 20) {
          throw AppError.duLieuKhongHopLe('Thông tin đồng đội vượt quá độ dài cho phép', { truong: 'dongDoi' });
        }
      }
      if (sk.cheDoDuyet === 'auto' && !suKien.conCho(await demSoDaNhan(ketNoi, maSuKien, maHangMuc), Number(hm.soLuongToiDa))) {
        throw AppError.biTrung('Hạng mục đã đủ chỗ', 'EVENT_FULL');
      }
    }

    const trinhDoKhai = du.trinhDoKhai === undefined || du.trinhDoKhai === null || du.trinhDoKhai === ''
      ? null : Number(du.trinhDoKhai);
    if (trinhDoKhai !== null && (!Number.isInteger(trinhDoKhai) || !suKien.laTrinhDoHopLe(trinhDoKhai))) {
      throw AppError.duLieuKhongHopLe('Trình độ phải từ 1 đến 8', { truong: 'trinhDoKhai' });
    }
    const canhBaoTrinhDo = suKien.trinhDoNgoaiKhoang(sk.trinhDoTu, sk.trinhDoDen, trinhDoKhai);

    // Giới tính luôn lấy từ hồ sơ khách (có thể NULL với sự kiện giao lưu / hạng mục không giới hạn).
    const gioiTinh = khach.gioiTinh ?? null;

    // Tái sử dụng dòng cũ theo UNIQUE (MaSuKien, KhoaHangMuc, MaKhachHang). rejected là trạng thái cuối.
    const [[cu]] = await ketNoi.query(
      `SELECT MaDangKy AS maDangKy, TrangThai AS trangThai, SoLanRut AS soLanRut
       FROM DangKySuKien WHERE MaSuKien = ? AND KhoaHangMuc = IFNULL(?,0) AND MaKhachHang = ? FOR UPDATE`,
      [maSuKien, maHangMuc, maKhachHang]);
    if (cu && cu.trangThai !== 'cancelled') {
      throw AppError.biTrung('Bạn đã đăng ký sự kiện/hạng mục này rồi', 'ALREADY_REGISTERED');
    }
    if (cu && cu.trangThai === 'cancelled' && Number(cu.soLanRut) >= SO_LAN_RUT_TOI_DA) {
      throw AppError.biTrung(`Bạn đã rút đăng ký ${SO_LAN_RUT_TOI_DA} lần, không thể đăng ký lại sự kiện này`, 'WITHDRAW_LIMIT');
    }

    // KH-09: tối đa N đăng ký pending/accepted chưa diễn ra cho mỗi khách.
    const gioiHanDangKy = await layCauHinhSo(ketNoi, 'event_max_active_regs_per_customer', 10);
    const [[demDangKy]] = await ketNoi.query(
      `SELECT COUNT(*) AS soDangKy FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
       WHERE dk.MaKhachHang = ? AND dk.TrangThai IN ('pending','accepted')
         AND TIMESTAMP(sk.NgaySuKien, sk.GioBatDau) > NOW() AND sk.TrangThai NOT IN ('finished','cancelled')
         AND dk.MaDangKy <> ?`, [maKhachHang, cu?.maDangKy || 0]);
    if (Number(demDangKy.soDangKy) >= gioiHanDangKy) {
      throw AppError.biTrung(`Bạn chỉ được có tối đa ${gioiHanDangKy} đăng ký sự kiện đang chờ/được nhận`, 'ACTIVE_REGISTRATION_LIMIT');
    }

    // Chế độ manual nhận pending (không chiếm chỗ); auto nhận accepted và khóa chỗ.
    const trangThaiMoi = sk.cheDoDuyet === 'auto' ? 'accepted' : 'pending';
    const tenDongDoi = laDoi && typeof du.tenDongDoi === 'string' && du.tenDongDoi.trim() ? du.tenDongDoi.trim() : null;
    const sdtDongDoi = laDoi && typeof du.sdtDongDoi === 'string' && du.sdtDongDoi.trim() ? du.sdtDongDoi.trim() : null;
    let maDangKy;
    if (cu) {
      await ketNoi.query(
        `UPDATE DangKySuKien SET TrangThai = ?, NguoiHuy = NULL, LyDo = NULL,
           TenKhach = ?, SoDienThoai = ?, GioiTinh = ?, TrinhDoKhai = ?, TenDongDoi = ?, SdtDongDoi = ?,
           NgayDangKy = NOW(), NgayXuLy = IF(? = 'accepted', NOW(), NULL), NgayHuy = NULL
         WHERE MaDangKy = ?`,
        [trangThaiMoi, khach.tenKhach, khach.soDienThoai, gioiTinh, trinhDoKhai,
          tenDongDoi, sdtDongDoi, trangThaiMoi, cu.maDangKy]);
      maDangKy = cu.maDangKy;
    } else {
      const [kq] = await ketNoi.query(
        `INSERT INTO DangKySuKien
          (MaSuKien, MaHangMuc, MaKhachHang, TenKhach, SoDienThoai, GioiTinh, TrinhDoKhai, TenDongDoi, SdtDongDoi, TrangThai, NgayXuLy)
         VALUES (?,?,?,?,?,?,?,?,?,?, IF(? = 'accepted', NOW(), NULL))`,
        [maSuKien, maHangMuc, maKhachHang, khach.tenKhach, khach.soDienThoai, gioiTinh, trinhDoKhai,
          tenDongDoi, sdtDongDoi, trangThaiMoi, trangThaiMoi]);
      maDangKy = kq.insertId;
    }
    if (trangThaiMoi === 'accepted' && Number(sk.phi) > 0) {
      await taoThanhToanChoDangKy(ketNoi, { maDangKy, phi: Number(sk.phi) });
    }
    const canhBaoTrungGio = await timSuKienTrungGio(ketNoi, maKhachHang, maSuKien);
    let noiDungKhach = trangThaiMoi === 'accepted'
      ? `Bạn đã được nhận đăng ký tham gia sự kiện "${sk.tieuDe}".`
      : `Yêu cầu đăng ký sự kiện "${sk.tieuDe}" đã được gửi và đang chờ chủ sân duyệt.`;
    if (trangThaiMoi === 'accepted' && Number(sk.phi) > 0) {
      const [[tt]] = await ketNoi.query(
        'SELECT HanThanhToan AS hanThanhToan, TrangThai AS trangThai FROM ThanhToanSuKien WHERE MaDangKy=?', [maDangKy]);
      if (tt && tt.trangThai !== 'pending') noiDungKhach += ' Khoản phí bạn đã chuyển trước đó được giữ lại, không cần thanh toán lần nữa.';
      else noiDungKhach += ` Phí tham gia ${Number(sk.phi).toLocaleString('vi-VN')}đ; vui lòng chuyển khoản và gửi ảnh trước ${tt?.hanThanhToan || 'hạn hiển thị trong ứng dụng'}.`;
    }
    const khoaDangKyMoi = `event_registered:${maDangKy}:${Date.now()}`;
    await guiThongBao(ketNoi, {
      maNguoiDung: maKhachHang, loai: 'event_registered', tieuDe: trangThaiMoi === 'accepted' ? 'Đăng ký sự kiện thành công' : 'Đã gửi yêu cầu đăng ký',
      noiDung: noiDungKhach.slice(0, 500), loaiThamChieu: 'registration', maThamChieu: Number(maDangKy),
      khoa: `${khoaDangKyMoi}:customer`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: sk.maChuSan, loai: 'event_registered', tieuDe: 'Có người đăng ký sự kiện',
      noiDung: `${khach.tenKhach} đã đăng ký sự kiện "${sk.tieuDe}"${trangThaiMoi === 'pending' ? ' và đang chờ bạn duyệt' : ''}.`,
      loaiThamChieu: 'registration', maThamChieu: Number(maDangKy), khoa: `${khoaDangKyMoi}:owner`,
    });
    return { maDangKy, maSuKien, trangThai: trangThaiMoi, canhBaoTrinhDo, canhBaoTrungGio };
  });
  return { ...ketQua, dangKy: await docDangKyCuaKhach(maKhachHang, ketQua.maDangKy) };
}

// Chính sách hoàn tiền dùng chung với đặt sân (bảng cấu hình; thiếu thì mặc định 24h/12h/50%).
async function layCauHinhHoan(ketNoi) {
  return {
    gioMienPhi: await layCauHinhSo(ketNoi, 'cancel_free_hours', HOAN_MAC_DINH.gioMienPhi),
    gioNuaTien: await layCauHinhSo(ketNoi, 'cancel_half_hours', HOAN_MAC_DINH.gioNuaTien),
    tiLeNuaTien: await layCauHinhSo(ketNoi, 'late_cancel_refund_percent', HOAN_MAC_DINH.tiLeNuaTien),
  };
}

// Hàm thuần: nếu khách hủy ngay bây giờ thì hoàn bao nhiêu. Chỉ khoản phí đã chuyển (success/confirming) mới có hoàn.
function tinhHoanSuKien(sk, tt, cauHinhHoan, bayGio = Date.now()) {
  const daThanhToan = !!tt && ['success', 'confirming'].includes(tt.trangThai);
  const conGio = (suKien.thoiDiemVN(sk.ngay, sk.gioBatDau).getTime() - bayGio) / 3_600_000;
  const tongDaTra = daThanhToan ? Number(tt.soTien) : 0;
  const tiLeHoan = daThanhToan ? tinhTiLeHoan(conGio, cauHinhHoan) : 0;
  return {
    daThanhToan, tongDaTra, tiLeHoan,
    soTienHoan: Math.round(tongDaTra * tiLeHoan / 100),
    soGioConLai: Math.round(conGio * 10) / 10,
  };
}

// Kiểm tra chung cho xem trước và hủy thật (KH-08): đăng ký còn hiệu lực, chưa bắt đầu, chưa quá số lần rút.
function kiemTraDuocRut(sk, dk) {
  if (!dk || !['pending', 'accepted'].includes(dk.trangThai)) {
    throw AppError.biTrung('Chỉ rút được đăng ký đang chờ duyệt hoặc đã được nhận', 'INVALID_STATE');
  }
  if (suKien.thoiDiemVN(sk.ngay, sk.gioBatDau).getTime() <= Date.now()) {
    throw AppError.biTrung('Sự kiện đã bắt đầu, không thể rút đăng ký', 'INVALID_STATE');
  }
  if (Number(dk.soLanRut) >= SO_LAN_RUT_TOI_DA) {
    throw AppError.biTrung(`Bạn đã rút đăng ký ${SO_LAN_RUT_TOI_DA} lần`, 'WITHDRAW_LIMIT');
  }
}

// Xem trước kết quả hủy (KHÔNG ghi DB): app hiện đúng trường hợp hoàn 100% / 50% / không hoàn trước khi khách xác nhận.
async function xemTruocHuyDangKy(maKhachHang, maDangKy) {
  const [[tro]] = await pool.query(
    'SELECT MaSuKien AS maSuKien FROM DangKySuKien WHERE MaDangKy = ? AND MaKhachHang = ?', [maDangKy, maKhachHang]);
  if (!tro) throw AppError.khongTimThay('Không tìm thấy đăng ký');
  const sk = await docSuKienChoKhach(pool, tro.maSuKien, { kiemTraCongKhai: false });
  const [[dk]] = await pool.query(
    `SELECT TrangThai AS trangThai, SoLanRut AS soLanRut FROM DangKySuKien WHERE MaDangKy = ? AND MaKhachHang = ?`,
    [maDangKy, maKhachHang]);
  kiemTraDuocRut(sk, dk);
  const [[tt]] = await pool.query(
    'SELECT SoTien AS soTien, TrangThai AS trangThai FROM ThanhToanSuKien WHERE MaDangKy = ?', [maDangKy]);
  const cauHinhHoan = await layCauHinhHoan(pool);
  const ketQua = tinhHoanSuKien(sk, tt, cauHinhHoan);
  return {
    ...ketQua,
    gioMienPhi: cauHinhHoan.gioMienPhi,
    gioNuaTien: cauHinhHoan.gioNuaTien,
  };
}

// KH-08: khách được rút trước giờ bắt đầu, tối đa 3 lần rút–đăng ký lại.
// Phí đã chuyển: hoàn theo chính sách như đặt sân (≥24h 100%, 12–24h 50%, <12h không hoàn). Có hoàn → TrangThaiHoan='pending'
// + SoTienHoan để chủ sân tự chuyển khoản (đúng NT4; nền tảng không giữ tiền).
async function rutDangKy(maKhachHang, maDangKy, taiKhoanHoan = null) {
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    const [[tro]] = await ketNoi.query(
      'SELECT MaSuKien AS maSuKien FROM DangKySuKien WHERE MaDangKy = ? AND MaKhachHang = ?', [maDangKy, maKhachHang]);
    if (!tro) throw AppError.khongTimThay('Không tìm thấy đăng ký');
    const sk = await docSuKienChoKhach(ketNoi, tro.maSuKien, { khoa: true, kiemTraCongKhai: false });
    await kiemTraKhachActive(ketNoi, maKhachHang, true);
    const [[dk]] = await ketNoi.query(
      `SELECT MaDangKy AS maDangKy, TrangThai AS trangThai, SoLanRut AS soLanRut, TenKhach AS tenKhach
       FROM DangKySuKien WHERE MaDangKy = ? AND MaKhachHang = ? FOR UPDATE`, [maDangKy, maKhachHang]);
    kiemTraDuocRut(sk, dk);
    const [[tt]] = await ketNoi.query(
      `SELECT SoTien AS soTien, TrangThai AS trangThai FROM ThanhToanSuKien WHERE MaDangKy = ? FOR UPDATE`, [maDangKy]);
    const hoan = tinhHoanSuKien(sk, tt, await layCauHinhHoan(ketNoi));
    // Có tiền hoàn → BẮT BUỘC khách cung cấp tài khoản nhận (mã ngân hàng, số tài khoản, tên chủ TK) ngay lúc hủy.
    let nganHangHoan = null;
    if (hoan.soTienHoan > 0) {
      if (!taiKhoanHoan) {
        throw AppError.duLieuKhongHopLe(
          'Đăng ký này được hoàn phí nên bạn cần nhập tài khoản nhận hoàn (ngân hàng, số tài khoản, tên chủ tài khoản).',
          [{ truong: 'taiKhoanHoan', thongBao: 'Vui lòng nhập tài khoản nhận hoàn tiền.' }]);
      }
      nganHangHoan = timNganHang(taiKhoanHoan.maNganHang);
      if (!nganHangHoan) {
        throw AppError.duLieuKhongHopLe('Ngân hàng không hợp lệ.', [{ truong: 'maNganHang', thongBao: 'Vui lòng chọn ngân hàng.' }]);
      }
    }
    await ketNoi.query(
      `UPDATE DangKySuKien SET TrangThai = 'cancelled', NguoiHuy = 'customer',
         LyDo = 'Khách tự rút đăng ký', SoLanRut = SoLanRut + 1, NgayHuy = NOW() WHERE MaDangKy = ?`, [maDangKy]);
    let canHoanPhi = false;
    if (hoan.soTienHoan > 0) {
      const [choHoan] = await ketNoi.query(
        `UPDATE ThanhToanSuKien SET TrangThaiHoan = 'pending', SoTienHoan = ?,
           MaNganHangHoan = ?, TenNganHangHoan = ?, SoTaiKhoanHoan = ?, ChuTaiKhoanHoan = ?
         WHERE MaDangKy = ? AND TrangThai IN ('success','confirming') AND TrangThaiHoan = 'none'`,
        [hoan.soTienHoan, nganHangHoan.maNganHang, nganHangHoan.tenNganHang,
          taiKhoanHoan.soTaiKhoan, taiKhoanHoan.chuTaiKhoan, maDangKy]);
      canHoanPhi = choHoan.affectedRows > 0;
    }
    await ketNoi.query(
      `UPDATE ThanhToanSuKien SET TrangThai = 'cancelled'
       WHERE MaDangKy = ? AND TrangThai IN ('pending','confirming')`, [maDangKy]);
    const ghiChuHoan = canHoanPhi
      ? ` Cần hoàn ${hoan.soTienHoan.toLocaleString('vi-VN')}đ (${hoan.tiLeHoan}%) cho khách theo chính sách hoàn tiền: ${nganHangHoan.tenNganHang} · STK ${taiKhoanHoan.soTaiKhoan} · ${taiKhoanHoan.chuTaiKhoan}. Chủ sân tự chuyển khoản, nền tảng không giữ tiền.`
      : (hoan.daThanhToan ? ' Khách hủy sát giờ nên không được hoàn phí theo chính sách.' : '');
    await guiThongBao(ketNoi, {
      maNguoiDung: sk.maChuSan, loai: 'event_removed', tieuDe: 'Khách đã rút đăng ký sự kiện',
      noiDung: `${sk.tieuDe}: khách ${dk.tenKhach} đã rút đăng ký.${ghiChuHoan}`,
      loaiThamChieu: 'registration', maThamChieu: Number(maDangKy),
      khoa: `event_removed:customer:${maDangKy}:${Date.now()}`,
    });
    return {
      maDangKy: Number(maDangKy), trangThai: 'cancelled', soLanRut: Number(dk.soLanRut) + 1, canHoanPhi,
      daThanhToan: hoan.daThanhToan, tiLeHoan: hoan.tiLeHoan, soTienHoan: hoan.soTienHoan,
    };
  });
  return { ...ketQua, dangKy: await docDangKyCuaKhach(maKhachHang, maDangKy) };
}

async function docThanhToanCuaKhach(ketNoi, maDangKy) {
  const [[tt]] = await ketNoi.query(
    `SELECT tt.MaThanhToan AS maThanhToan, tt.SoTien AS soTien, tt.PhiNenTang AS phiNenTang, tt.TienChuSan AS tienChuSan,
       tt.TrangThai AS trangThai, tt.NoiDungChuyenKhoan AS noiDungChuyenKhoan, tt.HanThanhToan AS hanThanhToan,
       tt.HanXacNhan AS hanXacNhan, tt.LyDoLoi AS lyDoLoi, tt.NgayGuiAnh AS ngayGuiAnh, tt.NgayThanhToan AS ngayThanhToan,
       tt.TrangThaiHoan AS trangThaiHoan, tt.NgayHoan AS ngayHoan,
       IF(tt.TrangThaiHoan = 'none', NULL, COALESCE(tt.SoTienHoan, tt.SoTien)) AS soTienHoan,
       TIMESTAMPDIFF(SECOND, NOW(), tt.HanThanhToan) AS conLaiGiay,
       TIMESTAMPDIFF(SECOND, NOW(), tt.HanXacNhan) AS conLaiXacNhanGiay,
       ${SQL_CHAM_DUYET} AS chamDuyet,
       ${SQL_DA_HUY_QUA_HAN} AS daHuyQuaHan,
       (SELECT COUNT(*) FROM BaoCaoViPham b WHERE b.MaNguoiBaoCao = dk.MaKhachHang
          AND b.LoaiDoiTuong = 'event' AND b.MaDoiTuong = dk.MaSuKien) AS daBaoCao
     FROM ThanhToanSuKien tt JOIN DangKySuKien dk ON dk.MaDangKy = tt.MaDangKy
     WHERE tt.MaDangKy = ?`, [maDangKy]);
  if (!tt) return null;
  const [cacChungTu] = await ketNoi.query(
    `SELECT MaChungTu AS maChungTu, SoTien AS soTien, ThoiDiemChuyen AS thoiDiemChuyen,
       NgayGui AS ngayGui, Anh AS anhUrl, KetQua AS ketQua, NgayDuyet AS ngayDuyet, LyDo AS lyDo
     FROM ChungTuSuKien WHERE MaThanhToan = ? ORDER BY NgayGui DESC, MaChungTu DESC`, [tt.maThanhToan]);
  const { daBaoCao, chamDuyet, daHuyQuaHan, ...phanConLai } = tt;
  const quaHan = !!Number(chamDuyet);
  return {
    ...phanConLai,
    soTienHoan: tt.soTienHoan === null ? null : Number(tt.soTienHoan),
    conLaiGiay: tt.conLaiGiay === null ? null : Number(tt.conLaiGiay),
    conLaiXacNhanGiay: tt.conLaiXacNhanGiay === null ? null : Number(tt.conLaiXacNhanGiay),
    chamDuyet: quaHan,
    hoanPhi100: !!Number(daHuyQuaHan),
    coTheKhieuNai: quaHan && !Number(daBaoCao),
    cacChungTu,
  };
}

async function docDangKyCuaKhach(maKhachHang, maDangKy, ketNoi = pool) {
  const [[dong]] = await ketNoi.query(
    `SELECT dk.MaDangKy AS maDangKy, dk.MaSuKien AS maSuKien, dk.MaHangMuc AS maHangMuc,
       hm.TenHangMuc AS tenHangMuc, hm.LaDoi AS laDoi, dk.MaKhachHang AS maKhachHang,
       dk.TenKhach AS tenKhach, dk.SoDienThoai AS soDienThoai, dk.GioiTinh AS gioiTinh, dk.TrinhDoKhai AS trinhDoKhai,
       dk.TenDongDoi AS tenDongDoi, dk.SdtDongDoi AS sdtDongDoi, dk.TrangThai AS trangThai,
       dk.NguoiHuy AS nguoiHuy, dk.LyDo AS lyDo, dk.SoLanRut AS soLanRut,
       dk.NgayDangKy AS ngayDangKy, dk.NgayXuLy AS ngayXuLy, dk.NgayHuy AS ngayHuy,
       sk.Loai AS loaiSuKien, sk.TieuDe AS tieuDe, sk.AnhBia AS anhBia,
       sk.NgaySuKien AS ngay, sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc,
       sk.HanDangKy AS hanDangKy, sk.Phi AS phi, sk.GhiChuPhi AS ghiChuPhi, sk.TrangThai AS trangThaiSuKien,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, cs.DiaChi AS diaChi, cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen
     FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
       JOIN CoSo cs ON cs.MaCoSo = sk.MaCoSo LEFT JOIN HangMucSuKien hm ON hm.MaHangMuc = dk.MaHangMuc
     WHERE dk.MaDangKy = ? AND dk.MaKhachHang = ?`, [maDangKy, maKhachHang]);
  if (!dong) throw AppError.khongTimThay('Không tìm thấy đăng ký');
  return { ...dong, phi: Number(dong.phi), laDoi: dong.laDoi === null ? null : !!dong.laDoi,
    thanhToan: await docThanhToanCuaKhach(ketNoi, maDangKy) };
}


// Hóa đơn phí sự kiện: chỉ chủ đăng ký được xem; QR nhận tiền trực tiếp vào tài khoản chủ sân.
async function layHoaDonSuKien(maKhachHang, maDangKy) {
  const [[dong]] = await pool.query(
    `SELECT dk.MaDangKy AS maDangKy, dk.TrangThai AS trangThaiDangKy, sk.Phi AS phi,
       sk.MaChuSan AS maChuSan, sk.TieuDe AS tieuDe,
       tt.MaThanhToan AS maThanhToan, tt.SoTien AS soTien, tt.TrangThai AS trangThai,
       tt.NoiDungChuyenKhoan AS noiDungChuyenKhoan, tt.HanThanhToan AS hanThanhToan,
       tt.HanXacNhan AS hanXacNhan, tt.LyDoLoi AS lyDoLoi, tt.NgayGuiAnh AS ngayGuiAnh,
       tt.NgayThanhToan AS ngayThanhToan, tt.TrangThaiHoan AS trangThaiHoan, tt.NgayHoan AS ngayHoan,
       IF(tt.TrangThaiHoan = 'none', NULL, COALESCE(tt.SoTienHoan, tt.SoTien)) AS soTienHoan,
       TIMESTAMPDIFF(SECOND, NOW(), tt.HanThanhToan) AS conLaiGiay,
       TIMESTAMPDIFF(SECOND, NOW(), tt.HanXacNhan) AS conLaiXacNhanGiay,
       ${SQL_CHAM_DUYET} AS chamDuyet,
       ${SQL_DA_HUY_QUA_HAN} AS daHuyQuaHan,
       tt.NgayBatDauThanhToan IS NOT NULL AS daBatDau,
       (SELECT COUNT(*) FROM BaoCaoViPham b WHERE b.MaNguoiBaoCao = dk.MaKhachHang
          AND b.LoaiDoiTuong = 'event' AND b.MaDoiTuong = dk.MaSuKien) AS daBaoCao
     FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
       JOIN ThanhToanSuKien tt ON tt.MaDangKy = dk.MaDangKy
     WHERE dk.MaDangKy = ? AND dk.MaKhachHang = ?`, [maDangKy, maKhachHang]);
  if (!dong) throw AppError.khongTimThay('Không tìm thấy hóa đơn phí sự kiện');
  // Đăng ký bị hủy vì chủ sân quá hạn duyệt vẫn xem được hóa đơn (khách theo dõi hoàn 100% và khiếu nại).
  const quaHanDuyet = !!Number(dong.chamDuyet);
  const daHuyQuaHan = !!Number(dong.daHuyQuaHan);
  if (Number(dong.phi) <= 0 || (dong.trangThaiDangKy !== 'accepted' && !daHuyQuaHan)) {
    throw AppError.biTrung('Đăng ký này không có khoản phí đang cần thanh toán', 'INVALID_STATE');
  }
  const [cacChungTu] = await pool.query(
    `SELECT MaChungTu AS maChungTu, SoTien AS soTien, ThoiDiemChuyen AS thoiDiemChuyen,
       NgayGui AS ngayGui, Anh AS anhUrl, KetQua AS ketQua, NgayDuyet AS ngayDuyet, LyDo AS lyDo
     FROM ChungTuSuKien WHERE MaThanhToan = ? ORDER BY NgayGui DESC, MaChungTu DESC`, [dong.maThanhToan]);
  const coTheThanhToan = ['pending', 'confirming'].includes(dong.trangThai);
  const taiKhoan = coTheThanhToan ? await layTaiKhoanChuSan(pool, dong.maChuSan) : null;
  return {
    maDangKy: Number(dong.maDangKy), maThanhToan: Number(dong.maThanhToan), tieuDe: dong.tieuDe,
    soTien: Number(dong.soTien), trangThai: dong.trangThai, noiDungChuyenKhoan: dong.noiDungChuyenKhoan,
    hanThanhToan: dong.hanThanhToan, conLaiGiay: dong.conLaiGiay === null ? null : Number(dong.conLaiGiay),
    hanXacNhan: dong.hanXacNhan, lyDoLoi: dong.lyDoLoi, ngayGuiAnh: dong.ngayGuiAnh,
    conLaiXacNhanGiay: dong.conLaiXacNhanGiay === null ? null : Number(dong.conLaiXacNhanGiay),
    chamDuyet: quaHanDuyet, coTheKhieuNai: quaHanDuyet && !Number(dong.daBaoCao),
    hoanPhi100: daHuyQuaHan, daBatDau: !!Number(dong.daBatDau),
    ngayThanhToan: dong.ngayThanhToan, trangThaiHoan: dong.trangThaiHoan, ngayHoan: dong.ngayHoan,
    soTienHoan: dong.soTienHoan === null ? null : Number(dong.soTienHoan),
    anhQrUrl: taoAnhQrUrl(dong.noiDungChuyenKhoan, Number(dong.soTien), taiKhoan),
    maQr: taoNoiDungQr(dong.noiDungChuyenKhoan, Number(dong.soTien), taiKhoan),
    chuaCauHinhThanhToan: coTheThanhToan && !taiKhoan,
    taiKhoanNhan: taiKhoan ? {
      tenNganHang: taiKhoan.tenNganHang, maNganHang: taiKhoan.maNganHang,
      soTaiKhoan: taiKhoan.soTaiKhoan, chuTaiKhoan: taiKhoan.chuTaiKhoan,
    } : null,
    cacChungTu: cacChungTu.map((ct) => ({ ...ct, soTien: ct.soTien === null ? null : Number(ct.soTien) })),
    soAnhToiDa: chungTu.TOI_DA_CHUNG_TU_MOI_DON,
  };
}

// Khách bấm "Xác nhận & thanh toán": bắt đầu đếm ngược event_payment_hold_minutes (mặc định 10 phút).
// Chỉ bắt đầu MỘT lần (mở lại không đặt lại đồng hồ); từ chối chứng từ thì chủ sân gia hạn riêng.
async function batDauThanhToanSuKien(maKhachHang, maDangKy) {
  await thucHienGiaoDich(async (ketNoi) => {
    const [[tt]] = await ketNoi.query(
      `SELECT tt.MaThanhToan AS maThanhToan, tt.TrangThai AS trangThai, tt.NgayBatDauThanhToan AS ngayBatDau,
         (tt.HanThanhToan IS NULL OR tt.HanThanhToan > NOW()) AS conHan, dk.TrangThai AS trangThaiDangKy
       FROM DangKySuKien dk JOIN ThanhToanSuKien tt ON tt.MaDangKy = dk.MaDangKy
       WHERE dk.MaDangKy = ? AND dk.MaKhachHang = ? FOR UPDATE`, [maDangKy, maKhachHang]);
    if (!tt) throw AppError.khongTimThay('Không tìm thấy khoản thanh toán');
    if (tt.trangThaiDangKy !== 'accepted' || tt.trangThai !== 'pending') {
      throw AppError.biTrung('Khoản phí này không còn ở bước chờ thanh toán', 'INVALID_STATE');
    }
    if (!Number(tt.conHan)) throw AppError.biTrung('Đã hết hạn thanh toán phí sự kiện', 'PAYMENT_EXPIRED');
    if (tt.ngayBatDau) return;
    const phut = await layCauHinhSo(ketNoi, 'event_payment_hold_minutes', 10);
    await ketNoi.query(
      `UPDATE ThanhToanSuKien SET NgayBatDauThanhToan = NOW(), HanThanhToan = DATE_ADD(NOW(), INTERVAL ? MINUTE)
       WHERE MaThanhToan = ?`, [phut, tt.maThanhToan]);
  });
  return layHoaDonSuKien(maKhachHang, maDangKy);
}

// Khách gửi ảnh chuyển khoản phí sự kiện. Mỗi ảnh là chứng từ riêng, tối đa 5 ảnh/đăng ký.
async function guiChungTuSuKien(maKhachHang, maDangKy, tep, duLieu = {}) {
  if (!tep) throw AppError.duLieuKhongHopLe('Vui lòng tải ảnh chuyển khoản.', [
    { truong: 'anhChungTu', thongBao: 'Vui lòng tải ảnh chuyển khoản.' },
  ]);
  try {
    if (!await laAnhThat(tep.path)) {
      throw AppError.duLieuKhongHopLe('Chỉ nhận ảnh JPG, PNG, WEBP.', [
        { truong: 'anhChungTu', thongBao: 'Chỉ nhận ảnh JPG, PNG, WEBP.' },
      ]);
    }
    const thoiDiemChuyen = chungTu.docThoiDiemChuyen(duLieu.thoiDiemChuyen);
    const maBamAnh = await chungTu.bamTep(tep.path);
    const anh = layDuongDanTep(tep);
    const ketQua = await thucHienGiaoDich(async (ketNoi) => {
      const [[tt]] = await ketNoi.query(
        `SELECT tt.MaThanhToan AS maThanhToan, tt.SoTien AS soTien, tt.TrangThai AS trangThai,
           tt.HanThanhToan AS hanThanhToan, dk.TrangThai AS trangThaiDangKy,
           dk.TenKhach AS tenKhach, dk.MaSuKien AS maSuKien, sk.Phi AS phi, sk.TieuDe AS tieuDe, sk.MaChuSan AS maChuSan
         FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
           JOIN ThanhToanSuKien tt ON tt.MaDangKy = dk.MaDangKy
         WHERE dk.MaDangKy = ? AND dk.MaKhachHang = ? FOR UPDATE`, [maDangKy, maKhachHang]);
      if (!tt) throw AppError.khongTimThay('Không tìm thấy khoản thanh toán');
      if (tt.trangThaiDangKy !== 'accepted' || Number(tt.phi) <= 0) {
        throw AppError.biTrung('Đăng ký không ở trạng thái chờ thanh toán phí', 'INVALID_STATE');
      }
      if (!['pending', 'confirming'].includes(tt.trangThai)) {
        throw AppError.biTrung('Khoản thanh toán không còn nhận chứng từ', 'INVALID_STATE');
      }
      const [[han]] = await ketNoi.query(
        'SELECT (? IS NULL OR ? > NOW()) AS conHan', [tt.hanThanhToan, tt.hanThanhToan]);
      if (!Number(han.conHan)) throw AppError.biTrung('Đã hết hạn thanh toán phí sự kiện', 'PAYMENT_EXPIRED');
      await chungTu.kiemTraThoiDiemChuyen(ketNoi, thoiDiemChuyen);
      const [[demAnh]] = await ketNoi.query(
        'SELECT COUNT(*) AS soAnh FROM ChungTuSuKien WHERE MaThanhToan=?', [tt.maThanhToan]);
      const soAnh = Number(demAnh.soAnh);
      if (soAnh >= chungTu.TOI_DA_CHUNG_TU_MOI_DON) {
        throw AppError.biTrung(`Bạn đã gửi tối đa ${chungTu.TOI_DA_CHUNG_TU_MOI_DON} ảnh cho đăng ký này.`, 'PROOF_LIMIT');
      }
      const [ketQuaChungTu] = await ketNoi.query(
        `INSERT INTO ChungTuSuKien (MaThanhToan, SoTien, ThoiDiemChuyen, Anh, MaBamAnh)
         VALUES (?,?,?,?,?)`, [tt.maThanhToan, tt.soTien, thoiDiemChuyen, anh, maBamAnh]);
      const maChungTu = ketQuaChungTu.insertId;
      // Hạn chủ sân duyệt: cùng quy tắc với đặt sân (30', gấp 15', giờ mở cửa, không quá giờ bắt đầu sự kiện).
      const { han: hanXacNhan } = await chungTu.tinhHanXacNhanSuKien(ketNoi, tt.maSuKien);
      await ketNoi.query(
        `UPDATE ThanhToanSuKien SET TrangThai='confirming', NgayGuiAnh=NOW(), HanThanhToan=NULL,
           HanXacNhan=COALESCE(HanXacNhan, ?), LyDoLoi=NULL
         WHERE MaThanhToan=?`, [hanXacNhan, tt.maThanhToan]);
      const [[thoiHan]] = await ketNoi.query(
        'SELECT HanXacNhan AS hanXacNhan FROM ThanhToanSuKien WHERE MaThanhToan=?', [tt.maThanhToan]);
      if (tt.trangThai !== 'confirming') {
        await guiThongBao(ketNoi, {
          maNguoiDung: tt.maChuSan, loai: 'event_payment_submitted', tieuDe: 'Có chứng từ phí sự kiện cần duyệt',
          noiDung: `${tt.tenKhach} đã gửi ảnh chuyển khoản phí tham gia sự kiện "${tt.tieuDe}". Vui lòng kiểm tra và xác nhận.`,
          loaiThamChieu: 'registration', maThamChieu: Number(maDangKy),
          khoa: `event_payment_submitted:${tt.maThanhToan}:${Date.now()}`,
        });
      }
      return { maThanhToan: tt.maThanhToan, maChungTu, soAnhDaGui: soAnh + 1, hanXacNhan: thoiHan.hanXacNhan };
    });
    return { ...ketQua, trangThaiThanhToan: 'confirming', anhUrl: anh,
      thongBao: 'Đã gửi ảnh chuyển khoản. Vui lòng chờ chủ sân xác nhận.' };
  } catch (loi) {
    await fs.unlink(tep.path).catch(() => {});
    throw loi;
  }
}

// KH-01: lịch sử đăng ký của chính khách; không thể truyền MaKhachHang từ client.
async function lietKeDangKyCuaToi(maKhachHang, { trangThai, trang = 1, soLuong = 20 } = {}) {
  if (trangThai && !TRANG_THAI_DANG_KY.includes(trangThai)) {
    throw AppError.duLieuKhongHopLe('Trạng thái đăng ký không hợp lệ', { truong: 'trangThai' });
  }
  const phanTrang = chuanHoaTrang(trang, soLuong);
  const dieuKien = ['dk.MaKhachHang = ?'];
  const thamSo = [maKhachHang];
  if (trangThai) { dieuKien.push('dk.TrangThai = ?'); thamSo.push(trangThai); }
  const where = dieuKien.join(' AND ');
  const [cacDong] = await pool.query(
    `SELECT dk.MaDangKy AS maDangKy FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
     WHERE ${where} ORDER BY sk.NgaySuKien DESC, sk.GioBatDau DESC, dk.NgayDangKy DESC
     LIMIT ? OFFSET ?`, [...thamSo, phanTrang.soLuong, phanTrang.lech]);
  const [[dem]] = await pool.query(`SELECT COUNT(*) AS tong FROM DangKySuKien dk WHERE ${where}`, thamSo);
  const cacDangKy = [];
  for (const dong of cacDong) cacDangKy.push(await docDangKyCuaKhach(maKhachHang, dong.maDangKy));
  return { tong: Number(dem.tong), trang: phanTrang.trang, soLuong: phanTrang.soLuong, cacDangKy };
}

module.exports = {
  lietKeSuKien,
  docChiTiet,
  dangKySuKien,
  xemTruocHuyDangKy,
  rutDangKy,
  lietKeDangKyCuaToi,
  docDangKyCuaKhach,
  layHoaDonSuKien,
  batDauThanhToanSuKien,
  guiChungTuSuKien,
};
