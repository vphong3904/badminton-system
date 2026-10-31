const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { kiemTraKhungGia } = require('../utils/time');

const TRANG_THAI_DUOC_SUA = ['draft', 'rejected'];

async function layHoSo(maChuSan) {
  const [[hoSo]] = await pool.query(
    `SELECT MaNguoiDung AS maNguoiDung, TenDoanhNghiep AS tenDoanhNghiep,
       TenNganHang AS tenNganHang, MaNganHang AS maNganHang, SoTaiKhoan AS soTaiKhoan,
       ChuTaiKhoan AS chuTaiKhoan, TrangThaiDuyet AS trangThaiDuyet,
       NgayGuiDuyet AS ngayGuiDuyet, NgayDuyet AS ngayDuyet,
       MaQuanTriDuyet AS maQuanTriDuyet, LyDoTuChoi AS lyDoTuChoi
     FROM HoSoChuSan WHERE MaNguoiDung = ?`,
    [maChuSan]);
  return hoSo;
}

async function layCoSo(maChuSan) {
  const [[coSo]] = await pool.query(
    `SELECT cs.MaCoSo AS maCoSo, cs.MaChuSan AS maChuSan, cs.TenCoSo AS tenCoSo,
       cs.DiaChi AS diaChi, cs.SoDienThoai AS soDienThoai, cs.Zalo AS zalo,
       cs.LinkBanDo AS linkBanDo, cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen,
       cs.MoTa AS moTa, cs.GioMoCua AS gioMoCua, cs.GioDongCua AS gioDongCua,
       cs.SoPhutDatToiThieu AS soPhutDatToiThieu, cs.GiaThapNhat AS giaThapNhat,
       cs.TrangThai AS trangThai,
       (SELECT DuongDan FROM AnhCoSo WHERE MaCoSo = cs.MaCoSo
        ORDER BY LaAnhBia DESC, ThuTu, MaAnh LIMIT 1) AS duongDanAnh,
       (SELECT COUNT(*) FROM San WHERE MaCoSo = cs.MaCoSo) AS soSan
     FROM CoSo cs WHERE cs.MaChuSan = ? ORDER BY cs.MaCoSo LIMIT 1`,
    [maChuSan]);
  return coSo || null;
}

async function layBangGia(maCoSo) {
  const [khungGias] = await pool.query(
    `SELECT GioBatDau AS gioBatDau, GioKetThuc AS gioKetThuc,
       MAX(CASE WHEN LoaiNgay = 'weekday' AND LoaiKhach = 'walk_in' THEN GiaMoiGio END) AS giaNgayThuongKhachVangLai,
       MAX(CASE WHEN LoaiNgay = 'weekday' AND LoaiKhach = 'fixed' THEN GiaMoiGio END) AS giaNgayThuongKhachCoDinh,
       MAX(CASE WHEN LoaiNgay = 'weekend' AND LoaiKhach = 'walk_in' THEN GiaMoiGio END) AS giaCuoiTuanKhachVangLai,
       MAX(CASE WHEN LoaiNgay = 'weekend' AND LoaiKhach = 'fixed' THEN GiaMoiGio END) AS giaCuoiTuanKhachCoDinh
     FROM BangGia WHERE MaCoSo = ?
     GROUP BY GioBatDau, GioKetThuc ORDER BY GioBatDau`,
    [maCoSo]);
  return khungGias.map((khungGia) => ({
    ...khungGia,
    gioBatDau: String(khungGia.gioBatDau).slice(0, 5),
    gioKetThuc: String(khungGia.gioKetThuc).slice(0, 5),
  }));
}

async function batBuocCoSo(maChuSan) {
  const coSo = await layCoSo(maChuSan);
  if (!coSo) throw AppError.duLieuKhongHopLe('Bạn chưa khai báo thông tin sân (bước 1)');
  return coSo;
}

async function xacNhanDuocSua(maChuSan) {
  const hoSo = await layHoSo(maChuSan);
  if (!TRANG_THAI_DUOC_SUA.includes(hoSo.trangThaiDuyet)) {
    throw AppError.biTrung(hoSo.trangThaiDuyet === 'pending'
      ? 'Hồ sơ đang chờ duyệt, không thể chỉnh sửa' : 'Hồ sơ đã duyệt, hãy dùng chức năng chỉnh sửa sân');
  }
}

