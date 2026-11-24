// G9.E: khoá khung giờ khi còn đơn + chuyển sân (kế hoạch 24/11/2026, §5).
// - Tìm đơn vướng khung giờ khoá, tìm sân thay thế (cùng cơ sở, đang hoạt động, trống đúng khung giờ).
// - Chuyển sân từng buổi (E4): chỉ đổi DatSan.MaSan, ghi MaSanCu/NgayChuyenSan; giá/TongTien/PhiNenTang giữ nguyên
//   → không hoàn, không thu thêm. Đơn `confirming` ĐƯỢC chuyển (thanh toán gắn với đơn, không gắn với sân).
// - Huỷ qua khoá sân (E5): CHỈ khi không còn sân trống để chuyển; lý do bắt buộc từng đơn; hoàn 100% (HoanTien.Loai='closure',
//   hạn 30'). `huyDonKhiKhoaSan` huỷ từng buổi, `hoanTatHuyKhiKhoaSan` gom hoàn tiền theo đợt thanh toán + thông báo + nhật ký.
// Giờ so sánh là NOW() của MySQL (+07:00). Ưu tiên khách: chuyển trước, không tự huỷ hàng loạt.
const AppError = require('../utils/AppError');
const { SAN_CHUA_XOA } = require('../utils/sanHienHanh');
const { SLOT_BAN } = require('../utils/slot');
const { catKhungTrong, phanLoaiDonVuong } = require('../utils/khoaSan');
const { guiThongBao, rutGonVanBan, dinhDangTien } = require('./notificationService');
const hoanTienService = require('./hoanTienService');
const nhatKy = require('./nhatKyService');

// Trùng với ownerBookingService (không import để tránh vòng phụ thuộc).
const SQL_KHOA_DOT = `CASE
    WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
    ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh = d.MaLichCoDinh)
  END`;
const NOI_THANH_TOAN = `
  LEFT JOIN ThanhToan t ON t.MaDatSan = CASE
    WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
    ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh = d.MaLichCoDinh)
  END`;

const dinhDangNgayVn = (ngay) => String(ngay).slice(0, 10).split('-').reverse().join('/');

