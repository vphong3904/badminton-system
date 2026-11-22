// Hoàn tiền dùng chung (G4). MỌI nơi cần hoàn tiền (khách hủy, chủ sân hủy, quá hạn xác nhận...) chỉ gọi các hàm ở đây.
// Nguồn sự thật = bảng HoanTien. Các cột hoàn cũ trong ThanhToan (TrangThaiHoanTien, SoTienHoan, *TaiKhoanHoan) được GHI ĐỒNG BỘ
// ở `dongBoThanhToan` để danh sách đơn / báo cáo doanh thu cũ vẫn đọc được.
//
// Vòng đời: waiting_info → processing → refunded → received (đóng)
//                                         ↘ not_received (khách báo chưa nhận, vẫn tính HanHoan cũ) → refunded ...
//           processing/not_received quá HanHoan → nhắc chủ sân; quá HanHoan + refund_grace_hours → escalated (báo Admin).
// Chứng từ hoàn = ẢNH chuyển khoản (bắt buộc), không dùng mã giao dịch. Hệ thống không giữ/chuyển/hoàn tiền thay chủ sân:
// Admin cũng chỉ được đánh dấu "đã hoàn" khi có ảnh chứng từ.
const fs = require('fs/promises');
const AppError = require('../utils/AppError');
const { layCauHinhSo } = require('./cauHinhService');
const nhatKy = require('./nhatKyService');
const { guiThongBao, guiChoQuanTri, dinhDangTien } = require('./notificationService');
const { layDuongDanTep, laAnhThat } = require('../middlewares/upload');

const LOAI = ['cancel', 'owner_cancel', 'closure', 'incident', 'overpay', 'late_proof'];
// Còn việc phải làm phía người chuyển tiền (chủ sân/Admin).
const TRANG_THAI_CHO_HOAN = ['processing', 'not_received', 'escalated'];
const HAN_HOAN_MAC_DINH_GIO = 24;
const GIA_HAN_MAC_DINH_GIO = 24;

// ThanhToan.TrangThaiHoanTien (enum cũ) tương ứng với trạng thái HoanTien.
const TRANG_THAI_THANH_TOAN = {
  waiting_info: 'waiting_info',
  processing: 'processing',
  not_received: 'processing',
  escalated: 'processing',
  refunded: 'refunded',
  received: 'received',
};

const ghiNhatKy = (ketNoi, maNguoi, hanhDong, maHoanTien, chiTiet) =>
  nhatKy.ghiNhatKy(ketNoi, { maNguoiThucHien: maNguoi, hanhDong, doiTuong: 'HoanTien', maDoiTuong: maHoanTien, chiTiet });

async function dongBoThanhToan(ketNoi, hoanTien) {
  await ketNoi.query(
    `UPDATE ThanhToan SET TrangThaiHoanTien=?, SoTienHoan=?, NgayHoan=?,
       TenNganHangHoan=?, MaNganHangHoan=?, SoTaiKhoanHoan=?, ChuTaiKhoanHoan=?
     WHERE MaThanhToan=?`,
    [TRANG_THAI_THANH_TOAN[hoanTien.trangThai], hoanTien.soTien, hoanTien.ngayHoan ?? null,
      hoanTien.tenNganHang ?? null, hoanTien.maNganHang ?? null, hoanTien.soTaiKhoan ?? null,
      hoanTien.chuTaiKhoan ?? null, hoanTien.maThanhToan]);
}

const COT_HOAN_TIEN = `h.MaHoanTien AS maHoanTien, h.MaThanhToan AS maThanhToan, h.MaDatSan AS maDatSan, h.Loai AS loai,
  h.SoTien AS soTien, h.TrangThai AS trangThai, h.TenNganHang AS tenNganHang, h.MaNganHang AS maNganHang,
  h.SoTaiKhoan AS soTaiKhoan, h.ChuTaiKhoan AS chuTaiKhoan, h.HanHoan AS hanHoan, h.AnhChungTu AS anhChungTu,
  h.NgayHoan AS ngayHoan, h.NgayNhacHan AS ngayNhacHan`;

