// G7.3–G7.5: chủ sân quản lý Sự kiện (Cộng đồng). Có: TẠO (G7.3), SỬA/ĐÓNG/MỞ LẠI/HỦY + danh sách/chi tiết (G7.4),
// XỬ LÝ ĐĂNG KÝ: danh sách, chấp nhận, từ chối, loại, duyệt ảnh chuyển khoản phí, đánh dấu đã hoàn phí (G7.5).
// G7.11: gửi thông báo qua notificationService trong cùng transaction nghiệp vụ.
// Quy tắc: docs/agent/features/events/rules.md. Sự kiện KHÔNG tạo DatSan: giữ lịch bằng KhoaSan(MaSuKien).
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { SAN_CHUA_XOA } = require('../utils/sanHienHanh');
const { SLOT_BAN } = require('../utils/slot');
const { laAnhThat, luuAnh, xoaAnhSuKien } = require('../middlewares/upload');
const { layMucConThieuHoSo } = require('../utils/hoSoChuSan');
const suKien = require('../utils/suKien');
const { layCauHinhSo } = require('./cauHinhService');
const nhatKy = require('./nhatKyService');
const { guiThongBao, baoNguoiDangKySuKien } = require('./notificationService');

const MUC_NGAN_HANG = ['tên ngân hàng', 'mã ngân hàng', 'số tài khoản', 'chủ tài khoản'];

const chuoiHoacNull = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

// Kiểm phần nghiệp vụ của body (kiểu dữ liệu/độ dài do validator G7.7 lo): loại ↔ sức chứa ↔ hạng mục.
function chuanHoaNoiDung(du) {
  const loai = du.loai;
  if (loai !== 'social' && loai !== 'tournament') {
    throw AppError.duLieuKhongHopLe('Loại sự kiện phải là social (Giao lưu) hoặc tournament (Giải đấu)', { truong: 'loai' });
  }
  const tieuDe = chuoiHoacNull(du.tieuDe);
  if (!tieuDe) throw AppError.duLieuKhongHopLe('Vui lòng nhập tên sự kiện', { truong: 'tieuDe' });

  const cacHangMuc = Array.isArray(du.hangMuc) ? du.hangMuc : [];
  let soLuongToiDa = null;
  if (loai === 'social') {
    if (cacHangMuc.length) throw AppError.duLieuKhongHopLe('Sự kiện Giao lưu không có hạng mục', { truong: 'hangMuc' });
    suKien.kiemTraSoLuongToiDa(du.soLuongToiDa);
    soLuongToiDa = du.soLuongToiDa;
  } else {
    if (!cacHangMuc.length) throw AppError.duLieuKhongHopLe('Giải đấu cần ít nhất 1 hạng mục', { truong: 'hangMuc' });
    const cacTen = new Set();
    for (const hm of cacHangMuc) {
      const ten = chuoiHoacNull(hm.tenHangMuc);
      if (!ten) throw AppError.duLieuKhongHopLe('Vui lòng nhập tên hạng mục', { truong: 'hangMuc' });
      if (cacTen.has(ten.toLowerCase())) throw AppError.duLieuKhongHopLe(`Hạng mục "${ten}" bị trùng`, { truong: 'hangMuc' });
      cacTen.add(ten.toLowerCase());
      suKien.kiemTraSoLuongToiDa(hm.soLuongToiDa, 'hangMuc.soLuongToiDa');
    }
  }

  const trinhDoTu = du.trinhDoTu ?? 1;
  const trinhDoDen = du.trinhDoDen ?? 8;
  suKien.kiemTraKhoangTrinhDo(trinhDoTu, trinhDoDen);

  const cheDoDuyet = du.cheDoDuyet ?? 'auto';
  if (cheDoDuyet !== 'auto' && cheDoDuyet !== 'manual') {
    throw AppError.duLieuKhongHopLe('Chế độ duyệt phải là auto hoặc manual', { truong: 'cheDoDuyet' });
  }

  const cacMaSan = [...new Set(du.cacMaSan ?? [])];
  if (!cacMaSan.length) throw AppError.duLieuKhongHopLe('Vui lòng chọn ít nhất 1 sân', { truong: 'cacMaSan' });

  return {
    loai, tieuDe, soLuongToiDa, trinhDoTu, trinhDoDen, cheDoDuyet, cacMaSan,
    moTa: chuoiHoacNull(du.moTa), dieuLe: chuoiHoacNull(du.dieuLe), ghiChuPhi: chuoiHoacNull(du.ghiChuPhi),
    cacHangMuc: cacHangMuc.map((hm) => ({
      tenHangMuc: hm.tenHangMuc.trim(), laDoi: hm.laDoi ? 1 : 0, soLuongToiDa: hm.soLuongToiDa,
    })),
  };
}


// Khóa dòng các sân (theo MaSan để tránh deadlock) và chắc chắn chúng thuộc cơ sở + đang active (SK-02).
async function khoaCacSan(ketNoi, maCoSo, cacMaSan) {
  const [cacSan] = await ketNoi.query(
    `SELECT MaSan AS maSan FROM San
     WHERE MaCoSo = ? AND TrangThai = 'active' AND ${SAN_CHUA_XOA()} AND MaSan IN (?) ORDER BY MaSan FOR UPDATE`,
    [maCoSo, cacMaSan]);
  if (cacSan.length !== cacMaSan.length) {
    throw AppError.duLieuKhongHopLe('Có sân không thuộc cơ sở này hoặc đang không hoạt động', { truong: 'cacMaSan' });
  }
  return cacSan.map((s) => s.maSan);
}

// SK-09/NT3: trùng đơn khách (SLOT_BAN) hoặc khóa sân khác → 409 kèm danh sách, KHÔNG tự hủy gì.
// boQuaMaSuKien: khi sửa, bỏ qua khóa của chính sự kiện này.
async function kiemTraTrungLich(ketNoi, { maCacSan, ngay, gioBatDau, gioKetThuc, boQuaMaSuKien = null }) {
  const [cacDonTrung] = await ketNoi.query(
    `SELECT d.MaDon AS maDon, d.MaSan AS maSan, s.TenSan AS tenSan,
       d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc
     FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
     WHERE d.MaSan IN (?) AND d.NgayChoi = ? AND ${SLOT_BAN('d')}
       AND d.GioBatDau < ? AND d.GioKetThuc > ?
     ORDER BY d.MaSan, d.GioBatDau FOR UPDATE`,
    [maCacSan, ngay, gioKetThuc, gioBatDau]);
  const [cacKhoaTrung] = await ketNoi.query(
    `SELECT k.MaKhoa AS maKhoa, k.MaSan AS maSan, s.TenSan AS tenSan, k.MaSuKien AS maSuKien,
       k.GioBatDau AS gioBatDau, k.GioKetThuc AS gioKetThuc, k.LyDo AS lyDo
     FROM KhoaSan k JOIN San s ON s.MaSan = k.MaSan
     WHERE k.MaSan IN (?) AND k.NgayKhoa = ? AND k.GioBatDau < ? AND k.GioKetThuc > ?
       AND (? IS NULL OR k.MaSuKien IS NULL OR k.MaSuKien <> ?)
     ORDER BY k.MaSan, k.GioBatDau`,
    [maCacSan, ngay, gioKetThuc, gioBatDau, boQuaMaSuKien, boQuaMaSuKien]);
  if (cacDonTrung.length || cacKhoaTrung.length) {
    throw new AppError(409,
      'Khung giờ này đã có khách đặt hoặc sân đã bị khóa. Hãy hủy đơn / gỡ khóa trước hoặc chọn sân, giờ khác',
      'CONFLICT', { cacDonTrung, cacKhoaTrung });
  }
}

// Sân × ngày = 1 dòng KhoaSan(MaSuKien).
async function ghiKhoaSan(ketNoi, { maSuKien, maCacSan, ngay, gioBatDau, gioKetThuc, tieuDe }) {
  const lyDoKhoa = `Sự kiện: ${tieuDe}`.slice(0, 255);
  for (const maSan of maCacSan) {
    await ketNoi.query(
      'INSERT INTO KhoaSan (MaSan, NgayKhoa, GioBatDau, GioKetThuc, LyDo, MaSuKien) VALUES (?,?,?,?,?,?)',
      [maSan, ngay, gioBatDau, gioKetThuc, lyDoKhoa, maSuKien]);
  }
}