async function trangThaiDangKy(maChuSan) {
  const hoSo = await layHoSo(maChuSan);
  const coSo = await layCoSo(maChuSan);
  const khungGias = coSo ? await layBangGia(coSo.maCoSo) : [];
  return {
    trangThaiDuyet: hoSo.trangThaiDuyet,
    lyDoTuChoi: hoSo.lyDoTuChoi,
    ngayGuiDuyet: hoSo.ngayGuiDuyet,
    cacBuoc: { coSo: !!coSo, bangGia: khungGias.length > 0, nganHang: !!hoSo.soTaiKhoan },
    coSo,
    khungGias,
    thongTinNganHang: {
      tenNganHang: hoSo.tenNganHang,
      soTaiKhoan: hoSo.soTaiKhoan,
      chuTaiKhoan: hoSo.chuTaiKhoan,
    },
  };
}

async function luuBuocCoSo(maChuSan, duLieuCoSo) {
  await xacNhanDuocSua(maChuSan);
  const coSoHienTai = await layCoSo(maChuSan);
  const duLieuLuu = [
    duLieuCoSo.tenCoSo, duLieuCoSo.diaChi, duLieuCoSo.soDienThoai, duLieuCoSo.zalo ?? null,
    duLieuCoSo.linkBanDo, duLieuCoSo.tinhThanh, duLieuCoSo.quanHuyen,
    duLieuCoSo.moTa ?? null, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua,
    duLieuCoSo.soPhutDatToiThieu,
  ];

  if (coSoHienTai) {
    const khungGias = await layBangGia(coSoHienTai.maCoSo);
    kiemTraKhungGia(khungGias, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua);
    await pool.query(
      `UPDATE CoSo SET TenCoSo=?, DiaChi=?, SoDienThoai=?, Zalo=?, LinkBanDo=?,
       TinhThanh=?, QuanHuyen=?, MoTa=?, GioMoCua=?, GioDongCua=?, SoPhutDatToiThieu=?
       WHERE MaCoSo=?`,
      [...duLieuLuu, coSoHienTai.maCoSo]);
  } else {
    await pool.query(
      `INSERT INTO CoSo (MaChuSan, TenCoSo, DiaChi, SoDienThoai, Zalo, LinkBanDo,
       TinhThanh, QuanHuyen, MoTa, GioMoCua, GioDongCua, SoPhutDatToiThieu)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [maChuSan, ...duLieuLuu]);
  }
  return trangThaiDangKy(maChuSan);
}

async function thayBangGia(maChuSan, khungGias) {
  const coSo = await batBuocCoSo(maChuSan);
  kiemTraKhungGia(khungGias, coSo.gioMoCua.slice(0, 5), coSo.gioDongCua.slice(0, 5));

  const duLieuBangGia = khungGias.flatMap((khungGia) => [
    [coSo.maCoSo, 'weekday', 'walk_in', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaNgayThuongKhachVangLai],
    [coSo.maCoSo, 'weekday', 'fixed', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaNgayThuongKhachCoDinh],
    [coSo.maCoSo, 'weekend', 'walk_in', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaCuoiTuanKhachVangLai],
    [coSo.maCoSo, 'weekend', 'fixed', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaCuoiTuanKhachCoDinh],
  ]);
  const giaThapNhat = Math.min(...khungGias.flatMap((khungGia) => [
    khungGia.giaNgayThuongKhachVangLai,
    khungGia.giaCuoiTuanKhachVangLai,
  ]));

  await thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('DELETE FROM BangGia WHERE MaCoSo = ?', [coSo.maCoSo]);
    await ketNoi.query(
      `INSERT INTO BangGia (MaCoSo, LoaiNgay, LoaiKhach, GioBatDau, GioKetThuc, GiaMoiGio)
       VALUES ?`,
      [duLieuBangGia]);
    await ketNoi.query('UPDATE CoSo SET GiaThapNhat=? WHERE MaCoSo=?', [giaThapNhat, coSo.maCoSo]);
  });
  return layBangGia(coSo.maCoSo);
}

async function luuBuocBangGia(maChuSan, khungGias) {
  await xacNhanDuocSua(maChuSan);
  await thayBangGia(maChuSan, khungGias);
  return trangThaiDangKy(maChuSan);
}

async function luuBuocNganHang(maChuSan, thongTinNganHang) {
  await pool.query(
    `UPDATE HoSoChuSan SET TenNganHang=?, SoTaiKhoan=?, ChuTaiKhoan=? WHERE MaNguoiDung=?`,
    [thongTinNganHang.tenNganHang, thongTinNganHang.soTaiKhoan, thongTinNganHang.chuTaiKhoan, maChuSan]);
  return trangThaiDangKy(maChuSan);
}

async function guiHoSoDuyet(maChuSan) {
  await xacNhanDuocSua(maChuSan);
  const trangThai = await trangThaiDangKy(maChuSan);
  const mucConThieu = Object.entries({
    'thông tin sân': trangThai.cacBuoc.coSo,
    'bảng giá': trangThai.cacBuoc.bangGia,
    'tài khoản ngân hàng': trangThai.cacBuoc.nganHang,
  }).filter(([, hoanTat]) => !hoanTat).map(([tenMuc]) => tenMuc);
  if (mucConThieu.length) throw AppError.duLieuKhongHopLe(`Chưa hoàn thành: ${mucConThieu.join(', ')}`);
  await pool.query(
    `UPDATE HoSoChuSan SET TrangThaiDuyet='pending', NgayGuiDuyet=NOW(), LyDoTuChoi=NULL,
       MaQuanTriDuyet=NULL, NgayDuyet=NULL WHERE MaNguoiDung=?`,
    [maChuSan]);
  return trangThaiDangKy(maChuSan);
}

async function capNhatCoSo(maChuSan, duLieuCoSo) {
  const coSo = await batBuocCoSo(maChuSan);
  const khungGias = await layBangGia(coSo.maCoSo);
  kiemTraKhungGia(khungGias, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua);
  await pool.query(
    `UPDATE CoSo SET TenCoSo=?, DiaChi=?, SoDienThoai=?, Zalo=?, LinkBanDo=?,
       TinhThanh=?, QuanHuyen=?, MoTa=?, GioMoCua=?, GioDongCua=?, SoPhutDatToiThieu=?
     WHERE MaCoSo=?`,
    [
      duLieuCoSo.tenCoSo, duLieuCoSo.diaChi, duLieuCoSo.soDienThoai, duLieuCoSo.zalo ?? null,
      duLieuCoSo.linkBanDo, duLieuCoSo.tinhThanh, duLieuCoSo.quanHuyen,
      duLieuCoSo.moTa ?? null, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua,
      duLieuCoSo.soPhutDatToiThieu, coSo.maCoSo,
    ]);
  return layCoSo(maChuSan);
}

async function capNhatAnhCoSo(maChuSan, duongDan) {
  const coSo = await batBuocCoSo(maChuSan);
  await thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('UPDATE AnhCoSo SET LaAnhBia=0 WHERE MaCoSo=?', [coSo.maCoSo]);
    await ketNoi.query('INSERT INTO AnhCoSo (MaCoSo, DuongDan, LaAnhBia) VALUES (?,?,1)', [coSo.maCoSo, duongDan]);
  });
  return { duongDanAnh: duongDan };
}

async function lietKeSan(maChuSan) {
  const coSo = await batBuocCoSo(maChuSan);
  const [cacSan] = await pool.query(
    `SELECT MaSan AS maSan, MaCoSo AS maCoSo, TenSan AS tenSan, TrangThai AS trangThai
     FROM San WHERE MaCoSo=? ORDER BY MaSan`,
    [coSo.maCoSo]);
  return cacSan;
}

async function taoSan(maChuSan, duLieuSan) {
  const coSo = await batBuocCoSo(maChuSan);
  try {
    const [ketQua] = await pool.query(
      'INSERT INTO San (MaCoSo, TenSan, TrangThai) VALUES (?,?,?)',
      [coSo.maCoSo, duLieuSan.tenSan, duLieuSan.trangThai || 'active']);
    const [[sanMoi]] = await pool.query(
      `SELECT MaSan AS maSan, MaCoSo AS maCoSo, TenSan AS tenSan, TrangThai AS trangThai
       FROM San WHERE MaSan=?`,
      [ketQua.insertId]);
    return sanMoi;
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.biTrung('Tên sân đã tồn tại');
    throw loi;
  }
}

async function laySanCuaChu(maChuSan, maSan) {
  const [[san]] = await pool.query(
    `SELECT s.MaSan AS maSan, s.MaCoSo AS maCoSo, s.TenSan AS tenSan, s.TrangThai AS trangThai
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND cs.MaChuSan=?`,
    [maSan, maChuSan]);
  if (!san) throw AppError.khongTimThay('Không tìm thấy sân');
  return san;
}

async function capNhatSan(maChuSan, maSan, duLieuSan) {
  const san = await laySanCuaChu(maChuSan, maSan);
  try {
    await pool.query(
      'UPDATE San SET TenSan=?, TrangThai=? WHERE MaSan=?',
      [duLieuSan.tenSan ?? san.tenSan, duLieuSan.trangThai ?? san.trangThai, san.maSan]);
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.biTrung('Tên sân đã tồn tại');
    throw loi;
  }
  return laySanCuaChu(maChuSan, maSan);
}

async function taoKhoaSan(maChuSan, duLieuKhoa) {
  const san = await laySanCuaChu(maChuSan, duLieuKhoa.maSan);
  const thoiGianBatDau = duLieuKhoa.thoiGianBatDau.replace('T', ' ');
  const thoiGianKetThuc = duLieuKhoa.thoiGianKetThuc.replace('T', ' ');
  const ngayBatDau = thoiGianBatDau.slice(0, 10);
  const ngayKetThuc = thoiGianKetThuc.slice(0, 10);
  const gioBatDau = thoiGianBatDau.slice(11);
  const gioKetThuc = thoiGianKetThuc.slice(11);
  if (ngayBatDau !== ngayKetThuc) {
    throw AppError.duLieuKhongHopLe('Một lần khóa sân chỉ áp dụng trong cùng một ngày');
  }

  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('SELECT MaSan FROM San WHERE MaSan=? FOR UPDATE', [san.maSan]);
    const [[donDatSan]] = await ketNoi.query(
      `SELECT MaDatSan FROM DatSan
       WHERE MaSan=? AND NgayChoi=?
         AND (TrangThai='confirmed' OR (TrangThai='pending_payment' AND HetHanGiuCho>NOW()))
         AND GioBatDau < ? AND GioKetThuc > ? LIMIT 1 FOR UPDATE`,
      [san.maSan, ngayBatDau, gioKetThuc, gioBatDau]);
    if (donDatSan) throw AppError.biTrung('Khoảng giờ này đã có khách đặt, hãy hủy đơn trước khi khóa');
    const [mucKhoa] = await ketNoi.query(
      'INSERT INTO KhoaSan (MaSan, NgayKhoa, GioBatDau, GioKetThuc, LyDo) VALUES (?,?,?,?,?)',
      [san.maSan, ngayBatDau, gioBatDau, gioKetThuc, duLieuKhoa.lyDo ?? null]);
    return mucKhoa;
  });
  return {
    maKhoa: ketQua.insertId,
    maSan: duLieuKhoa.maSan,
    thoiGianBatDau: `${ngayBatDau} ${gioBatDau}`,
    thoiGianKetThuc: `${ngayBatDau} ${gioKetThuc}`,
    lyDo: duLieuKhoa.lyDo ?? null,
  };
}

async function lietKeKhoaSan(maChuSan, boLoc) {
  const coSo = await batBuocCoSo(maChuSan);
  const thamSo = [coSo.maCoSo];
  let truyVan = `SELECT k.MaKhoa AS maKhoa, k.MaSan AS maSan,
      CONCAT(DATE_FORMAT(k.NgayKhoa, '%Y-%m-%d'), ' ', TIME_FORMAT(k.GioBatDau, '%H:%i')) AS thoiGianBatDau,
      CONCAT(DATE_FORMAT(k.NgayKhoa, '%Y-%m-%d'), ' ', TIME_FORMAT(k.GioKetThuc, '%H:%i')) AS thoiGianKetThuc,
      k.LyDo AS lyDo
    FROM KhoaSan k JOIN San s ON s.MaSan=k.MaSan
    WHERE s.MaCoSo=?`;
  if (boLoc.maSan) {
    truyVan += ' AND k.MaSan=?';
    thamSo.push(boLoc.maSan);
  }
  if (boLoc.tuNgay) {
    truyVan += ' AND TIMESTAMP(k.NgayKhoa, k.GioKetThuc) >= ?';
    thamSo.push(boLoc.tuNgay);
  }
  if (boLoc.denNgay) {
    truyVan += ' AND TIMESTAMP(k.NgayKhoa, k.GioBatDau) <= ?';
    thamSo.push(boLoc.denNgay);
  }
  const [cacKhoaSan] = await pool.query(`${truyVan} ORDER BY k.NgayKhoa, k.GioBatDau`, thamSo);
  return cacKhoaSan;
}

async function xoaKhoaSan(maChuSan, maKhoa) {
  const [ketQua] = await pool.query(
    `DELETE k FROM KhoaSan k
     JOIN San s ON s.MaSan=k.MaSan
     JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE k.MaKhoa=? AND cs.MaChuSan=?`,
    [maKhoa, maChuSan]);
  if (!ketQua.affectedRows) throw AppError.khongTimThay('Không tìm thấy khóa giờ');
}

module.exports = {
  trangThaiDangKy,
  luuBuocCoSo,
  luuBuocBangGia,
  luuBuocNganHang,
  guiHoSoDuyet,
  capNhatCoSo,
  thayBangGia,
  capNhatAnhCoSo,
  layCoSo,
  lietKeSan,
  taoSan,
  capNhatSan,
  taoKhoaSan,
  lietKeKhoaSan,
  xoaKhoaSan,
};
