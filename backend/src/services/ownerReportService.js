const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');

async function capNhatDonDaHoanTat(maChuSan, ketNoi = pool) {
  await ketNoi.query(
    `UPDATE DatSan d JOIN San s ON s.MaSan=d.MaSan
       JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     SET d.TrangThai='completed'
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai IN ('confirmed','checked_in')
       AND TIMESTAMP(d.NgayChoi,d.GioKetThuc)<=NOW()`,
    [maChuSan]);
}

// Doanh thu theo năm/tháng/ngày. Bộ lọc (đều tuỳ chọn):
//  - tuNgay/denNgay: khoảng ngày tự chọn (ưu tiên hơn nam/thang)
//  - nam, nam+thang: xem 1 năm / 1 tháng
//  - maCoSo: chỉ 1 cơ sở của chủ sân
// Tính đơn đặt qua app + đơn chủ sân tạo (Nguon='owner') ĐÃ THU tiền ngoài hệ thống. Danh sách luôn mới nhất trước.
// Đơn owner: chỉ tính khi TrangThaiThu='paid' và TrangThai IN (confirmed, completed); phí nền tảng = 0,
// tienChuSan = tongTien; đơn chưa thu (công nợ) hoặc đã huỷ KHÔNG tính (huỷ đơn đã thu → doanh thu tự giảm).
// `doanhThuNgoaiHeThong`/`soLuotDatNgoaiHeThong` = phần của đơn owner, đã nằm trong doanhThu/soLuotDat (chỉ để đối chiếu).
// DOANH THU = tiền khách đã trả − tiền chủ sân ĐÃ HOÀN lại cho khách (TrangThaiHoanTien='refunded'):
//  - đơn confirmed/completed: tính đủ TongTien;
//  - đơn khách huỷ SAU KHI đã trả (ThanhToan success): vẫn tính tiền đã nhận, rồi trừ phần đã hoàn
//    (huỷ <12h không hoàn → chủ sân giữ 100%; huỷ 12–24h hoàn 50% → giữ 50%; hoàn 100% → về 0).
//  - khoản đang chờ hoàn (processing) CHƯA trừ (tiền chưa chuyển đi) mà báo riêng ở `tongCong.choHoan`.
// Phí nền tảng / tiền chủ sân của đơn huỷ được tính theo tỉ lệ phần tiền giữ lại.
// `soLuotDat` chỉ đếm đơn confirmed/completed (đơn đã huỷ không tính là lượt đặt).
async function layDoanhThu(maChuSan, boLoc = {}) {
  if (typeof boLoc !== 'object' || boLoc === null) boLoc = { nam: boLoc }; // tương thích kiểu gọi cũ
  await capNhatDonDaHoanTat(maChuSan);
  const thamSo = [maChuSan];
  let loc = '';
  if (boLoc.maCoSo) { loc += ' AND cs.MaCoSo=?'; thamSo.push(boLoc.maCoSo); }
  const coKhoangNgay = Boolean(boLoc.tuNgay || boLoc.denNgay);
  if (coKhoangNgay) {
    if (boLoc.tuNgay) { loc += ' AND d.NgayChoi>=?'; thamSo.push(boLoc.tuNgay); }
    if (boLoc.denNgay) { loc += ' AND d.NgayChoi<=?'; thamSo.push(boLoc.denNgay); }
  } else {
    if (boLoc.nam) { loc += ' AND YEAR(d.NgayChoi)=?'; thamSo.push(boLoc.nam); }
    if (boLoc.nam && boLoc.thang) { loc += ' AND MONTH(d.NgayChoi)=?'; thamSo.push(boLoc.thang); }
  }
  // Hai nhánh UNION ALL đều dùng cùng bộ tham số (maChuSan + bộ lọc).
  const thamSoX = [...thamSo, ...thamSo];
  // Mỗi dòng của bảng `x` = 1 đơn đã thu tiền, với: gross (đã trả), daHoan (đã chuyển hoàn), choHoan (đang chờ hoàn).
  // Nhánh 1: đơn app. Nhánh 2: đơn chủ sân tạo đã thu ngoài hệ thống (không hoa hồng, không hoàn qua hệ thống).
  const x = `(
    SELECT d.NgayChoi AS ngay, d.TongTien AS gross, d.PhiNenTang AS phi, d.TienChuSan AS chu,
      CASE WHEN d.TrangThai='cancelled' AND t.TrangThaiHoanTien IN ('refunded','received')
           THEN LEAST(d.TongTien, COALESCE(t.SoTienHoan,0)) ELSE 0 END AS daHoan,
      CASE WHEN d.TrangThai='cancelled' AND t.TrangThaiHoanTien='processing'
           THEN LEAST(d.TongTien, COALESCE(t.SoTienHoan,0)) ELSE 0 END AS choHoan,
      CASE WHEN d.TrangThai IN ('confirmed','checked_in','completed') THEN 1 ELSE 0 END AS luot,
      0 AS ngoai, 0 AS luotNgoai
    FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
      LEFT JOIN ThanhToan t ON t.MaDatSan=d.MaDatSan
    WHERE cs.MaChuSan=? AND d.Nguon='app'
      AND (d.TrangThai IN ('confirmed','checked_in','completed') OR (d.TrangThai='cancelled' AND t.TrangThai='success'))${loc}
    UNION ALL
    SELECT d.NgayChoi AS ngay, d.TongTien AS gross, 0 AS phi, d.TongTien AS chu,
      0 AS daHoan, 0 AS choHoan, 1 AS luot, d.TongTien AS ngoai, 1 AS luotNgoai
    FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
    WHERE cs.MaChuSan=? AND d.Nguon='owner' AND d.TrangThaiThu='paid'
      AND d.TrangThai IN ('confirmed','checked_in','completed')${loc}
  ) x`;
  // Tỉ lệ phần tiền được giữ lại (gross − daHoan)/gross; gross=0 → 0.
  const giu = '(CASE WHEN x.gross>0 THEN (x.gross - x.daHoan)/x.gross ELSE 0 END)';
  const cot = `SUM(x.gross - x.daHoan) AS doanhThu, SUM(x.gross) AS tongDaThu, SUM(x.daHoan) AS tienDaHoan,
       SUM(x.choHoan) AS choHoan, SUM(ROUND(x.phi*${giu})) AS phiNenTang,
       SUM(ROUND(x.chu*${giu})) AS tienChuSan, SUM(x.luot) AS soLuotDat,
       SUM(x.ngoai) AS doanhThuNgoaiHeThong, SUM(x.luotNgoai) AS soLuotDatNgoaiHeThong`;

  const [[tongCong]] = await pool.query(`SELECT ${cot} FROM ${x}`, thamSoX);
  const [theoNam] = await pool.query(
    `SELECT YEAR(x.ngay) AS nam, ${cot} FROM ${x} GROUP BY YEAR(x.ngay) ORDER BY nam DESC`, thamSoX);
  const [theoThang] = await pool.query(
    `SELECT YEAR(x.ngay) AS nam, MONTH(x.ngay) AS thang, ${cot} FROM ${x}
     GROUP BY YEAR(x.ngay), MONTH(x.ngay) ORDER BY nam DESC, thang DESC`, thamSoX);
  const [theoNgay] = await pool.query(
    `SELECT x.ngay AS ngay, ${cot} FROM ${x} GROUP BY x.ngay ORDER BY ngay DESC LIMIT 366`, thamSoX);
  const so = (v) => Number(v ?? 0);
  return {
    boLoc: {
      nam: coKhoangNgay ? null : boLoc.nam || null,
      thang: coKhoangNgay ? null : boLoc.thang || null,
      tuNgay: boLoc.tuNgay || null,
      denNgay: boLoc.denNgay || null,
      maCoSo: boLoc.maCoSo || null,
    },
    tongCong: {
      doanhThu: so(tongCong.doanhThu),
      tongDaThu: so(tongCong.tongDaThu),
      tienDaHoan: so(tongCong.tienDaHoan),
      choHoan: so(tongCong.choHoan),
      phiNenTang: so(tongCong.phiNenTang),
      tienChuSan: so(tongCong.tienChuSan),
      soLuotDat: so(tongCong.soLuotDat),
      doanhThuNgoaiHeThong: so(tongCong.doanhThuNgoaiHeThong),
      soLuotDatNgoaiHeThong: so(tongCong.soLuotDatNgoaiHeThong),
    },
    theoNam,
    theoThang,
    theoNgay,
  };
}