// Đọc chi tiết 1 sự kiện (kèm sân + hạng mục + số đăng ký). ketNoi: pool hoặc connection trong giao dịch.
// soDaNhan = đăng ký accepted (chiếm chỗ); soChoDuyet = pending (chưa chiếm chỗ).
async function docChiTiet(ketNoi, maSuKien) {
  const [[sk]] = await ketNoi.query(
    `SELECT sk.MaSuKien AS maSuKien, sk.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, sk.Loai AS loai,
       sk.TieuDe AS tieuDe, sk.MoTa AS moTa, sk.DieuLe AS dieuLe, sk.AnhBia AS anhBia,
       sk.NgaySuKien AS ngay, sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc, sk.HanDangKy AS hanDangKy,
       sk.SoLuongToiDa AS soLuongToiDa, sk.TrinhDoTu AS trinhDoTu, sk.TrinhDoDen AS trinhDoDen,
       sk.CheDoDuyet AS cheDoDuyet, sk.Phi AS phi, sk.GhiChuPhi AS ghiChuPhi, sk.TrangThai AS trangThai,
       sk.NguoiHuy AS nguoiHuy, sk.LyDoHuy AS lyDoHuy, sk.BiAn AS biAn, sk.LyDoAn AS lyDoAn, sk.NgayTao AS ngayTao,
       (SELECT COUNT(*) FROM DangKySuKien WHERE MaSuKien = sk.MaSuKien AND TrangThai = 'accepted') AS soDaNhan,
       (SELECT COUNT(*) FROM DangKySuKien WHERE MaSuKien = sk.MaSuKien AND TrangThai = 'pending') AS soChoDuyet,
       (SELECT SUM(SoLuongToiDa) FROM HangMucSuKien WHERE MaSuKien = sk.MaSuKien) AS tongSucChuaHangMuc
     FROM SuKien sk JOIN CoSo cs ON cs.MaCoSo = sk.MaCoSo WHERE sk.MaSuKien = ?`,
    [maSuKien]);
  if (!sk) return null;
  const [cacSan] = await ketNoi.query(
    `SELECT s.MaSan AS maSan, s.TenSan AS tenSan FROM KhoaSan k JOIN San s ON s.MaSan = k.MaSan
     WHERE k.MaSuKien = ? ORDER BY s.TenSan`, [maSuKien]);
  const [cacHangMuc] = await ketNoi.query(
    `SELECT hm.MaHangMuc AS maHangMuc, hm.TenHangMuc AS tenHangMuc, hm.LaDoi AS laDoi, hm.SoLuongToiDa AS soLuongToiDa,
       COALESCE(SUM(dk.TrangThai = 'accepted'), 0) AS soDaNhan, COALESCE(SUM(dk.TrangThai = 'pending'), 0) AS soChoDuyet
     FROM HangMucSuKien hm LEFT JOIN DangKySuKien dk ON dk.MaHangMuc = hm.MaHangMuc
     WHERE hm.MaSuKien = ? GROUP BY hm.MaHangMuc ORDER BY hm.MaHangMuc`, [maSuKien]);
  const { tongSucChuaHangMuc, ...phanCon } = sk;
  const soToiDa = sk.loai === 'social' ? sk.soLuongToiDa : Number(tongSucChuaHangMuc ?? 0);
  const trangThaiHienThi = suKien.tinhTrangThaiHienThiSuKien({
    trangThai: sk.trangThai, hanDangKy: suKien.chuanHoaHanDangKy(sk.hanDangKy),
    soDaNhan: sk.soDaNhan, soToiDa: sk.loai === 'tournament' && !cacHangMuc.length ? null : soToiDa,
  }, new Date());
  return {
    ...phanCon,
    biAn: !!sk.biAn,
    cacSan,
    hangMuc: cacHangMuc.map((hm) => ({
      ...hm, laDoi: !!hm.laDoi, soDaNhan: Number(hm.soDaNhan), soChoDuyet: Number(hm.soChoDuyet),
    })),
    ghiChuTrinhDo: suKien.moTaKhoangTrinhDo(sk.trinhDoTu, sk.trinhDoDen),
    trangThaiHienThi: trangThaiHienThi.ma,
    nhanTrangThai: trangThaiHienThi.nhan,
  };
}