// Khoản hoàn "đang mở" (chưa đóng) mới nhất của một thanh toán. `khoa` = FOR UPDATE.
async function layYeuCauDangMo(ketNoi, maThanhToan, khoa = false) {
  const [[dong]] = await ketNoi.query(
    `SELECT ${COT_HOAN_TIEN} FROM HoanTien h
     WHERE h.MaThanhToan=? AND h.TrangThai IN ('waiting_info','processing','not_received','escalated','refunded')
     ORDER BY h.MaHoanTien DESC LIMIT 1 ${khoa ? 'FOR UPDATE' : ''}`,
    [maThanhToan]);
  return dong || null;
}

async function layTheoMa(ketNoi, maHoanTien, khoa = false) {
  const [[dong]] = await ketNoi.query(
    `SELECT ${COT_HOAN_TIEN} FROM HoanTien h WHERE h.MaHoanTien=? ${khoa ? 'FOR UPDATE' : ''}`, [maHoanTien]);
  return dong || null;
}

// Chủ sân sở hữu khoản hoàn (qua đơn → sân → cơ sở) và khách của đơn.
async function layBenLienQuan(ketNoi, maHoanTien) {
  const [[dong]] = await ketNoi.query(
    `SELECT cs.MaChuSan AS maChuSan, d.MaKhachHang AS maKhachHang, d.MaDon AS maDon, cs.TenCoSo AS tenCoSo
     FROM HoanTien h JOIN DatSan d ON d.MaDatSan=h.MaDatSan
       JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE h.MaHoanTien=?`, [maHoanTien]);
  return dong || {};
}

// ---------------------------------------------------------------------------------------------------------------------
// Tạo yêu cầu hoàn. `trangThai`: 'processing' (mặc định: chờ chủ sân chuyển) hoặc 'waiting_info' (chờ khách nhập TK nhận hoàn,
// dùng cho khoản Admin xử lý như late_proof). soTien ≤ 0 → không tạo (trả null).
// Tài khoản nhận hoàn khách đã nhập trước đó (nếu có) được chép sang từ ThanhToan.
async function taoYeuCauHoan(ketNoi, {
  maThanhToan, maDatSan, loai = 'cancel', soTien, tyLe = null, lyDo = null, trangThai = 'processing',
}) {
  if (!LOAI.includes(loai)) throw new Error(`Loại hoàn tiền không hợp lệ: ${loai}`);
  const soTienHoan = Math.round(Number(soTien) || 0);
  if (soTienHoan <= 0) return null;
  const hanGio = await layCauHinhSo(ketNoi, 'refund_deadline_hours', HAN_HOAN_MAC_DINH_GIO);
  const [[tk]] = await ketNoi.query(
    `SELECT TenNganHangHoan AS tenNganHang, MaNganHangHoan AS maNganHang, SoTaiKhoanHoan AS soTaiKhoan,
       ChuTaiKhoanHoan AS chuTaiKhoan FROM ThanhToan WHERE MaThanhToan=?`, [maThanhToan]);
  const [ketQua] = await ketNoi.query(
    `INSERT INTO HoanTien (MaThanhToan, MaDatSan, Loai, LyDo, TyLe, SoTien, TrangThai,
       TenNganHang, MaNganHang, SoTaiKhoan, ChuTaiKhoan, HanHoan)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, NOW() + INTERVAL ? HOUR)`,
    [maThanhToan, maDatSan, loai, lyDo, tyLe, soTienHoan, trangThai,
      tk?.tenNganHang ?? null, tk?.maNganHang ?? null, tk?.soTaiKhoan ?? null, tk?.chuTaiKhoan ?? null, hanGio]);
  const hoanTien = await layTheoMa(ketNoi, ketQua.insertId);
  await dongBoThanhToan(ketNoi, { ...hoanTien, tenNganHang: tk?.tenNganHang, maNganHang: tk?.maNganHang,
    soTaiKhoan: tk?.soTaiKhoan, chuTaiKhoan: tk?.chuTaiKhoan });
  return hoanTien;
}