async function layTopKhach(maChuSan, boLoc) {
  const thamSo = [maChuSan];
  let locNgay = '';
  if (boLoc.tuNgay) {
    locNgay += ' AND d.NgayChoi>=?';
    thamSo.push(boLoc.tuNgay);
  }
  if (boLoc.denNgay) {
    locNgay += ' AND d.NgayChoi<=?';
    thamSo.push(boLoc.denNgay);
  }
  const [khachHang] = await pool.query(
    `SELECT d.MaKhachHang AS maKhachHang, d.TenKhach AS tenKhach,
       d.SoDienThoaiLienHe AS soDienThoai, COUNT(*) AS soLuotDat,
       SUM(d.TongTien) AS tongChiTieu
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai IN ('confirmed','checked_in','completed')${locNgay}
     GROUP BY d.MaKhachHang, d.TenKhach, d.SoDienThoaiLienHe
     ORDER BY soLuotDat DESC, tongChiTieu DESC LIMIT 20`,
    thamSo);
  return khachHang;
}

async function layTopSan(maChuSan, boLoc) {
  const thamSo = [maChuSan];
  let locNgay = '';
  if (boLoc.tuNgay) {
    locNgay += ' AND d.NgayChoi>=?';
    thamSo.push(boLoc.tuNgay);
  }
  if (boLoc.denNgay) {
    locNgay += ' AND d.NgayChoi<=?';
    thamSo.push(boLoc.denNgay);
  }
  const [cacSan] = await pool.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan, cs.TenCoSo AS tenCoSo,
       COUNT(*) AS soLuotDat, SUM(d.TongTien) AS tongDoanhThu
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='app' AND d.TrangThai IN ('confirmed','checked_in','completed')${locNgay}
     GROUP BY s.MaSan, s.TenSan, cs.TenCoSo
     ORDER BY tongDoanhThu DESC, soLuotDat DESC LIMIT 20`,
    thamSo);
  return cacSan;
}

// Công nợ = đơn chủ sân tạo, chưa thu tiền, còn hiệu lực. `maCoSo` (tuỳ chọn): chỉ 1 cơ sở của mình.
async function layCongNo(maChuSan, boLoc = {}) {
  const thamSo = [maChuSan];
  let loc = '';
  if (boLoc.maCoSo) { loc = ' AND cs.MaCoSo=?'; thamSo.push(boLoc.maCoSo); }
  const [cacDon] = await pool.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaLichCoDinh AS maLichCoDinh,
       d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoai, d.NgayChoi AS ngay,
       d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       d.TongTien AS tongTien, d.TrangThai AS trangThai,
       s.MaSan AS maSan, s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE cs.MaChuSan=? AND d.Nguon='owner' AND d.TrangThaiThu='unpaid'
       AND d.TrangThai NOT IN ('cancelled','expired')${loc}
     ORDER BY d.NgayChoi DESC, d.GioBatDau DESC`,
    thamSo);
  return {
    tongNo: cacDon.reduce((tong, don) => tong + Number(don.tongTien), 0),
    cacDon,
  };
}

module.exports = {
  layDoanhThu,
  layTopKhach,
  layTopSan,
  layCongNo,
};