// Tạo sự kiện (SK-01…SK-10). Tất cả hoặc không: một giao dịch, khóa dòng CoSo + San, kiểm trùng, rồi mới ghi.
//  1) kiểm nội dung + cơ sở của chủ sân (active) + giờ/hạn/phí  2) khóa CoSo, khóa các San theo thứ tự MaSan
//  3) đủ hạn mức event_max_per_venue?  4) trùng đơn (SLOT_BAN) hoặc KhoaSan khác → 409 kèm danh sách, KHÔNG tự hủy đơn
//  5) ghi SuKien + HangMucSuKien + KhoaSan(MaSuKien) + nhật ký
async function taoSuKien(maChuSan, du) {
  const nd = chuanHoaNoiDung(du);

  const [[coSo]] = await pool.query(
    `SELECT MaCoSo AS maCoSo, TrangThai AS trangThai, GioMoCua AS gioMoCua, GioDongCua AS gioDongCua
     FROM CoSo WHERE MaCoSo = ? AND MaChuSan = ?`,
    [du.maCoSo, maChuSan]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở');
  if (coSo.trangThai !== 'active') throw AppError.biTrung('Cơ sở đang không hoạt động nên không tạo được sự kiện', 'INVALID_STATE');

  const [soPhutBatBuocTruoc, phiToiDa, soSuKienToiDa] = await Promise.all([
    layCauHinhSo(pool, 'event_min_register_lead_minutes', 60),
    layCauHinhSo(pool, 'event_max_fee', suKien.PHI_TOI_DA_MAC_DINH),
    layCauHinhSo(pool, 'event_max_per_venue', 10),
  ]);
  const bayGio = new Date();
  const { batDau, hanDangKy } = suKien.kiemTraThoiGianSuKien({
    ngay: du.ngay, gioBatDau: du.gioBatDau, gioKetThuc: du.gioKetThuc, hanDangKy: du.hanDangKy,
    gioMoCua: coSo.gioMoCua, gioDongCua: coSo.gioDongCua, bayGio, soPhutBatBuocTruoc,
  });
  const phi = du.phi ?? 0;
  suKien.kiemTraPhi(phi, phiToiDa);
  if (phi > 0) {
    // Phí thu qua hệ thống như đặt sân → chủ sân phải có tài khoản nhận tiền.
    const conThieu = (await layMucConThieuHoSo(pool, maChuSan)).filter((muc) => MUC_NGAN_HANG.includes(muc));
    if (conThieu.length) {
      throw AppError.duLieuKhongHopLe(`Sự kiện có phí cần tài khoản nhận tiền, còn thiếu: ${conThieu.join(', ')}`, { truong: 'phi' });
    }
  }

  const maSuKien = await thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('SELECT MaCoSo FROM CoSo WHERE MaCoSo = ? FOR UPDATE', [coSo.maCoSo]);
    const maCacSan = await khoaCacSan(ketNoi, coSo.maCoSo, nd.cacMaSan);

    const [[{ soHienCo }]] = await ketNoi.query(
      "SELECT COUNT(*) AS soHienCo FROM SuKien WHERE MaCoSo = ? AND TrangThai IN ('open','closed')", [coSo.maCoSo]);
    if (soHienCo >= soSuKienToiDa) {
      throw AppError.biTrung(`Mỗi cơ sở chỉ có tối đa ${soSuKienToiDa} sự kiện đang mở cùng lúc`, 'EVENT_LIMIT');
    }
    await kiemTraTrungLich(ketNoi, { maCacSan, ngay: du.ngay, gioBatDau: du.gioBatDau, gioKetThuc: du.gioKetThuc });

    const [ketQua] = await ketNoi.query(
      `INSERT INTO SuKien (MaCoSo, MaChuSan, Loai, TieuDe, MoTa, DieuLe, NgaySuKien, GioBatDau, GioKetThuc, HanDangKy,
         SoLuongToiDa, TrinhDoTu, TrinhDoDen, CheDoDuyet, Phi, GhiChuPhi)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [coSo.maCoSo, maChuSan, nd.loai, nd.tieuDe, nd.moTa, nd.dieuLe, du.ngay, du.gioBatDau, du.gioKetThuc,
        suKien.dinhDangGioVN(hanDangKy), nd.soLuongToiDa, nd.trinhDoTu, nd.trinhDoDen, nd.cheDoDuyet, phi, nd.ghiChuPhi]);
    const maMoi = ketQua.insertId;

    for (const hm of nd.cacHangMuc) {
      await ketNoi.query(
        'INSERT INTO HangMucSuKien (MaSuKien, TenHangMuc, LaDoi, SoLuongToiDa) VALUES (?,?,?,?)',
        [maMoi, hm.tenHangMuc, hm.laDoi, hm.soLuongToiDa]);
    }
    await ghiKhoaSan(ketNoi, { maSuKien: maMoi, maCacSan, ngay: du.ngay, gioBatDau: du.gioBatDau, gioKetThuc: du.gioKetThuc, tieuDe: nd.tieuDe });
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'tao_su_kien', doiTuong: 'SuKien', maDoiTuong: maMoi,
      chiTiet: `${nd.tieuDe} · ${du.ngay} ${du.gioBatDau}-${du.gioKetThuc} · ${maCacSan.length} sân`,
    });
    return maMoi;
  });

  return docChiTiet(pool, maSuKien);
}



// ---------------------------------------------------------------------------------------------
// G7.4: danh sách / chi tiết / sửa / đóng / mở lại / hủy
// ---------------------------------------------------------------------------------------------

async function khoaSuKienCuaChu(ketNoi, maChuSan, maSuKien) {
  const [[sk]] = await ketNoi.query(
    `SELECT sk.MaSuKien AS maSuKien, sk.MaCoSo AS maCoSo, sk.Loai AS loai, sk.TieuDe AS tieuDe,
       sk.NgaySuKien AS ngay, sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc, sk.HanDangKy AS hanDangKy,
       sk.SoLuongToiDa AS soLuongToiDa, sk.TrinhDoTu AS trinhDoTu, sk.TrinhDoDen AS trinhDoDen,
       sk.CheDoDuyet AS cheDoDuyet, sk.Phi AS phi, sk.TrangThai AS trangThai,
       cs.GioMoCua AS gioMoCua, cs.GioDongCua AS gioDongCua
     FROM SuKien sk JOIN CoSo cs ON cs.MaCoSo = sk.MaCoSo
     WHERE sk.MaSuKien = ? AND sk.MaChuSan = ? FOR UPDATE`,
    [maSuKien, maChuSan]);
  if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');
  return sk;
}

async function demDangKy(ketNoi, maSuKien) {
  const [cacDong] = await ketNoi.query(
    'SELECT TrangThai AS trangThai, COUNT(*) AS so FROM DangKySuKien WHERE MaSuKien = ? GROUP BY TrangThai', [maSuKien]);
  const dem = { pending: 0, accepted: 0 };
  for (const dong of cacDong) dem[dong.trangThai] = Number(dong.so);
  return dem;
}

const thoiGianBatDau = (sk) => suKien.thoiDiemVN(sk.ngay, sk.gioBatDau);

// GET /chu-san/su-kien?trangThai=&trang=&soLuong= — sự kiện của chủ sân, mới nhất trước.
async function lietKeSuKien(maChuSan, { trangThai, trang = 1, soLuong = 20 } = {}) {
  const gioiHan = Math.min(Math.max(Number(soLuong) || 20, 1), 50);
  const lech = (Math.max(Number(trang) || 1, 1) - 1) * gioiHan;
  const dieuKien = ['sk.MaChuSan = ?'];
  const thamSo = [maChuSan];
  if (trangThai) { dieuKien.push('sk.TrangThai = ?'); thamSo.push(trangThai); }
  const [cacDong] = await pool.query(
    `SELECT sk.MaSuKien AS maSuKien FROM SuKien sk WHERE ${dieuKien.join(' AND ')}
     ORDER BY sk.NgaySuKien DESC, sk.GioBatDau DESC, sk.MaSuKien DESC LIMIT ? OFFSET ?`,
    [...thamSo, gioiHan, lech]);
  const [[{ tong }]] = await pool.query(
    `SELECT COUNT(*) AS tong FROM SuKien sk WHERE ${dieuKien.join(' AND ')}`, thamSo);
  const cacSuKien = [];
  for (const dong of cacDong) cacSuKien.push(await docChiTiet(pool, dong.maSuKien));
  return { tong, trang: Number(trang) || 1, soLuong: gioiHan, cacSuKien };
}

async function layChiTietCuaChu(maChuSan, maSuKien) {
  const [[dong]] = await pool.query('SELECT MaSuKien FROM SuKien WHERE MaSuKien = ? AND MaChuSan = ?', [maSuKien, maChuSan]);
  if (!dong) throw AppError.khongTimThay('Không tìm thấy sự kiện');
  return docChiTiet(pool, maSuKien);
}

const chuoiLyDo = (lyDo, truong) => {
  const s = chuoiHoacNull(lyDo);
  if (!s) throw AppError.duLieuKhongHopLe('Vui lòng nhập lý do', { truong });
  if (s.length > 255) throw AppError.duLieuKhongHopLe('Lý do tối đa 255 ký tự', { truong });
  return s;
};

// Sửa theo rules §4. Trường không gửi = giữ nguyên. Không đổi loại, cơ sở.
//  - Tên/mô tả/điều lệ/ghi chú phí/trình độ/chế độ duyệt: tự do.
//  - soLuongToiDa: không nhỏ hơn số đã nhận (accepted). hanDangKy: có đăng ký rồi thì chỉ được gia hạn.
//  - phi: có đăng ký rồi thì không tăng, không đổi giữa miễn phí ↔ có phí (đăng ký cũ giữ số tiền đã chốt).
//  - ngay/gioBatDau/gioKetThuc/cacMaSan: kiểm trùng lại + khóa lại trong cùng giao dịch; có đăng ký thì bắt buộc lyDoThayDoi.
//  - Giải đấu: themHangMuc[], suaHangMuc[{maHangMuc, tenHangMuc?, soLuongToiDa?}], xoaHangMuc[] (xóa chỉ khi hạng mục chưa có đăng ký nào).
async function suaSuKien(maChuSan, maSuKien, du) {
  const bayGio = new Date();
  const [soPhutBatBuocTruoc, phiToiDa] = await Promise.all([
    layCauHinhSo(pool, 'event_min_register_lead_minutes', 60),
    layCauHinhSo(pool, 'event_max_fee', suKien.PHI_TOI_DA_MAC_DINH),
  ]);

  try {
    await thucHienGiaoDich(async (ketNoi) => {
      const sk = await khoaSuKienCuaChu(ketNoi, maChuSan, maSuKien);
      if (sk.trangThai !== 'open' && sk.trangThai !== 'closed') {
        throw AppError.biTrung('Sự kiện đã kết thúc hoặc đã hủy, không sửa được', 'INVALID_STATE');
      }
      const dem = await demDangKy(ketNoi, maSuKien);
      const coDangKy = dem.pending + dem.accepted > 0;
      let phiGiam = false;
      let lichDangKyThayDoi = false;
      const capNhat = {};   // cột → giá trị mới
      const truoc = {};     // để ghi nhật ký

      const dat = (cot, khoa, giaTriMoi) => { capNhat[cot] = giaTriMoi; truoc[khoa] = sk[khoa]; };

      for (const [khoa, cot] of [['moTa', 'MoTa'], ['dieuLe', 'DieuLe'], ['ghiChuPhi', 'GhiChuPhi']]) {
        if (du[khoa] !== undefined) dat(cot, khoa, chuoiHoacNull(du[khoa]));
      }
      let tieuDe = sk.tieuDe;
      if (du.tieuDe !== undefined) {
        tieuDe = chuoiHoacNull(du.tieuDe);
        if (!tieuDe) throw AppError.duLieuKhongHopLe('Vui lòng nhập tên sự kiện', { truong: 'tieuDe' });
        if (tieuDe !== sk.tieuDe) dat('TieuDe', 'tieuDe', tieuDe);
      }
      if (du.trinhDoTu !== undefined || du.trinhDoDen !== undefined) {
        const tu = du.trinhDoTu ?? sk.trinhDoTu;
        const den = du.trinhDoDen ?? sk.trinhDoDen;
        suKien.kiemTraKhoangTrinhDo(tu, den);
        if (tu !== sk.trinhDoTu) dat('TrinhDoTu', 'trinhDoTu', tu);
        if (den !== sk.trinhDoDen) dat('TrinhDoDen', 'trinhDoDen', den);
      }
      if (du.cheDoDuyet !== undefined) {
        if (du.cheDoDuyet !== 'auto' && du.cheDoDuyet !== 'manual') {
          throw AppError.duLieuKhongHopLe('Chế độ duyệt phải là auto hoặc manual', { truong: 'cheDoDuyet' });
        }
        dat('CheDoDuyet', 'cheDoDuyet', du.cheDoDuyet);
      }

      if (du.soLuongToiDa !== undefined) {
        if (sk.loai !== 'social') throw AppError.duLieuKhongHopLe('Giải đấu đặt số lượng theo từng hạng mục', { truong: 'soLuongToiDa' });
        suKien.kiemTraSoLuongToiDa(du.soLuongToiDa);
        if (du.soLuongToiDa < dem.accepted) {
          throw AppError.biTrung(`Đã nhận ${dem.accepted} người, số lượng tối đa không được nhỏ hơn`, 'CAPACITY_BELOW_ACCEPTED');
        }
        dat('SoLuongToiDa', 'soLuongToiDa', du.soLuongToiDa);
      }

      if (du.phi !== undefined && du.phi !== sk.phi) {
        suKien.kiemTraPhi(du.phi, phiToiDa);
        if (coDangKy && (du.phi > sk.phi || (sk.phi === 0) !== (du.phi === 0))) {
          throw AppError.biTrung('Đã có người đăng ký: không được tăng phí hoặc đổi giữa miễn phí và có phí', 'FEE_CHANGE_BLOCKED');
        }
        if (sk.phi === 0 && du.phi > 0) {
          const conThieu = (await layMucConThieuHoSo(ketNoi, maChuSan)).filter((muc) => MUC_NGAN_HANG.includes(muc));
          if (conThieu.length) {
            throw AppError.duLieuKhongHopLe(`Sự kiện có phí cần tài khoản nhận tiền, còn thiếu: ${conThieu.join(', ')}`, { truong: 'phi' });
          }
        }
        dat('Phi', 'phi', du.phi);
        if (coDangKy && du.phi < sk.phi) phiGiam = true;
      }

      // --- giờ / hạn / sân ---
      const ngay = du.ngay ?? sk.ngay;
      const gioBatDau = du.gioBatDau ?? sk.gioBatDau;
      const gioKetThuc = du.gioKetThuc ?? sk.gioKetThuc;
      const gioDoi = ngay !== sk.ngay
        || String(gioBatDau).slice(0, 5) !== String(sk.gioBatDau).slice(0, 5)
        || String(gioKetThuc).slice(0, 5) !== String(sk.gioKetThuc).slice(0, 5);
      const hanCu = suKien.chuanHoaHanDangKy(sk.hanDangKy);
      const hanMoi = du.hanDangKy !== undefined ? suKien.chuanHoaHanDangKy(du.hanDangKy) : hanCu;
      const hanDoi = hanMoi.getTime() !== hanCu.getTime();
      if (hanDoi && coDangKy && hanMoi.getTime() < hanCu.getTime()) {
        throw AppError.biTrung('Đã có người đăng ký: hạn đăng ký chỉ được gia hạn, không được rút ngắn', 'DEADLINE_SHORTEN_BLOCKED');
      }
      const [cacKhoaHienTai] = await ketNoi.query(
        'SELECT MaSan AS maSan FROM KhoaSan WHERE MaSuKien = ? ORDER BY MaSan', [maSuKien]);
      const sanCu = cacKhoaHienTai.map((k) => k.maSan);
      const sanMoi = du.cacMaSan !== undefined ? [...new Set(du.cacMaSan)].sort((x, y) => x - y) : sanCu;
      if (!sanMoi.length) throw AppError.duLieuKhongHopLe('Vui lòng chọn ít nhất 1 sân', { truong: 'cacMaSan' });
      const sanDoi = sanMoi.length !== sanCu.length || sanMoi.some((ma, i) => ma !== sanCu[i]);

      if (gioDoi || hanDoi || sanDoi) {
        const { hanDangKy: hanChuan } = suKien.kiemTraThoiGianSuKien({
          ngay, gioBatDau, gioKetThuc, hanDangKy: hanMoi, gioMoCua: sk.gioMoCua, gioDongCua: sk.gioDongCua,
          bayGio, soPhutBatBuocTruoc,
        });
        if (hanDoi) dat('HanDangKy', 'hanDangKy', suKien.dinhDangGioVN(hanChuan));
      }
      if (gioDoi || sanDoi) {
        if (coDangKy) {
          chuoiLyDo(du.lyDoThayDoi, 'lyDoThayDoi');
          lichDangKyThayDoi = true;
        }
        await ketNoi.query('SELECT MaCoSo FROM CoSo WHERE MaCoSo = ? FOR UPDATE', [sk.maCoSo]);
        const maCacSan = await khoaCacSan(ketNoi, sk.maCoSo, sanMoi);
        await kiemTraTrungLich(ketNoi, { maCacSan, ngay, gioBatDau, gioKetThuc, boQuaMaSuKien: maSuKien });
        await ketNoi.query('DELETE FROM KhoaSan WHERE MaSuKien = ?', [maSuKien]);
        await ghiKhoaSan(ketNoi, { maSuKien, maCacSan, ngay, gioBatDau, gioKetThuc, tieuDe });
        if (ngay !== sk.ngay) dat('NgaySuKien', 'ngay', ngay);
        if (String(gioBatDau).slice(0, 5) !== String(sk.gioBatDau).slice(0, 5)) dat('GioBatDau', 'gioBatDau', gioBatDau);
        if (String(gioKetThuc).slice(0, 5) !== String(sk.gioKetThuc).slice(0, 5)) dat('GioKetThuc', 'gioKetThuc', gioKetThuc);
      } else if (tieuDe !== sk.tieuDe) {
        await ketNoi.query('UPDATE KhoaSan SET LyDo = ? WHERE MaSuKien = ?', [`Sự kiện: ${tieuDe}`.slice(0, 255), maSuKien]);
      }

      // --- hạng mục (Giải đấu) ---
      const coSuaHangMuc = du.themHangMuc?.length || du.suaHangMuc?.length || du.xoaHangMuc?.length;
      if (coSuaHangMuc) {
        if (sk.loai !== 'tournament') throw AppError.duLieuKhongHopLe('Chỉ Giải đấu mới có hạng mục', { truong: 'hangMuc' });
        // [TiDB] Không dùng GROUP BY ... FOR UPDATE: khóa riêng các dòng hạng mục rồi mới đếm (không khóa).
        await ketNoi.query(
          'SELECT MaHangMuc FROM HangMucSuKien WHERE MaSuKien = ? ORDER BY MaHangMuc FOR UPDATE', [maSuKien]);
        const [cacHangMuc] = await ketNoi.query(
          `SELECT hm.MaHangMuc AS maHangMuc, hm.TenHangMuc AS tenHangMuc, hm.SoLuongToiDa AS soLuongToiDa,
             COUNT(dk.MaDangKy) AS tong, COALESCE(SUM(dk.TrangThai = 'accepted'), 0) AS daNhan
           FROM HangMucSuKien hm LEFT JOIN DangKySuKien dk ON dk.MaHangMuc = hm.MaHangMuc
           WHERE hm.MaSuKien = ? GROUP BY hm.MaHangMuc`, [maSuKien]);
        const theoMa = new Map(cacHangMuc.map((hm) => [hm.maHangMuc, hm]));
        const timHangMuc = (ma) => {
          const hm = theoMa.get(ma);
          if (!hm) throw AppError.duLieuKhongHopLe(`Không có hạng mục ${ma} trong sự kiện này`, { truong: 'hangMuc' });
          return hm;
        };
        for (const ma of du.xoaHangMuc ?? []) {
          const hm = timHangMuc(ma);
          if (Number(hm.tong) > 0) {
            throw AppError.biTrung(`Hạng mục "${hm.tenHangMuc}" đã có đăng ký nên không xóa được`, 'CONFLICT');
          }
          await ketNoi.query('DELETE FROM HangMucSuKien WHERE MaHangMuc = ?', [ma]);
          theoMa.delete(ma);
        }
        for (const s of du.suaHangMuc ?? []) {
          const hm = timHangMuc(s.maHangMuc);
          const cot = []; const giaTri = [];
          if (s.tenHangMuc !== undefined) {
            const ten = chuoiHoacNull(s.tenHangMuc);
            if (!ten) throw AppError.duLieuKhongHopLe('Vui lòng nhập tên hạng mục', { truong: 'hangMuc' });
            cot.push('TenHangMuc = ?'); giaTri.push(ten);
          }
          if (s.soLuongToiDa !== undefined) {
            suKien.kiemTraSoLuongToiDa(s.soLuongToiDa, 'hangMuc.soLuongToiDa');
            if (s.soLuongToiDa < Number(hm.daNhan)) {
              throw AppError.biTrung(`Hạng mục "${hm.tenHangMuc}" đã nhận ${hm.daNhan} người, không hạ sức chứa xuống thấp hơn`, 'CAPACITY_BELOW_ACCEPTED');
            }
            cot.push('SoLuongToiDa = ?'); giaTri.push(s.soLuongToiDa);
          }
          if (cot.length) await ketNoi.query(`UPDATE HangMucSuKien SET ${cot.join(', ')} WHERE MaHangMuc = ?`, [...giaTri, s.maHangMuc]);
        }
        for (const them of du.themHangMuc ?? []) {
          const ten = chuoiHoacNull(them.tenHangMuc);
          if (!ten) throw AppError.duLieuKhongHopLe('Vui lòng nhập tên hạng mục', { truong: 'hangMuc' });
          suKien.kiemTraSoLuongToiDa(them.soLuongToiDa, 'hangMuc.soLuongToiDa');
          const [kq] = await ketNoi.query(
            'INSERT INTO HangMucSuKien (MaSuKien, TenHangMuc, LaDoi, SoLuongToiDa) VALUES (?,?,?,?)',
            [maSuKien, ten, them.laDoi ? 1 : 0, them.soLuongToiDa]);
          theoMa.set(kq.insertId, { maHangMuc: kq.insertId });
        }
        if (!theoMa.size) throw AppError.duLieuKhongHopLe('Giải đấu cần ít nhất 1 hạng mục', { truong: 'hangMuc' });
      }

      const cacCot = Object.keys(capNhat);
      if (cacCot.length) {
        await ketNoi.query(
          `UPDATE SuKien SET ${cacCot.map((c) => `${c} = ?`).join(', ')} WHERE MaSuKien = ?`,
          [...Object.values(capNhat), maSuKien]);
      }
      if (cacCot.length || coSuaHangMuc || gioDoi || sanDoi) {
        await nhatKy.ghiNhatKy(ketNoi, {
          maNguoiThucHien: maChuSan, hanhDong: 'sua_su_kien', doiTuong: 'SuKien', maDoiTuong: maSuKien,
          chiTiet: du.lyDoThayDoi ? `Lý do: ${String(du.lyDoThayDoi).trim()}` : undefined,
          truoc, sau: { ...capNhat, ...(sanDoi ? { cacMaSan: sanMoi } : {}) },
        });
      }
      if (coDangKy && (phiGiam || lichDangKyThayDoi)) {
        const phanThayDoi = [];
        if (lichDangKyThayDoi) {
          phanThayDoi.push(`Thời gian mới: ${ngay}, ${String(gioBatDau).slice(0, 5)}-${String(gioKetThuc).slice(0, 5)}.`);
          if (du.lyDoThayDoi) phanThayDoi.push(`Lý do: ${String(du.lyDoThayDoi).trim()}.`);
        }
        if (phiGiam) phanThayDoi.push(`Phí tham gia đã giảm còn ${Number(du.phi).toLocaleString('vi-VN')}đ.`);
        await baoNguoiDangKySuKien(ketNoi, {
          maSuKien, loai: 'event_updated', tieuDe: 'Sự kiện có thay đổi',
          noiDung: `Sự kiện "${tieuDe}" đã được cập nhật. ${phanThayDoi.join(' ')}`.slice(0, 500),
          khoa: `event_updated:${maSuKien}:${Date.now()}`,
        });
      }
    });
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.duLieuKhongHopLe('Tên hạng mục bị trùng', { truong: 'hangMuc' });
    throw loi;
  }
  return docChiTiet(pool, maSuKien);
}

// Đóng nhận đăng ký (open → closed). Đăng ký đã có giữ nguyên.
async function dongSuKien(maChuSan, maSuKien) {
  await thucHienGiaoDich(async (ketNoi) => {
    const sk = await khoaSuKienCuaChu(ketNoi, maChuSan, maSuKien);
    suKien.kiemTraChuyenTrangThaiSuKien(sk.trangThai, 'closed');
    await ketNoi.query("UPDATE SuKien SET TrangThai = 'closed' WHERE MaSuKien = ?", [maSuKien]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'dong_su_kien', doiTuong: 'SuKien', maDoiTuong: maSuKien, chiTiet: sk.tieuDe,
    });
    await baoNguoiDangKySuKien(ketNoi, {
      maSuKien, loai: 'event_updated', tieuDe: 'Sự kiện đã đóng đăng ký',
      noiDung: `Sự kiện "${sk.tieuDe}" đã đóng nhận đăng ký. Đăng ký hiện tại của bạn vẫn được giữ nguyên.`,
      khoa: `event_updated:closed:${maSuKien}:${Date.now()}`,
    });
  });
  return docChiTiet(pool, maSuKien);
}

// Mở lại (closed → open): chỉ khi chưa quá hạn đăng ký và chưa bắt đầu (suKien.kiemTraChuyenTrangThaiSuKien).
async function moLaiSuKien(maChuSan, maSuKien) {
  await thucHienGiaoDich(async (ketNoi) => {
    const sk = await khoaSuKienCuaChu(ketNoi, maChuSan, maSuKien);
    suKien.kiemTraChuyenTrangThaiSuKien(sk.trangThai, 'open', {
      hanDangKy: suKien.chuanHoaHanDangKy(sk.hanDangKy), batDau: thoiGianBatDau(sk), bayGio: new Date(),
    });
    await ketNoi.query("UPDATE SuKien SET TrangThai = 'open' WHERE MaSuKien = ?", [maSuKien]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'mo_lai_su_kien', doiTuong: 'SuKien', maDoiTuong: maSuKien, chiTiet: sk.tieuDe,
    });
    await baoNguoiDangKySuKien(ketNoi, {
      maSuKien, loai: 'event_updated', tieuDe: 'Sự kiện đã mở lại đăng ký',
      noiDung: `Sự kiện "${sk.tieuDe}" đã mở lại nhận đăng ký. Đăng ký hiện tại của bạn vẫn được giữ nguyên.`,
      khoa: `event_updated:reopened:${maSuKien}:${Date.now()}`,
    });
  });
  return docChiTiet(pool, maSuKien);
}

// Hủy (bắt buộc lý do): xóa mọi KhoaSan của sự kiện (sân được trả lại); đăng ký pending/accepted → cancelled/system;
// thanh toán chưa trả → cancelled; ĐÃ trả (success) → TrangThaiHoan='pending' để chủ sân tự chuyển khoản hoàn (nền tảng không giữ tiền).
async function huySuKien(maChuSan, maSuKien, lyDo) {
  const lyDoHuy = chuoiLyDo(lyDo, 'lyDo');
  const ketQua = await thucHienGiaoDich(async (ketNoi) => {
    const sk = await khoaSuKienCuaChu(ketNoi, maChuSan, maSuKien);
    suKien.kiemTraChuyenTrangThaiSuKien(sk.trangThai, 'cancelled');
    await ketNoi.query(
      "UPDATE SuKien SET TrangThai = 'cancelled', NguoiHuy = 'owner', LyDoHuy = ?, NgayHuy = NOW() WHERE MaSuKien = ?",
      [lyDoHuy, maSuKien]);
    await ketNoi.query('DELETE FROM KhoaSan WHERE MaSuKien = ?', [maSuKien]);

    const [cacDangKy] = await ketNoi.query(
      `SELECT MaDangKy AS maDangKy, MaKhachHang AS maKhachHang FROM DangKySuKien
       WHERE MaSuKien = ? AND TrangThai IN ('pending','accepted') FOR UPDATE`, [maSuKien]);
    const [cacKhachCanBao] = await ketNoi.query(
      `SELECT dk.MaKhachHang AS maKhachHang,
         MAX(tt.TrangThai='success' AND tt.TrangThaiHoan<>'refunded') AS canHoanPhi
       FROM DangKySuKien dk LEFT JOIN ThanhToanSuKien tt ON tt.MaDangKy=dk.MaDangKy
       WHERE dk.MaSuKien=? AND dk.TrangThai IN ('pending','accepted')
       GROUP BY dk.MaKhachHang`, [maSuKien]);
    const [canHoan] = await ketNoi.query(
      `UPDATE ThanhToanSuKien tt JOIN DangKySuKien dk ON dk.MaDangKy = tt.MaDangKy
       SET tt.TrangThaiHoan = 'pending'
       WHERE dk.MaSuKien = ? AND tt.TrangThai = 'success' AND tt.TrangThaiHoan = 'none'`, [maSuKien]);
    await ketNoi.query(
      `UPDATE ThanhToanSuKien tt JOIN DangKySuKien dk ON dk.MaDangKy = tt.MaDangKy
       SET tt.TrangThai = 'cancelled'
       WHERE dk.MaSuKien = ? AND tt.TrangThai IN ('pending','confirming')`, [maSuKien]);
    await ketNoi.query(
      `UPDATE DangKySuKien SET TrangThai = 'cancelled', NguoiHuy = 'system', LyDo = ?, NgayHuy = NOW()
       WHERE MaSuKien = ? AND TrangThai IN ('pending','accepted')`, [lyDoHuy, maSuKien]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'huy_su_kien', doiTuong: 'SuKien', maDoiTuong: maSuKien,
      chiTiet: `${sk.tieuDe} · lý do: ${lyDoHuy}`,
    });
    for (const khach of cacKhachCanBao) {
      await guiThongBao(ketNoi, {
        maNguoiDung: khach.maKhachHang, loai: 'event_cancelled',
        tieuDe: 'Sự kiện đã bị hủy',
        noiDung: (`Sự kiện "${sk.tieuDe}" đã bị chủ sân hủy. Lý do: ${lyDoHuy}.`
          + (Number(khach.canHoanPhi) ? ' Phí đã thu cần chủ sân tự chuyển khoản hoàn; nền tảng không giữ tiền.' : '')).slice(0, 500),
        loaiThamChieu: 'event', maThamChieu: Number(maSuKien),
        khoa: `event_cancelled:owner:${maSuKien}:${khach.maKhachHang}`,
      });
    }
    return { soDangKyBiHuy: cacDangKy.length, soCanHoanPhi: canHoan.affectedRows };
  });
  return { ...(await docChiTiet(pool, maSuKien)), ...ketQua };
}

// ---------------------------------------------------------------------------------------------
// G7.5: xử lý đăng ký của chủ sân (DK-01…DK-06)
// ---------------------------------------------------------------------------------------------

const TRANG_THAI_DANG_KY = ['pending', 'accepted', 'cancelled', 'rejected'];

// Tạo hoặc mở lại dòng ThanhToanSuKien cho đăng ký có phí vừa thành accepted. Dùng chung G7.5/G7.6.
// Số tiền/hoa hồng lưu cứng lúc chấp nhận; hạn chuyển khoản = event_payment_hold_minutes tính từ giờ DB.
async function taoThanhToanChoDangKy(ketNoi, { maDangKy, phi }) {
  if (!(phi > 0)) return null;
  const [[cu]] = await ketNoi.query(
    `SELECT MaThanhToan AS maThanhToan, TrangThai AS trangThai, TrangThaiHoan AS trangThaiHoan
     FROM ThanhToanSuKien WHERE MaDangKy = ? FOR UPDATE`, [maDangKy]);
  // Khách hủy rồi đăng ký lại khi chủ sân CHƯA chuyển khoản hoàn: khôi phục khoản phí đã chuyển, khách không phải trả lần nữa
  // và chủ sân không còn phải hoàn. (Hủy lúc đang chờ duyệt chứng từ thì khoản phí được đưa về `confirming`.)
  if (cu && cu.trangThaiHoan === 'pending') {
    await ketNoi.query(
      `UPDATE ThanhToanSuKien SET TrangThai = IF(TrangThai = 'cancelled', 'confirming', TrangThai),
         TrangThaiHoan = 'none', SoTienHoan = NULL WHERE MaThanhToan = ?`, [cu.maThanhToan]);
    return cu.maThanhToan;
  }
  // Đã trả và không có hoàn (hủy sát giờ): đăng ký lại vẫn tính là đã trả.
  if (cu && cu.trangThai === 'success' && cu.trangThaiHoan === 'none') return cu.maThanhToan;
  const [soPhutGiu, tyLeHoaHong] = await Promise.all([
    layCauHinhSo(ketNoi, 'event_payment_accept_minutes', 10), // giữ chỗ 10' để vào màn Xác nhận & thanh toán
    layCauHinhSo(ketNoi, 'event_commission_rate', 0),
  ]);
  const phiNenTang = Math.round((phi * tyLeHoaHong) / 100);
  if (cu) {
    await ketNoi.query(
      `UPDATE ThanhToanSuKien SET SoTien = ?, PhiNenTang = ?, TienChuSan = ?, TrangThai = 'pending',
         NoiDungChuyenKhoan = ?, HanThanhToan = DATE_ADD(NOW(), INTERVAL ? MINUTE), HanXacNhan = NULL,
         LyDoLoi = NULL, NgayGuiAnh = NULL, NgayBatDauThanhToan = NULL, MaNguoiXacNhan = NULL, NgayThanhToan = NULL,
         TrangThaiHoan = 'none', NgayHoan = NULL WHERE MaThanhToan = ?`,
      [phi, phiNenTang, phi - phiNenTang, `SK${maDangKy}`, soPhutGiu, cu.maThanhToan]);
    return cu.maThanhToan;
  }
  const [kq] = await ketNoi.query(
    `INSERT INTO ThanhToanSuKien (MaDangKy, SoTien, PhiNenTang, TienChuSan, NoiDungChuyenKhoan, HanThanhToan)
     VALUES (?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [maDangKy, phi, phiNenTang, phi - phiNenTang, `SK${maDangKy}`, soPhutGiu]);
  return kq.insertId;
}

// Khóa sự kiện của chủ sân rồi khóa đăng ký (cùng thứ tự với huySuKien: SuKien → DangKy, tránh deadlock).
// DK-01: đăng ký không thuộc sự kiện của chủ sân → 404 (không lộ là có tồn tại).
async function khoaDangKyCuaChu(ketNoi, maChuSan, maDangKy) {
  const [[tro]] = await ketNoi.query(
    `SELECT dk.MaSuKien AS maSuKien FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
     WHERE dk.MaDangKy = ? AND sk.MaChuSan = ?`, [maDangKy, maChuSan]);
  if (!tro) throw AppError.khongTimThay('Không tìm thấy đăng ký');
  const sk = await khoaSuKienCuaChu(ketNoi, maChuSan, tro.maSuKien);
  const [[dk]] = await ketNoi.query(
    `SELECT MaDangKy AS maDangKy, MaSuKien AS maSuKien, MaHangMuc AS maHangMuc, MaKhachHang AS maKhachHang,
       TenKhach AS tenKhach, TrangThai AS trangThai
     FROM DangKySuKien WHERE MaDangKy = ? FOR UPDATE`, [maDangKy]);
  if (!dk) throw AppError.khongTimThay('Không tìm thấy đăng ký');
  return { sk, dk };
}

// DK-03: sự kiện đã kết thúc / đã hủy thì không xử lý đăng ký nữa.
function chanSuKienDaKetThuc(sk) {
  if (sk.trangThai === 'finished' || sk.trangThai === 'cancelled') {
    throw AppError.biTrung(
      sk.trangThai === 'finished' ? 'Sự kiện đã kết thúc, không xử lý đăng ký được nữa' : 'Sự kiện đã hủy, không xử lý đăng ký được nữa',
      'INVALID_STATE');
  }
}

async function docThanhToanDangKy(ketNoi, maDangKy) {
  const [[tt]] = await ketNoi.query(
    `SELECT MaThanhToan AS maThanhToan, SoTien AS soTien, PhiNenTang AS phiNenTang, TienChuSan AS tienChuSan,
       TrangThai AS trangThai, NoiDungChuyenKhoan AS noiDungChuyenKhoan, HanThanhToan AS hanThanhToan,
       HanXacNhan AS hanXacNhan, LyDoLoi AS lyDoLoi, NgayGuiAnh AS ngayGuiAnh, NgayThanhToan AS ngayThanhToan,
       TrangThaiHoan AS trangThaiHoan, NgayHoan AS ngayHoan,
       IF(TrangThaiHoan = 'none', NULL, COALESCE(SoTienHoan, SoTien)) AS soTienHoan,
       TenNganHangHoan AS tenNganHangHoan, MaNganHangHoan AS maNganHangHoan,
       SoTaiKhoanHoan AS soTaiKhoanHoan, ChuTaiKhoanHoan AS chuTaiKhoanHoan
     FROM ThanhToanSuKien WHERE MaDangKy = ?`, [maDangKy]);
  if (!tt) return null;
  const [cacChungTu] = await ketNoi.query(
    `SELECT MaChungTu AS maChungTu, SoTien AS soTien, ThoiDiemChuyen AS thoiDiemChuyen, NgayGui AS ngayGui,
       Anh AS anhUrl, KetQua AS ketQua, NgayDuyet AS ngayDuyet, LyDo AS lyDo
     FROM ChungTuSuKien WHERE MaThanhToan = ? ORDER BY NgayGui DESC, MaChungTu DESC`, [tt.maThanhToan]);
  return { ...tt, cacChungTu };
}

// GET /chu-san/su-kien/:id/dang-ky?trangThai=&maHangMuc=&trang=&soLuong=
// Trả từng đăng ký kèm thanh toán phí + cảnh báo trình độ ngoài khoảng (chỉ cảnh báo, KH-07), cùng số liệu tóm tắt.
async function lietKeDangKy(maChuSan, maSuKien, { trangThai, maHangMuc, trang = 1, soLuong = 20 } = {}) {
  const [[sk]] = await pool.query(
    'SELECT MaSuKien AS maSuKien, TrinhDoTu AS trinhDoTu, TrinhDoDen AS trinhDoDen, Phi AS phi FROM SuKien WHERE MaSuKien = ? AND MaChuSan = ?',
    [maSuKien, maChuSan]);
  if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');
  if (trangThai && !TRANG_THAI_DANG_KY.includes(trangThai)) {
    throw AppError.duLieuKhongHopLe('Trạng thái đăng ký không hợp lệ', { truong: 'trangThai' });
  }
  const gioiHan = Math.min(Math.max(Number(soLuong) || 20, 1), 50);
  const viTri = Math.max(Number(trang) || 1, 1);
  const dieuKien = ['dk.MaSuKien = ?'];
  const thamSo = [maSuKien];
  if (trangThai) { dieuKien.push('dk.TrangThai = ?'); thamSo.push(trangThai); }
  if (maHangMuc) { dieuKien.push('dk.MaHangMuc = ?'); thamSo.push(Number(maHangMuc)); }

  const [cacDong] = await pool.query(
    `SELECT dk.MaDangKy AS maDangKy, dk.MaHangMuc AS maHangMuc, hm.TenHangMuc AS tenHangMuc, hm.LaDoi AS laDoi,
       dk.MaKhachHang AS maKhachHang, dk.TenKhach AS tenKhach, dk.SoDienThoai AS soDienThoai,
       dk.GioiTinh AS gioiTinh, dk.TrinhDoKhai AS trinhDoKhai, dk.TenDongDoi AS tenDongDoi, dk.SdtDongDoi AS sdtDongDoi,
       dk.TrangThai AS trangThai, dk.NguoiHuy AS nguoiHuy, dk.LyDo AS lyDo,
       dk.NgayDangKy AS ngayDangKy, dk.NgayXuLy AS ngayXuLy, dk.NgayHuy AS ngayHuy
     FROM DangKySuKien dk LEFT JOIN HangMucSuKien hm ON hm.MaHangMuc = dk.MaHangMuc
     WHERE ${dieuKien.join(' AND ')}
     ORDER BY FIELD(dk.TrangThai,'pending','accepted','cancelled','rejected'), dk.NgayDangKy, dk.MaDangKy
     LIMIT ? OFFSET ?`,
    [...thamSo, gioiHan, (viTri - 1) * gioiHan]);
  const [[{ tong }]] = await pool.query(
    `SELECT COUNT(*) AS tong FROM DangKySuKien dk WHERE ${dieuKien.join(' AND ')}`, thamSo);
  const [cacTongHop] = await pool.query(
    'SELECT TrangThai AS trangThai, COUNT(*) AS so FROM DangKySuKien WHERE MaSuKien = ? GROUP BY TrangThai', [maSuKien]);
  const tomTat = { pending: 0, accepted: 0, cancelled: 0, rejected: 0 };
  for (const d of cacTongHop) tomTat[d.trangThai] = Number(d.so);

  const cacDangKy = [];
  for (const dong of cacDong) {
    cacDangKy.push({
      ...dong,
      laDoi: dong.laDoi === null ? null : !!dong.laDoi,
      canhBaoTrinhDo: suKien.trinhDoNgoaiKhoang(sk.trinhDoTu, sk.trinhDoDen, dong.trinhDoKhai),
      thanhToan: sk.phi > 0 ? await docThanhToanDangKy(pool, dong.maDangKy) : null,
    });
  }
  return { tong, trang: viTri, soLuong: gioiHan, tomTat, cacDangKy };
}

// Chấp nhận (DK-02): chỉ khi pending và còn chỗ — đếm trong giao dịch sau khi khóa SuKien (+ HangMucSuKien của giải đấu).
// Sự kiện có phí → tạo ThanhToanSuKien (khách có event_payment_hold_minutes để chuyển khoản + gửi ảnh).
async function chapNhanDangKy(maChuSan, maDangKy) {
  await thucHienGiaoDich(async (ketNoi) => {
    const { sk, dk } = await khoaDangKyCuaChu(ketNoi, maChuSan, maDangKy);
    chanSuKienDaKetThuc(sk);
    suKien.kiemTraChuyenTrangThaiDangKy(dk.trangThai, 'accepted');
    if (dk.trangThai !== 'pending') throw AppError.biTrung('Chỉ chấp nhận được đăng ký đang chờ duyệt', 'INVALID_STATE');

    let soToiDa = sk.soLuongToiDa;
    let soDaNhan;
    if (sk.loai === 'tournament') {
      const [[hm]] = await ketNoi.query(
        'SELECT SoLuongToiDa AS soLuongToiDa FROM HangMucSuKien WHERE MaHangMuc = ? FOR UPDATE', [dk.maHangMuc]);
      soToiDa = hm?.soLuongToiDa ?? null;
      [[{ soDaNhan }]] = await ketNoi.query(
        "SELECT COUNT(*) AS soDaNhan FROM DangKySuKien WHERE MaHangMuc = ? AND TrangThai = 'accepted'", [dk.maHangMuc]);
    } else {
      [[{ soDaNhan }]] = await ketNoi.query(
        "SELECT COUNT(*) AS soDaNhan FROM DangKySuKien WHERE MaSuKien = ? AND TrangThai = 'accepted'", [dk.maSuKien]);
    }
    if (!suKien.conCho(Number(soDaNhan), soToiDa)) {
      throw AppError.biTrung('Đã đủ chỗ, không thể chấp nhận thêm', 'EVENT_FULL');
    }

    await ketNoi.query("UPDATE DangKySuKien SET TrangThai = 'accepted', NgayXuLy = NOW() WHERE MaDangKy = ?", [maDangKy]);
    await taoThanhToanChoDangKy(ketNoi, { maDangKy, phi: Number(sk.phi) });
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'chap_nhan_dang_ky_su_kien', doiTuong: 'DangKySuKien', maDoiTuong: maDangKy,
      chiTiet: `${sk.tieuDe} · ${dk.tenKhach}`,
    });
    let noiDung = `Đăng ký của bạn cho sự kiện "${sk.tieuDe}" đã được chủ sân chấp nhận.`;
    if (Number(sk.phi) > 0) {
      const [[tt]] = await ketNoi.query(
        'SELECT HanThanhToan AS hanThanhToan FROM ThanhToanSuKien WHERE MaDangKy=?', [maDangKy]);
      noiDung += ` Phí tham gia ${Number(sk.phi).toLocaleString('vi-VN')}đ; vui lòng chuyển khoản và gửi ảnh trước ${tt?.hanThanhToan || 'hạn hiển thị trong ứng dụng'}.`;
    }
    await guiThongBao(ketNoi, {
      maNguoiDung: dk.maKhachHang, loai: 'event_accepted', tieuDe: 'Đăng ký sự kiện được chấp nhận',
      noiDung: noiDung.slice(0, 500), loaiThamChieu: 'registration', maThamChieu: Number(maDangKy),
      khoa: `event_accepted:${maDangKy}:${Date.now()}`,
    });
  });
  return layDangKyChoChu(maChuSan, maDangKy);
}