// Đơn quá hạn xác nhận (ThanhToan.TrangThai='late_payment', hoàn 'waiting_info') mà chưa có HoanTien → tạo dòng late_proof.
// Gọi sau các lệnh UPDATE chuyển late_payment (customerService.hetHanDatSan, paymentService.chotHetHan).
async function dongBoHoanTienQuaHan(ketNoi, maThanhToan = null) {
  const loc = maThanhToan ? 'AND t.MaThanhToan=?' : '';
  const [cacDong] = await ketNoi.query(
    `SELECT t.MaThanhToan AS maThanhToan, t.MaDatSan AS maDatSan, t.SoTienHoan AS soTien
     FROM ThanhToan t
     WHERE t.TrangThai='late_payment' AND t.TrangThaiHoanTien='waiting_info' ${loc}
       AND NOT EXISTS (SELECT 1 FROM HoanTien h WHERE h.MaThanhToan=t.MaThanhToan)`,
    maThanhToan ? [maThanhToan] : []);
  for (const dong of cacDong) {
    await taoYeuCauHoan(ketNoi, {
      maThanhToan: dong.maThanhToan, maDatSan: dong.maDatSan, loai: 'late_proof', soTien: dong.soTien,
      tyLe: 100, lyDo: 'Quá hạn giữ chỗ khi chủ sân chưa xác nhận', trangThai: 'waiting_info',
    });
  }
  return cacDong.length;
}