// Các đơn đang giữ slot (SLOT_BAN) chồng khung giờ [gioBatDau, gioKetThuc) của mọi ngày trong [ngayDau, ngayCuoi].
async function layDonVuong(ketNoi, maSan, ngayDau, ngayCuoi, gioBatDau, gioKetThuc, { khoa = false } = {}) {
  const [cacDon] = await ketNoi.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.Nguon AS nguon, d.MaKhachHang AS maKhachHang,
       d.TenKhach AS tenKhach, d.MaSan AS maSan, DATE_FORMAT(d.NgayChoi, '%Y-%m-%d') AS ngay,
       TIME_FORMAT(d.GioBatDau, '%H:%i') AS gioBatDau, TIME_FORMAT(d.GioKetThuc, '%H:%i') AS gioKetThuc,
       d.TrangThai AS trangThai, d.TrangThaiThu AS trangThaiThu, d.TongTien AS tongTien,
       (${SQL_KHOA_DOT}) AS khoaDot, d.MaLichCoDinh AS maLichCoDinh,
       t.MaThanhToan AS maThanhToan, t.TrangThai AS trangThaiThanhToan,
       (TIMESTAMP(d.NgayChoi, d.GioBatDau) <= NOW()) AS daDenGio
     FROM DatSan d ${NOI_THANH_TOAN}
     WHERE d.MaSan = ? AND d.NgayChoi BETWEEN ? AND ? AND ${SLOT_BAN('d')}
       AND d.GioBatDau < ? AND d.GioKetThuc > ?
     ORDER BY d.NgayChoi, d.GioBatDau, d.MaDatSan ${khoa ? 'FOR UPDATE' : ''}`,
    [maSan, ngayDau, ngayCuoi, gioKetThuc, gioBatDau]);
  return cacDon.map((don) => ({ ...don, maDatSan: Number(don.maDatSan), daDenGio: Boolean(don.daDenGio) }));
}

// Sân thay thế cho một khung giờ: cùng cơ sở, đang hoạt động, không có đơn giữ slot và không bị khoá. Sắp theo mã sân.
// khoa=true (trong giao dịch): đọc có khoá hàng để thấy dữ liệu mới nhất; khoa=false (xem trước): 1 truy vấn.
async function timSanThayThe(ketNoi, { maCoSo, maSanHienTai, ngay, gioBatDau, gioKetThuc, khoa = false }) {
  if (!khoa) {
    const [cacSan] = await ketNoi.query(
      `SELECT s.MaSan AS maSan, s.TenSan AS tenSan FROM San s
       WHERE s.MaCoSo = ? AND s.TrangThai = 'active' AND ${SAN_CHUA_XOA('s')} AND s.MaSan <> ?
         AND NOT EXISTS (SELECT 1 FROM DatSan d WHERE d.MaSan = s.MaSan AND d.NgayChoi = ?
           AND ${SLOT_BAN('d')} AND d.GioBatDau < ? AND d.GioKetThuc > ?)
         AND NOT EXISTS (SELECT 1 FROM KhoaSan k WHERE k.MaSan = s.MaSan AND k.NgayKhoa = ?
           AND k.GioBatDau < ? AND k.GioKetThuc > ?)
       ORDER BY s.MaSan`,
      [maCoSo, maSanHienTai, ngay, gioKetThuc, gioBatDau, ngay, gioKetThuc, gioBatDau]);
    return cacSan.map((san) => ({ maSan: Number(san.maSan), tenSan: san.tenSan }));
  }
  const [cacUngVien] = await ketNoi.query(
    `SELECT MaSan AS maSan, TenSan AS tenSan FROM San WHERE MaCoSo = ? AND TrangThai = 'active' AND ${SAN_CHUA_XOA()} AND MaSan <> ? ORDER BY MaSan`,
    [maCoSo, maSanHienTai]);
  const ketQua = [];
  for (const san of cacUngVien) {
    const [[donTrung]] = await ketNoi.query(
      `SELECT d.MaDatSan FROM DatSan d WHERE d.MaSan = ? AND d.NgayChoi = ? AND ${SLOT_BAN('d')}
         AND d.GioBatDau < ? AND d.GioKetThuc > ? LIMIT 1 FOR UPDATE`,
      [san.maSan, ngay, gioKetThuc, gioBatDau]);
    if (donTrung) continue;
    const [[khoaTrung]] = await ketNoi.query(
      'SELECT MaKhoa FROM KhoaSan WHERE MaSan = ? AND NgayKhoa = ? AND GioBatDau < ? AND GioKetThuc > ? LIMIT 1 FOR UPDATE',
      [san.maSan, ngay, gioKetThuc, gioBatDau]);
    if (!khoaTrung) ketQua.push({ maSan: Number(san.maSan), tenSan: san.tenSan });
  }
  return ketQua;
}

// Các khung CẦN KHOÁ (khung giờ yêu cầu trừ đơn đang giữ slot và khóa sẵn có) + các đơn vướng, theo từng ngày.
async function tinhKhungKhoa(ketNoi, san, cacNgay, gioBatDau, gioKetThuc, { khoa = false } = {}) {
  const ngayDau = cacNgay[0];
  const ngayCuoi = cacNgay[cacNgay.length - 1];
  const cacDonVuong = await layDonVuong(ketNoi, san.maSan, ngayDau, ngayCuoi, gioBatDau, gioKetThuc, { khoa });
  const [cacKhoaCo] = await ketNoi.query(
    `SELECT DATE_FORMAT(NgayKhoa, '%Y-%m-%d') AS ngay, TIME_FORMAT(GioBatDau, '%H:%i') AS gioBatDau,
       TIME_FORMAT(GioKetThuc, '%H:%i') AS gioKetThuc
     FROM KhoaSan WHERE MaSan = ? AND NgayKhoa BETWEEN ? AND ? AND GioBatDau < ? AND GioKetThuc > ? ${khoa ? 'FOR UPDATE' : ''}`,
    [san.maSan, ngayDau, ngayCuoi, gioKetThuc, gioBatDau]);
  const banTheoNgay = new Map();
  for (const muc of [...cacDonVuong, ...cacKhoaCo]) {
    if (!banTheoNgay.has(muc.ngay)) banTheoNgay.set(muc.ngay, []);
    banTheoNgay.get(muc.ngay).push({ gioBatDau: muc.gioBatDau, gioKetThuc: muc.gioKetThuc });
  }
  const cacKhungTrong = [];
  for (const ngay of cacNgay) {
    for (const khung of catKhungTrong(gioBatDau, gioKetThuc, banTheoNgay.get(ngay) || [])) {
      cacKhungTrong.push({ ngay, ...khung });
    }
  }
  return { cacDonVuong, cacKhungTrong };
}

// Dạng trả về của một đơn vướng (kèm sân thay thế + khả năng chuyển/huỷ).
async function moTaDonVuong(ketNoi, san, don) {
  const cacSanThayThe = don.daDenGio ? [] : await timSanThayThe(ketNoi, {
    maCoSo: san.maCoSo, maSanHienTai: san.maSan, ngay: don.ngay, gioBatDau: don.gioBatDau, gioKetThuc: don.gioKetThuc,
  });
  const phanLoai = phanLoaiDonVuong(don, cacSanThayThe.length);
  return {
    maDatSan: don.maDatSan,
    maDon: don.maDon,
    ngay: don.ngay,
    gioBatDau: don.gioBatDau,
    gioKetThuc: don.gioKetThuc,
    tenKhach: don.tenKhach,
    nguon: don.nguon,
    trangThaiThanhToan: don.trangThaiThanhToan ?? null,
    coTheChuyen: phanLoai.coTheChuyen,
    coTheHuy: phanLoai.coTheHuy,
    lyDoKhongXuLy: phanLoai.lyDoKhongXuLy,
    cacSanThayThe,
  };
}

// E4: chuyển MỘT buổi sang sân khác cùng cơ sở, cùng giờ. Trả null nếu hết sân trống (khi không chỉ định sân).
// `uuTien`: mã sân ưu tiên (giữ cùng sân mới cho các buổi cùng đợt). Gọi trong giao dịch, sau khi đã khoá các sân của cơ sở.
async function chuyenMotBuoi(ketNoi, san, don, { maSanMoi = null, uuTien = null } = {}) {
  const cacSan = await timSanThayThe(ketNoi, {
    maCoSo: san.maCoSo, maSanHienTai: san.maSan, ngay: don.ngay, gioBatDau: don.gioBatDau, gioKetThuc: don.gioKetThuc, khoa: true,
  });
  let sanDich;
  if (maSanMoi) {
    sanDich = cacSan.find((s) => s.maSan === Number(maSanMoi));
    if (!sanDich) {
      throw new AppError(409,
        `Không chuyển đơn ${don.maDon} (${dinhDangNgayVn(don.ngay)} ${don.gioBatDau}) sang sân đã chọn: sân phải cùng cơ sở, đang hoạt động và trống đúng khung giờ.`,
        'TARGET_COURT_UNAVAILABLE', { maDatSan: don.maDatSan, maSanMoi: Number(maSanMoi) });
    }
  } else {
    sanDich = cacSan.find((s) => s.maSan === uuTien) ?? cacSan[0] ?? null;
  }
  if (!sanDich) return null;
  await ketNoi.query(
    'UPDATE DatSan SET MaSanCu = ?, NgayChuyenSan = NOW(), NgayKhachDongYChuyen = NULL, MaSan = ? WHERE MaDatSan = ?',
    [san.maSan, sanDich.maSan, don.maDatSan]);
  return { ...don, maSanCu: san.maSan, tenSanCu: san.tenSan, maSanMoi: sanDich.maSan, tenSanMoi: sanDich.tenSan };
}

// G9.E5 · bước 1: huỷ MỘT buổi vì khoá sân. Chỉ gọi khi không còn sân trống để chuyển (ownerService kiểm), lý do bắt buộc.
// Chỉ ghi trạng thái buổi (cancelled, NguoiHuy='owner'); hoàn tiền/thông báo gom theo đợt ở `hoanTatHuyKhiKhoaSan`.
async function huyDonKhiKhoaSan(ketNoi, { san, don, lyDo }) {
  const lyDoHuy = String(lyDo ?? '').trim();
  if (!lyDoHuy) {
    throw AppError.duLieuKhongHopLe(`Huỷ đơn ${don.maDon} phải có lý do.`, [
      { truong: 'lyDo', thongBao: `Huỷ đơn ${don.maDon} phải có lý do.` }]);
  }
  if (don.daDenGio || don.trangThai === 'checked_in') {
    throw new AppError(409, `Đơn ${don.maDon} đã đến giờ chơi hoặc khách đã check-in, không thể huỷ.`, 'BOOKING_STARTED', { cacMaDatSan: [don.maDatSan] });
  }
  if (don.trangThaiThanhToan === 'confirming') {
    throw new AppError(409, 'Khách đã gửi ảnh chuyển khoản. Hãy xác nhận hoặc từ chối thanh toán trước khi huỷ đơn.', 'PAYMENT_CONFIRMING', { maDatSan: don.maDatSan });
  }
  const [ketQua] = await ketNoi.query(
    `UPDATE DatSan SET TrangThai='cancelled', NguoiHuy='owner', LyDoHuy=?, NgayHuy=NOW()
     WHERE MaDatSan=? AND TrangThai IN ('pending_payment','confirmed')`,
    [lyDoHuy.slice(0, 255), don.maDatSan]);
  if (!ketQua.affectedRows) {
    throw new AppError(409, `Đơn ${don.maDon} không còn ở trạng thái huỷ được.`, 'BOOKING_NOT_CANCELLABLE', { maDatSan: don.maDatSan });
  }
  return { ...don, lyDoHuy: lyDoHuy.slice(0, 255), maSan: san.maSan, tenSan: san.tenSan };
}

// G9.E5 · bước 2 (sau khi đã huỷ các buổi): theo từng ĐỢT thanh toán (khoaDot):
//  - đã trả (success): MỘT khoản hoàn 100% = tổng TongTien các buổi bị huỷ, Loai='closure', hạn 30' (taoYeuCauHoan đọc cấu hình);
//    còn khoản hoàn khác chưa xong trên cùng thanh toán → 409 REFUND_PENDING (giống huỷ một phần G9.D1);
//  - chưa trả (pending): còn buổi hiệu lực → 409 PARTIAL_CANCEL_UNPAID (khách vẫn phải chuyển đủ tiền cả đợt); huỷ hết → thanh toán expired;
//  - lịch cố định không còn buổi sắp chơi → LichCoDinh cancelled;
//  - đơn chủ sân tự tạo đã thu tiền ngoài hệ thống: không tạo hoàn, trả cờ để chủ sân tự hoàn.
// Mọi lỗi ném ra → cả giao dịch khoá sân rollback (không để lửng). Trả danh sách buổi đã huỷ kèm thông tin hoàn.
async function hoanTatHuyKhiKhoaSan(ketNoi, { maChuSan, san, tenCoSo, cacBuoiDaHuy, lyDoKhoa = null }) {
  if (!cacBuoiDaHuy.length) return { cacDonDaHuy: [], tongTienHoan: 0 };
  const theoDot = new Map();
  for (const buoi of cacBuoiDaHuy) {
    if (!theoDot.has(buoi.khoaDot)) theoDot.set(buoi.khoaDot, []);
    theoDot.get(buoi.khoaDot).push(buoi);
  }
  const cacDonDaHuy = [];
  let tongTienHoan = 0;
  for (const [khoaDot, cacBuoi] of theoDot) {
    const dau = cacBuoi[0];
    const cacMa = cacBuoi.map((b) => b.maDatSan);
    const tongTienCacBuoi = cacBuoi.reduce((tong, b) => tong + Number(b.tongTien), 0);
    const [[conLaiDot]] = await ketNoi.query(
      `SELECT COUNT(*) AS so FROM DatSan d WHERE (${SQL_KHOA_DOT}) = ? AND d.TrangThai IN ('pending_payment','confirmed')`,
      [khoaDot]);
    const conBuoiHieuLuc = Number(conLaiDot.so) > 0;
    let hoanTien = null;
    if (dau.maThanhToan) {
      if (dau.trangThaiThanhToan === 'success') {
        const [[dangHoan]] = await ketNoi.query(
          `SELECT COUNT(*) AS so FROM HoanTien WHERE MaThanhToan = ? AND TrangThai IN ('waiting_info','processing','not_received','escalated')`,
          [dau.maThanhToan]);
        if (Number(dangHoan.so) > 0) {
          throw new AppError(409,
            `Đơn ${dau.maDon} còn một khoản hoàn tiền chưa xử lý xong. Hãy hoàn tiền (tải ảnh chứng từ) trước khi khoá sân.`,
            'REFUND_PENDING', { maDatSan: dau.maDatSan });
        }
        hoanTien = await hoanTienService.taoYeuCauHoan(ketNoi, {
          maThanhToan: dau.maThanhToan, maDatSan: cacMa[0], loai: 'closure', soTien: tongTienCacBuoi, tyLe: 100,
          lyDo: rutGonVanBan(`Chủ sân khoá sân${lyDoKhoa ? `: ${lyDoKhoa}` : ''}`, 255),
        });
      } else if (dau.trangThaiThanhToan === 'pending') {
        if (conBuoiHieuLuc) {
          throw new AppError(409,
            `Khách đơn ${dau.maDon} chưa thanh toán nên chỉ huỷ được toàn bộ các buổi còn hiệu lực của đợt, không huỷ một phần.`,
            'PARTIAL_CANCEL_UNPAID', { maDatSan: dau.maDatSan });
        }
        await ketNoi.query("UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan = ? AND TrangThai='pending'", [dau.maThanhToan]);
      }
    }
    // Lịch cố định: không còn buổi nào sắp chơi → đóng lịch (buổi đã chơi/đang chờ chốt không giữ lịch mở).
    if (dau.maLichCoDinh) {
      const [[conSapChoi]] = await ketNoi.query(
        `SELECT COUNT(*) AS so FROM DatSan WHERE MaLichCoDinh = ? AND TrangThai IN ('pending_payment','confirmed')
           AND TIMESTAMP(NgayChoi, GioBatDau) > NOW()`, [dau.maLichCoDinh]);
      if (!Number(conSapChoi.so)) await ketNoi.query("UPDATE LichCoDinh SET TrangThai='cancelled' WHERE MaLichCoDinh = ?", [dau.maLichCoDinh]);
    }
    const soTienHoan = hoanTien ? Number(hoanTien.soTien) : 0;
    tongTienHoan += soTienHoan;
    const daThuNgoaiHeThong = dau.nguon === 'owner' && dau.trangThaiThu === 'paid';
    for (const buoi of cacBuoi) {
      cacDonDaHuy.push({
        maDatSan: buoi.maDatSan, maDon: buoi.maDon, ngay: buoi.ngay, gioBatDau: buoi.gioBatDau, gioKetThuc: buoi.gioKetThuc,
        lyDo: buoi.lyDoHuy,
        daThanhToan: buoi.trangThaiThanhToan === 'success',
        soTienHoan: hoanTien ? Number(buoi.tongTien) : 0,
        maHoanTien: hoanTien ? Number(hoanTien.maHoanTien) : null,
        canHoanTien: soTienHoan > 0,
        daThuNgoaiHeThong,
        soTienCanHoanNgoaiHeThong: daThuNgoaiHeThong ? Number(buoi.tongTien) : 0,
      });
    }
    // Thông báo khách: 1 thông báo / (khách, đợt thanh toán), nêu lý do; hoàn 100% nếu đã trả.
    if (dau.maKhachHang) {
      const mota = cacBuoi.slice(0, 5)
        .map((b) => `${dinhDangNgayVn(b.ngay).slice(0, 5)} ${b.gioBatDau}–${b.gioKetThuc} (${san.tenSan})`)
        .join(', ') + (cacBuoi.length > 5 ? ` và ${cacBuoi.length - 5} buổi khác` : '');
      const cauHoan = soTienHoan > 0
        ? ` Bạn được hoàn 100% (${dinhDangTien(soTienHoan)}); chủ sân sẽ chuyển khoản hoàn cho bạn.`
        : '';
      await guiThongBao(ketNoi, {
        maNguoiDung: dau.maKhachHang,
        loai: 'booking_cancelled',
        tieuDe: 'Chủ sân đã huỷ đơn đặt sân do đóng sân',
        noiDung: `Chủ sân đã huỷ ${cacBuoi.length} buổi của đơn ${dau.maDon} - ${tenCoSo}: ${rutGonVanBan(mota, 200)} `
          + `vì không còn sân trống để chuyển. Lý do: ${rutGonVanBan(dau.lyDoHuy, 120)}.${cauHoan}`,
        loaiThamChieu: 'booking',
        maThamChieu: Number(cacMa[0]),
        khoa: `booking_cancelled_by_owner:${cacMa[0]}`,
      });
    }
    for (const buoi of cacBuoi) {
      await nhatKy.ghiNhatKy(ketNoi, {
        maNguoiThucHien: maChuSan, hanhDong: 'huy_don_khoa_san', doiTuong: 'DatSan', maDoiTuong: buoi.maDatSan,
        chiTiet: `Huỷ đơn ${buoi.maDon} (${buoi.ngay} ${buoi.gioBatDau}) do khoá sân ${san.tenSan}, không còn sân trống để chuyển`
          + `${hoanTien ? `, hoàn ${dinhDangTien(Number(buoi.tongTien))} (closure)` : ''}. Lý do: ${buoi.lyDoHuy}`,
      });
    }
  }
  return { cacDonDaHuy, tongTienHoan };
}

// Thông báo `booking_moved`: 1 thông báo / (khách, đợt thanh toán), ghi TÊN SÂN MỚI vì QR check-in theo từng sân.
async function baoKhachDaChuyen(ketNoi, cacBuoiDaChuyen, tenCoSo) {
  const theoDot = new Map();
  for (const buoi of cacBuoiDaChuyen) {
    if (!buoi.maKhachHang) continue; // đơn chủ sân tự tạo: không có khách trong hệ thống
    const khoaNhom = `${buoi.maKhachHang}:${buoi.khoaDot}`;
    if (!theoDot.has(khoaNhom)) theoDot.set(khoaNhom, []);
    theoDot.get(khoaNhom).push(buoi);
  }
  for (const cacBuoi of theoDot.values()) {
    const dau = cacBuoi[0];
    const mota = cacBuoi.slice(0, 5)
      .map((b) => `${dinhDangNgayVn(b.ngay).slice(0, 5)} ${b.gioBatDau}–${b.gioKetThuc} (${b.tenSanCu} → ${b.tenSanMoi})`)
      .join(', ') + (cacBuoi.length > 5 ? ` và ${cacBuoi.length - 5} buổi khác` : '');
    await guiThongBao(ketNoi, {
      maNguoiDung: dau.maKhachHang,
      loai: 'booking_moved',
      tieuDe: 'Chủ sân đã chuyển sân cho đơn của bạn',
      noiDung: `Đơn ${dau.maDon} - ${tenCoSo}: ${rutGonVanBan(mota, 300)}. Giờ chơi và số tiền giữ nguyên. `
        + 'Khi đến sân, hãy quét QR check-in tại sân mới. Nếu không đồng ý, bạn có thể bấm "Từ chối chuyển sân" để huỷ đơn và được hoàn 100% trước giờ chơi.',
      loaiThamChieu: 'booking',
      maThamChieu: dau.maDatSan,
      khoa: `booking_moved:${dau.maDatSan}:${Date.now()}`,
    });
  }
}

async function ghiNhatKyChuyen(ketNoi, maChuSan, cacBuoiDaChuyen, lyDo) {
  for (const buoi of cacBuoiDaChuyen) {
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'chuyen_san', doiTuong: 'DatSan', maDoiTuong: buoi.maDatSan,
      chiTiet: `Chuyển đơn ${buoi.maDon} (${buoi.ngay} ${buoi.gioBatDau}) từ ${buoi.tenSanCu} sang ${buoi.tenSanMoi} do khoá sân${lyDo ? `: ${lyDo}` : ''}`,
    });
  }
}

module.exports = {
  layDonVuong, timSanThayThe, tinhKhungKhoa, moTaDonVuong, chuyenMotBuoi, huyDonKhiKhoaSan, hoanTatHuyKhiKhoaSan,
  baoKhachDaChuyen, ghiNhatKyChuyen,
};