// Từ chối đăng ký đang chờ duyệt (pending → rejected). Lý do tùy chọn, ≤ 255 ký tự (DK-04).
async function tuChoiDangKy(maChuSan, maDangKy, lyDo) {
  const lyDoTuChoi = chuoiHoacNull(lyDo);
  if (lyDoTuChoi && lyDoTuChoi.length > 255) throw AppError.duLieuKhongHopLe('Lý do tối đa 255 ký tự', { truong: 'lyDo' });
  await thucHienGiaoDich(async (ketNoi) => {
    const { sk, dk } = await khoaDangKyCuaChu(ketNoi, maChuSan, maDangKy);
    chanSuKienDaKetThuc(sk);
    suKien.kiemTraChuyenTrangThaiDangKy(dk.trangThai, 'rejected');
    await ketNoi.query(
      "UPDATE DangKySuKien SET TrangThai = 'rejected', LyDo = ?, NgayXuLy = NOW() WHERE MaDangKy = ?", [lyDoTuChoi, maDangKy]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'tu_choi_dang_ky_su_kien', doiTuong: 'DangKySuKien', maDoiTuong: maDangKy,
      chiTiet: `${sk.tieuDe} · ${dk.tenKhach}${lyDoTuChoi ? ` · lý do: ${lyDoTuChoi}` : ''}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: dk.maKhachHang, loai: 'event_rejected', tieuDe: 'Đăng ký sự kiện chưa được chấp nhận',
      noiDung: (`Đăng ký của bạn cho sự kiện "${sk.tieuDe}" đã bị từ chối.`
        + (lyDoTuChoi ? ` Lý do: ${lyDoTuChoi}` : '')).slice(0, 500),
      loaiThamChieu: 'registration', maThamChieu: Number(maDangKy), khoa: `event_rejected:${maDangKy}`,
    });
  });
  return layDangKyChoChu(maChuSan, maDangKy);
}

// Loại người đã được nhận (accepted → cancelled/owner). BẮT BUỘC lý do (DK-04). Thanh toán chưa trả → cancelled;
// đã trả (success) → TrangThaiHoan='pending' để chủ sân tự chuyển khoản hoàn rồi bấm "đã hoàn" (danhDauDaHoanPhi).
async function loaiDangKy(maChuSan, maDangKy, lyDo) {
  const lyDoLoai = chuoiLyDo(lyDo, 'lyDo');
  const canHoanPhi = await thucHienGiaoDich(async (ketNoi) => {
    const { sk, dk } = await khoaDangKyCuaChu(ketNoi, maChuSan, maDangKy);
    chanSuKienDaKetThuc(sk);
    if (dk.trangThai !== 'accepted') throw AppError.biTrung('Chỉ loại được người đã được nhận', 'INVALID_STATE');
    suKien.kiemTraChuyenTrangThaiDangKy(dk.trangThai, 'cancelled');
    await ketNoi.query(
      "UPDATE DangKySuKien SET TrangThai = 'cancelled', NguoiHuy = 'owner', LyDo = ?, NgayHuy = NOW() WHERE MaDangKy = ?",
      [lyDoLoai, maDangKy]);
    const [daTra] = await ketNoi.query(
      "UPDATE ThanhToanSuKien SET TrangThaiHoan = 'pending' WHERE MaDangKy = ? AND TrangThai = 'success' AND TrangThaiHoan = 'none'",
      [maDangKy]);
    await ketNoi.query(
      "UPDATE ThanhToanSuKien SET TrangThai = 'cancelled' WHERE MaDangKy = ? AND TrangThai IN ('pending','confirming')", [maDangKy]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'loai_dang_ky_su_kien', doiTuong: 'DangKySuKien', maDoiTuong: maDangKy,
      chiTiet: `${sk.tieuDe} · ${dk.tenKhach} · lý do: ${lyDoLoai}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: dk.maKhachHang, loai: 'event_removed', tieuDe: 'Bạn đã bị rút khỏi sự kiện',
      noiDung: (`Chủ sân đã loại bạn khỏi sự kiện "${sk.tieuDe}". Lý do: ${lyDoLoai}.`
        + (daTra.affectedRows ? ' Phí đã thu cần chủ sân tự chuyển khoản hoàn; nền tảng không giữ tiền.' : '')).slice(0, 500),
      loaiThamChieu: 'registration', maThamChieu: Number(maDangKy), khoa: `event_removed:owner:${maDangKy}:${Date.now()}`,
    });
    return daTra.affectedRows > 0;
  });
  return { ...(await layDangKyChoChu(maChuSan, maDangKy)), canHoanPhi };
}