// Khách nhập / sửa tài khoản nhận hoàn (khoản còn đang chờ chuyển). Sai tài khoản → khách sửa, chủ sân chuyển lại.
async function capNhatTaiKhoanNhan(ketNoi, maThanhToan, taiKhoan) {
  await ketNoi.query(
    `UPDATE HoanTien SET TenNganHang=?, MaNganHang=?, SoTaiKhoan=?, ChuTaiKhoan=?
     WHERE MaThanhToan=? AND TrangThai IN ('waiting_info','processing','not_received','escalated')`,
    [taiKhoan.tenNganHang, taiKhoan.maNganHang, taiKhoan.soTaiKhoan, taiKhoan.chuTaiKhoan, maThanhToan]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Ảnh chứng từ hoàn: bắt buộc, đúng ảnh JPG/PNG/WEBP (file multer đã lưu ở uploads/). Lỗi → xoá file vừa nhận.
async function kiemTraAnhChungTu(tep) {
  if (!tep) {
    throw AppError.duLieuKhongHopLe('Vui lòng tải ảnh chứng từ chuyển khoản hoàn tiền.', [
      { truong: 'anhChungTu', thongBao: 'Vui lòng tải ảnh chứng từ chuyển khoản hoàn tiền.' }]);
  }
  if (!await laAnhThat(tep.path)) {
    await fs.unlink(tep.path).catch(() => {});
    throw AppError.duLieuKhongHopLe('Chỉ nhận ảnh JPG, PNG, WEBP.', [
      { truong: 'anhChungTu', thongBao: 'Chỉ nhận ảnh JPG, PNG, WEBP.' }]);
  }
  return layDuongDanTep(tep);
}

// Chủ sân hoặc Admin bấm "Đã hoàn": BẮT BUỘC có ảnh chứng từ. `nguoi` = {maNguoiDung, vaiTro:'owner'|'admin'}.
// Cho phép từ processing / not_received / escalated (chưa có người chuyển hoặc khách báo chưa nhận). waiting_info chưa được.
async function danhDauDaHoan(ketNoi, { maHoanTien, nguoi, duongDanAnh }) {
  if (!duongDanAnh) {
    throw AppError.duLieuKhongHopLe('Cần ảnh chứng từ chuyển khoản hoàn tiền.', [
      { truong: 'anhChungTu', thongBao: 'Vui lòng tải ảnh chứng từ chuyển khoản hoàn tiền.' }]);
  }
  const hoanTien = await layTheoMa(ketNoi, maHoanTien, true);
  if (!hoanTien) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
  if (!TRANG_THAI_CHO_HOAN.includes(hoanTien.trangThai)) {
    throw AppError.biTrung('Yêu cầu hoàn tiền không ở trạng thái chờ hoàn', 'REFUND_NOT_PENDING');
  }
  await ketNoi.query(
    `UPDATE HoanTien SET TrangThai='refunded', AnhChungTu=?, MaNguoiHoan=?, VaiTroHoan=?, NgayHoan=NOW()
     WHERE MaHoanTien=?`,
    [duongDanAnh, nguoi.maNguoiDung, nguoi.vaiTro, maHoanTien]);
  const moi = await layTheoMa(ketNoi, maHoanTien);
  await dongBoThanhToan(ketNoi, moi);
  await ghiNhatKy(ketNoi, nguoi.maNguoiDung, 'danh_dau_da_hoan', maHoanTien,
    `[${nguoi.vaiTro}] hoàn ${dinhDangTien(moi.soTien)} cho đơn ${moi.maDatSan}, có ảnh chứng từ`);
  const ben = await layBenLienQuan(ketNoi, maHoanTien);
  await guiThongBao(ketNoi, {
    maNguoiDung: ben.maKhachHang,
    loai: 'refund_completed',
    tieuDe: 'Bạn đã được hoàn tiền',
    noiDung: `${dinhDangTien(moi.soTien)} của đơn ${ben.maDon} (${ben.tenCoSo}) đã được chuyển hoàn kèm ảnh chứng từ. `
      + 'Vui lòng kiểm tra tài khoản rồi bấm "Đã nhận lại" hoặc "Chưa nhận được".',
    loaiThamChieu: 'booking',
    maThamChieu: moi.maDatSan,
    khoa: `refund_completed:${maHoanTien}:${await soLanDaHoan(ketNoi, maHoanTien)}`,
  });
  return { maHoanTien: Number(maHoanTien), maThanhToan: moi.maThanhToan, trangThaiHoanTien: 'refunded',
    anhChungTuUrl: moi.anhChungTu };
}

// Mỗi lần chủ sân hoàn lại sau khi khách báo chưa nhận cần một thông báo mới → khoá chống trùng theo số lần.
async function soLanDaHoan(ketNoi, maHoanTien) {
  const [[dong]] = await ketNoi.query('SELECT SoLanChuaNhan AS n FROM HoanTien WHERE MaHoanTien=?', [maHoanTien]);
  return dong?.n ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Khách xác nhận đã nhận lại tiền → received (đóng).
async function khachXacNhan(ketNoi, maKhach, maHoanTien) {
  const hoanTien = await layTheoMa(ketNoi, maHoanTien, true);
  const ben = hoanTien ? await layBenLienQuan(ketNoi, maHoanTien) : {};
  if (!hoanTien || Number(ben.maKhachHang) !== Number(maKhach)) {
    throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
  }
  if (hoanTien.trangThai === 'received') {
    return { maHoanTien: Number(maHoanTien), trangThaiHoanTien: 'received' }; // bấm lặp: coi như xong
  }
  if (hoanTien.trangThai !== 'refunded') {
    throw AppError.biTrung('Khoản hoàn này chưa được chủ sân chuyển, chưa thể xác nhận đã nhận.', 'REFUND_NOT_SENT');
  }
  await ketNoi.query("UPDATE HoanTien SET TrangThai='received', NgayKhachXacNhan=NOW() WHERE MaHoanTien=?", [maHoanTien]);
  await dongBoThanhToan(ketNoi, { ...hoanTien, trangThai: 'received', ngayHoan: hoanTien.ngayHoan });
  await ghiNhatKy(ketNoi, maKhach, 'khach_xac_nhan_da_nhan_hoan', maHoanTien, `Khách xác nhận đã nhận ${dinhDangTien(hoanTien.soTien)}`);
  await guiThongBao(ketNoi, {
    maNguoiDung: ben.maChuSan,
    loai: 'refund_received',
    tieuDe: 'Khách đã nhận lại tiền',
    noiDung: `Khách xác nhận đã nhận ${dinhDangTien(hoanTien.soTien)} cho đơn ${ben.maDon}. Khoản hoàn đã đóng.`,
    loaiThamChieu: 'payment',
    maThamChieu: hoanTien.maThanhToan,
    khoa: `refund_received:${maHoanTien}`,
  });
  return { maHoanTien: Number(maHoanTien), trangThaiHoanTien: 'received' };
}

// Khách báo chưa nhận được → not_received. Vẫn tính HanHoan cũ (không gia hạn): quá hạn thì job nhắc/leo thang như cũ.
async function khachBaoChuaNhan(ketNoi, maKhach, maHoanTien, ghiChu = null) {
  const hoanTien = await layTheoMa(ketNoi, maHoanTien, true);
  const ben = hoanTien ? await layBenLienQuan(ketNoi, maHoanTien) : {};
  if (!hoanTien || Number(ben.maKhachHang) !== Number(maKhach)) {
    throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
  }
  if (hoanTien.trangThai !== 'refunded') {
    throw AppError.biTrung(
      hoanTien.trangThai === 'received'
        ? 'Bạn đã xác nhận nhận được tiền rồi.'
        : 'Khoản hoàn này chưa được chủ sân chuyển.',
      'REFUND_NOT_SENT');
  }
  await ketNoi.query(
    `UPDATE HoanTien SET TrangThai='not_received', SoLanChuaNhan=SoLanChuaNhan+1, GhiChuKhach=?, NgayHoan=NULL
     WHERE MaHoanTien=?`,
    [ghiChu ? String(ghiChu).slice(0, 255) : null, maHoanTien]);
  const moi = await layTheoMa(ketNoi, maHoanTien);
  await dongBoThanhToan(ketNoi, moi); // → processing, NgayHoan NULL (chưa tính là đã hoàn trong báo cáo)
  await ghiNhatKy(ketNoi, maKhach, 'khach_bao_chua_nhan_hoan', maHoanTien, ghiChu || 'Khách báo chưa nhận được tiền hoàn');
  const noiDung = `Khách báo CHƯA nhận được ${dinhDangTien(hoanTien.soTien)} của đơn ${ben.maDon}. `
    + 'Vui lòng kiểm tra lại chuyển khoản (đúng tài khoản/số tiền) và tải ảnh chứng từ mới.';
  const lanNay = (await soLanDaHoan(ketNoi, maHoanTien));
  await guiThongBao(ketNoi, {
    maNguoiDung: ben.maChuSan, loai: 'refund_not_received', tieuDe: 'Khách chưa nhận được tiền hoàn',
    noiDung, loaiThamChieu: 'payment', maThamChieu: hoanTien.maThanhToan, khoa: `refund_not_received:${maHoanTien}:${lanNay}`,
  });
  return { maHoanTien: Number(maHoanTien), trangThaiHoanTien: 'not_received', hanHoan: hoanTien.hanHoan };
}

// ---------------------------------------------------------------------------------------------------------------------
// Quá hạn quá gia hạn → escalated + báo Admin (thang bậc khóa nhận đặt mới nối sang G5).
async function leoThang(ketNoi, maHoanTien) {
  const hoanTien = await layTheoMa(ketNoi, maHoanTien, true);
  if (!hoanTien || !['processing', 'not_received'].includes(hoanTien.trangThai)) return false;
  await ketNoi.query("UPDATE HoanTien SET TrangThai='escalated', NgayLeoThang=NOW() WHERE MaHoanTien=?", [maHoanTien]);
  await ghiNhatKy(ketNoi, null, 'leo_thang_hoan_tien', maHoanTien, `Quá hạn hoàn ${dinhDangTien(hoanTien.soTien)}, chuyển Admin`);
  const ben = await layBenLienQuan(ketNoi, maHoanTien);
  await guiChoQuanTri(ketNoi, {
    loai: 'refund_escalated', tieuDe: 'Hoàn tiền quá hạn cần xử lý',
    noiDung: `Chủ sân chưa hoàn ${dinhDangTien(hoanTien.soTien)} cho đơn ${ben.maDon} (${ben.tenCoSo}) dù đã quá hạn.`,
    loaiThamChieu: 'payment', maThamChieu: hoanTien.maThanhToan, khoa: `refund_escalated:${maHoanTien}`,
  });
  await guiThongBao(ketNoi, {
    maNguoiDung: ben.maKhachHang, loai: 'refund_escalated', tieuDe: 'Hoàn tiền đang được Admin theo dõi',
    noiDung: `Khoản hoàn ${dinhDangTien(hoanTien.soTien)} của đơn ${ben.maDon} đã quá hạn, Admin đã được báo để hỗ trợ bạn.`,
    loaiThamChieu: 'booking', maThamChieu: hoanTien.maDatSan, khoa: `refund_escalated_khach:${maHoanTien}`,
  });
  return true;
}

// Nhắc chủ sân quá hạn (1 lần / khoản).
async function nhacChuSan(ketNoi, maHoanTien) {
  const hoanTien = await layTheoMa(ketNoi, maHoanTien, true);
  if (!hoanTien || !['processing', 'not_received'].includes(hoanTien.trangThai) || hoanTien.ngayNhacHan) return false;
  await ketNoi.query('UPDATE HoanTien SET NgayNhacHan=NOW() WHERE MaHoanTien=?', [maHoanTien]);
  const ben = await layBenLienQuan(ketNoi, maHoanTien);
  const graceGio = await layCauHinhSo(ketNoi, 'refund_grace_hours', GIA_HAN_MAC_DINH_GIO);
  await guiThongBao(ketNoi, {
    maNguoiDung: ben.maChuSan, loai: 'refund_reminder', tieuDe: 'Quá hạn hoàn tiền cho khách',
    noiDung: `Bạn chưa hoàn ${dinhDangTien(hoanTien.soTien)} cho đơn ${ben.maDon} và đã quá hạn. `
      + `Vui lòng chuyển khoản và tải ảnh chứng từ trong ${graceGio} giờ tới, nếu không khoản này sẽ chuyển cho Admin.`,
    loaiThamChieu: 'payment', maThamChieu: hoanTien.maThanhToan, khoa: `refund_reminder:${maHoanTien}`,
  });
  return true;
}

// Một lượt job: nhắc các khoản quá HanHoan; leo thang các khoản quá HanHoan + refund_grace_hours.
async function chayJobHanHoan(ketNoi) {
  const graceGio = await layCauHinhSo(ketNoi, 'refund_grace_hours', GIA_HAN_MAC_DINH_GIO);
  const [cacLeoThang] = await ketNoi.query(
    `SELECT MaHoanTien AS ma FROM HoanTien
     WHERE TrangThai IN ('processing','not_received') AND HanHoan IS NOT NULL AND HanHoan + INTERVAL ? HOUR < NOW()
     ORDER BY MaHoanTien LIMIT 200 FOR UPDATE`, [graceGio]);
  let soLeoThang = 0;
  for (const { ma } of cacLeoThang) if (await leoThang(ketNoi, ma)) soLeoThang += 1;
  const [cacNhac] = await ketNoi.query(
    `SELECT MaHoanTien AS ma FROM HoanTien
     WHERE TrangThai IN ('processing','not_received') AND HanHoan IS NOT NULL AND HanHoan < NOW() AND NgayNhacHan IS NULL
     ORDER BY MaHoanTien LIMIT 200 FOR UPDATE`);
  let soNhac = 0;
  for (const { ma } of cacNhac) if (await nhacChuSan(ketNoi, ma)) soNhac += 1;
  return { soNhac, soLeoThang };
}

module.exports = {
  LOAI, TRANG_THAI_CHO_HOAN,
  taoYeuCauHoan, dongBoHoanTienQuaHan, capNhatTaiKhoanNhan, kiemTraAnhChungTu,
  danhDauDaHoan, khachXacNhan, khachBaoChuaNhan, leoThang, nhacChuSan, chayJobHanHoan,
  layYeuCauDangMo, layTheoMa, dongBoThanhToan,
};