// Khóa đăng ký + thanh toán cho thao tác duyệt ảnh (DK-05): sự kiện có phí, đăng ký accepted, thanh toán `confirming`.
async function khoaThanhToanCanDuyet(ketNoi, maChuSan, maDangKy) {
  const { sk, dk } = await khoaDangKyCuaChu(ketNoi, maChuSan, maDangKy);
  chanSuKienDaKetThuc(sk);
  if (!(Number(sk.phi) > 0)) throw AppError.biTrung('Sự kiện này miễn phí, không có thanh toán', 'INVALID_STATE');
  if (dk.trangThai !== 'accepted') throw AppError.biTrung('Đăng ký chưa được nhận hoặc đã bị hủy', 'INVALID_STATE');
  const [[tt]] = await ketNoi.query(
    "SELECT MaThanhToan AS maThanhToan, TrangThai AS trangThai FROM ThanhToanSuKien WHERE MaDangKy = ? FOR UPDATE", [maDangKy]);
  if (!tt) throw AppError.khongTimThay('Chưa có thanh toán cho đăng ký này');
  if (tt.trangThai !== 'confirming') {
    throw AppError.biTrung('Chỉ duyệt được khi khách đã gửi ảnh chuyển khoản và đang chờ xác nhận', 'INVALID_STATE');
  }
  return { sk, dk, tt };
}

// Xác nhận đã nhận tiền: confirming → success; ảnh mới nhất đang chờ → accepted.
async function xacNhanThanhToan(maChuSan, maDangKy) {
  await thucHienGiaoDich(async (ketNoi) => {
    const { sk, dk, tt } = await khoaThanhToanCanDuyet(ketNoi, maChuSan, maDangKy);
    await ketNoi.query(
      "UPDATE ThanhToanSuKien SET TrangThai = 'success', NgayThanhToan = NOW(), MaNguoiXacNhan = ?, LyDoLoi = NULL WHERE MaThanhToan = ?",
      [maChuSan, tt.maThanhToan]);
    await ketNoi.query(
      "UPDATE ChungTuSuKien SET KetQua = 'accepted', MaNguoiDuyet = ?, NgayDuyet = NOW() WHERE MaThanhToan = ? AND KetQua = 'pending'",
      [maChuSan, tt.maThanhToan]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'xac_nhan_phi_su_kien', doiTuong: 'DangKySuKien', maDoiTuong: maDangKy,
      chiTiet: `${sk.tieuDe} · ${dk.tenKhach}`,
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: dk.maKhachHang, loai: 'event_payment_confirmed', tieuDe: 'Phí sự kiện đã được xác nhận',
      noiDung: `Chủ sân đã xác nhận nhận phí tham gia sự kiện "${sk.tieuDe}". Đăng ký của bạn đã hoàn tất.`,
      loaiThamChieu: 'registration', maThamChieu: Number(maDangKy), khoa: `event_payment_confirmed:${tt.maThanhToan}:${Date.now()}`,
    });
  });
  return layDangKyChoChu(maChuSan, maDangKy);
}

// Từ chối ảnh chuyển khoản (lý do bắt buộc): confirming → pending, khách được gia hạn event_payment_hold_minutes gửi lại (DK-05).
async function tuChoiThanhToan(maChuSan, maDangKy, lyDo) {
  const lyDoTuChoi = chuoiLyDo(lyDo, 'lyDo');
  const soPhutGiu = await layCauHinhSo(pool, 'event_payment_hold_minutes', 10);
  await thucHienGiaoDich(async (ketNoi) => {
    const { sk, dk, tt } = await khoaThanhToanCanDuyet(ketNoi, maChuSan, maDangKy);
    await ketNoi.query(
      `UPDATE ThanhToanSuKien SET TrangThai = 'pending', LyDoLoi = ?, HanXacNhan = NULL,
         HanThanhToan = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE MaThanhToan = ?`,
      [lyDoTuChoi, soPhutGiu, tt.maThanhToan]);
    await ketNoi.query(
      "UPDATE ChungTuSuKien SET KetQua = 'rejected', MaNguoiDuyet = ?, NgayDuyet = NOW(), LyDo = ? WHERE MaThanhToan = ? AND KetQua = 'pending'",
      [maChuSan, lyDoTuChoi, tt.maThanhToan]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'tu_choi_phi_su_kien', doiTuong: 'DangKySuKien', maDoiTuong: maDangKy,
      chiTiet: `${sk.tieuDe} · ${dk.tenKhach} · lý do: ${lyDoTuChoi}`,
    });
    const [[thoiHan]] = await ketNoi.query(
      'SELECT HanThanhToan AS hanThanhToan FROM ThanhToanSuKien WHERE MaThanhToan=?', [tt.maThanhToan]);
    await guiThongBao(ketNoi, {
      maNguoiDung: dk.maKhachHang, loai: 'event_payment_rejected', tieuDe: 'Chứng từ phí sự kiện chưa hợp lệ',
      noiDung: (`Chủ sân từ chối chứng từ phí sự kiện "${sk.tieuDe}". Lý do: ${lyDoTuChoi}.`
        + ` Bạn có thể gửi lại trước ${thoiHan?.hanThanhToan || 'hạn hiển thị trong ứng dụng'}.`).slice(0, 500),
      loaiThamChieu: 'registration', maThamChieu: Number(maDangKy), khoa: `event_payment_rejected:${tt.maThanhToan}:${Date.now()}`,
    });
  });
  return layDangKyChoChu(maChuSan, maDangKy);
}

// Chủ sân đã tự chuyển khoản hoàn phí → đánh dấu refunded. Cho phép cả khi sự kiện đã hủy/kết thúc (đây là việc hậu kỳ).
async function danhDauDaHoanPhi(maChuSan, maDangKy) {
  await thucHienGiaoDich(async (ketNoi) => {
    const { sk, dk } = await khoaDangKyCuaChu(ketNoi, maChuSan, maDangKy);
    const [kq] = await ketNoi.query(
      "UPDATE ThanhToanSuKien SET TrangThaiHoan = 'refunded', NgayHoan = NOW() WHERE MaDangKy = ? AND TrangThaiHoan = 'pending'",
      [maDangKy]);
    if (!kq.affectedRows) throw AppError.biTrung('Đăng ký này không có khoản phí nào đang chờ hoàn', 'INVALID_STATE');
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'hoan_phi_su_kien', doiTuong: 'DangKySuKien', maDoiTuong: maDangKy,
      chiTiet: `${sk.tieuDe} · ${dk.tenKhach}`,
    });
  });
  return layDangKyChoChu(maChuSan, maDangKy);
}

// Đọc lại 1 đăng ký (kèm thanh toán) để trả sau mỗi thao tác.
async function layDangKyChoChu(maChuSan, maDangKy) {
  const [[tro]] = await pool.query(
    `SELECT dk.MaSuKien AS maSuKien FROM DangKySuKien dk JOIN SuKien sk ON sk.MaSuKien = dk.MaSuKien
     WHERE dk.MaDangKy = ? AND sk.MaChuSan = ?`, [maDangKy, maChuSan]);
  if (!tro) throw AppError.khongTimThay('Không tìm thấy đăng ký');
  const [[dong]] = await pool.query(
    `SELECT dk.MaDangKy AS maDangKy, dk.MaSuKien AS maSuKien, dk.MaHangMuc AS maHangMuc, hm.TenHangMuc AS tenHangMuc,
       dk.MaKhachHang AS maKhachHang, dk.TenKhach AS tenKhach, dk.SoDienThoai AS soDienThoai,
       dk.GioiTinh AS gioiTinh, dk.TrinhDoKhai AS trinhDoKhai, dk.TenDongDoi AS tenDongDoi, dk.SdtDongDoi AS sdtDongDoi,
       dk.TrangThai AS trangThai, dk.NguoiHuy AS nguoiHuy, dk.LyDo AS lyDo,
       dk.NgayDangKy AS ngayDangKy, dk.NgayXuLy AS ngayXuLy, dk.NgayHuy AS ngayHuy
     FROM DangKySuKien dk LEFT JOIN HangMucSuKien hm ON hm.MaHangMuc = dk.MaHangMuc WHERE dk.MaDangKy = ?`, [maDangKy]);
  return { ...dong, thanhToan: await docThanhToanDangKy(pool, maDangKy) };
}


// G7.7: chủ sân cập nhật ảnh bìa sự kiện; file cũ chỉ xoá sau khi DB đã trỏ sang file mới.
async function capNhatAnhBia(maChuSan, maSuKien, tep) {
  if (!tep) throw AppError.duLieuKhongHopLe('Vui lòng chọn ảnh bìa sự kiện', [
    { truong: 'tepAnh', thongBao: 'Vui lòng chọn ảnh bìa sự kiện' },
  ]);
  let duongDanMoi = null;
  try {
    if (!await laAnhThat(tep.path)) {
      throw AppError.duLieuKhongHopLe('Chỉ nhận ảnh JPG, PNG, WEBP.', [
        { truong: 'tepAnh', thongBao: 'Chỉ nhận ảnh JPG, PNG, WEBP.' },
      ]);
    }
    const [[sk]] = await pool.query(
      'SELECT MaSuKien AS maSuKien, AnhBia AS anhBia FROM SuKien WHERE MaSuKien=? AND MaChuSan=?',
      [maSuKien, maChuSan]);
    if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');
    duongDanMoi = await luuAnh(tep, 'su-kien', `sk${maSuKien}`);
    await pool.query('UPDATE SuKien SET AnhBia=? WHERE MaSuKien=? AND MaChuSan=?',
      [duongDanMoi, maSuKien, maChuSan]);
    await xoaAnhSuKien(sk.anhBia);
    return { maSuKien: Number(maSuKien), anhBia: duongDanMoi };
  } catch (loi) {
    if (duongDanMoi) await xoaAnhSuKien(duongDanMoi);
    else await require('fs/promises').unlink(tep.path).catch(() => {});
    throw loi;
  }
}

module.exports = {
  taoSuKien, docChiTiet, lietKeSuKien, layChiTietCuaChu, suaSuKien, dongSuKien, moLaiSuKien, huySuKien,
  lietKeDangKy, chapNhanDangKy, tuChoiDangKy, loaiDangKy, xacNhanThanhToan, tuChoiThanhToan, danhDauDaHoanPhi,
  taoThanhToanChoDangKy, capNhatAnhBia,
};
