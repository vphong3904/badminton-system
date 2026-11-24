// Hoàn tiền dùng chung (G4). MỌI nơi cần hoàn tiền (khách hủy, chủ sân hủy, quá hạn xác nhận...) chỉ gọi các hàm ở đây.
// Nguồn sự thật = bảng HoanTien. Các cột hoàn cũ trong ThanhToan (TrangThaiHoanTien, SoTienHoan, *TaiKhoanHoan) được GHI ĐỒNG BỘ
// ở `dongBoThanhToan` để danh sách đơn / báo cáo doanh thu cũ vẫn đọc được.
//
// Vòng đời: waiting_info → processing → refunded → received (đóng)
//                                         ↘ not_received (khách báo chưa nhận, vẫn tính HanHoan cũ) → refunded ...
//           processing/not_received: nhắc theo mốc trước HanHoan (refund_expiring); qua HanHoan + refund_overdue_grace_minutes → escalated NGAY (G9.C5).
//           (refund_grace_hours chỉ còn dùng làm hạn mới khi Admin chấp nhận khiếu nại hoàn tiền.)
//           Hạn HanHoan theo HoanTien.Loai, tính PHÚT (G9.C2): cancel 4320', owner_cancel/closure/incident 30', overpay tạm 3 ngày, late_proof Admin xử lý.
// Chứng từ hoàn = ẢNH chuyển khoản (bắt buộc), không dùng mã giao dịch. Hệ thống không giữ/chuyển/hoàn tiền thay chủ sân:
// Admin cũng chỉ được đánh dấu "đã hoàn" khi có ảnh chứng từ.
const fs = require('fs/promises');
const AppError = require('../utils/AppError');
const { layCauHinhSo, layCauHinhDanhSach } = require('./cauHinhService');
const { chonMocNhac } = require('../utils/mocNhac');
const nhatKy = require('./nhatKyService');
const { guiThongBao, guiChoQuanTri, dinhDangTien } = require('./notificationService');
const { layDuongDanTep, laAnhThat } = require('../middlewares/upload');

const LOAI = ['cancel', 'owner_cancel', 'closure', 'incident', 'overpay', 'late_proof'];
// Còn việc phải làm phía người chuyển tiền (chủ sân/Admin).
const TRANG_THAI_CHO_HOAN = ['processing', 'not_received', 'escalated'];
// G9.C2: hạn hoàn tính bằng PHÚT (để hạn 30 phút không bị làm tròn thành giờ).
const HAN_KHACH_HUY_MAC_DINH_PHUT = 4320; // 3 ngày
const HAN_CHU_SAN_HUY_MAC_DINH_PHUT = 30;
const HAN_LATE_PROOF_PHUT = 24 * 60; // late_proof do Admin xử lý (giữ nguyên 24 giờ như cũ), khoản waiting_info nên job không đụng tới
// Loại hoàn → khoá cấu hình hạn (phút). overpay: TẠM dùng hạn 3 ngày (điểm mở §8.1 kế hoạch G9, chốt sau).
const KHOA_HAN_THEO_LOAI = {
  cancel: ['refund_deadline_minutes_customer_cancel', HAN_KHACH_HUY_MAC_DINH_PHUT],
  overpay: ['refund_deadline_minutes_customer_cancel', HAN_KHACH_HUY_MAC_DINH_PHUT],
  owner_cancel: ['refund_deadline_minutes_owner_cancel', HAN_CHU_SAN_HUY_MAC_DINH_PHUT],
  closure: ['refund_deadline_minutes_owner_cancel', HAN_CHU_SAN_HUY_MAC_DINH_PHUT],
  incident: ['refund_deadline_minutes_owner_cancel', HAN_CHU_SAN_HUY_MAC_DINH_PHUT],
};

// Hạn hoàn (phút kể từ lúc tạo khoản hoàn) theo HoanTien.Loai.
async function layHanHoanPhut(ketNoi, loai) {
  const cauHinh = KHOA_HAN_THEO_LOAI[loai];
  return cauHinh ? layCauHinhSo(ketNoi, cauHinh[0], cauHinh[1]) : HAN_LATE_PROOF_PHUT;
}

// Số phút của hạn hoàn để HIỂN THỊ cho khách (`GET /khach/dat-san` → hanHoanPhut). late_proof do Admin xử lý → null (không nêu hạn).
async function layHanHoanPhutChoKhach(ketNoi, loai) {
  return loai === 'late_proof' ? null : layHanHoanPhut(ketNoi, loai);
}

// 30 → "30 phút", 90 → "90 phút", 360 → "6 giờ", 4320 → "3 ngày" (chỉ gọn khi chia hết).
function dinhDangThoiGianPhut(phut) {
  const so = Math.round(Number(phut) || 0);
  if (so >= 1440 && so % 1440 === 0) return `${so / 1440} ngày`;
  if (so >= 60 && so % 60 === 0) return `${so / 60} giờ`;
  return `${so} phút`;
}

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
  const hanPhut = await layHanHoanPhut(ketNoi, loai);
  const [[tk]] = await ketNoi.query(
    `SELECT TenNganHangHoan AS tenNganHang, MaNganHangHoan AS maNganHang, SoTaiKhoanHoan AS soTaiKhoan,
       ChuTaiKhoanHoan AS chuTaiKhoan FROM ThanhToan WHERE MaThanhToan=?`, [maThanhToan]);
  const [ketQua] = await ketNoi.query(
    `INSERT INTO HoanTien (MaThanhToan, MaDatSan, Loai, LyDo, TyLe, SoTien, TrangThai,
       TenNganHang, MaNganHang, SoTaiKhoan, ChuTaiKhoan, HanHoan)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, NOW() + INTERVAL ? MINUTE)`,
    [maThanhToan, maDatSan, loai, lyDo, tyLe, soTienHoan, trangThai,
      tk?.tenNganHang ?? null, tk?.maNganHang ?? null, tk?.soTaiKhoan ?? null, tk?.chuTaiKhoan ?? null, hanPhut]);
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

// Có khiếu nại hoàn tiền đang chờ cho khoản này → báo Admin diễn biến mới (chủ sân đã hoàn / khách đã nhận) để xử lý đúng.
async function baoAdminKhieuNaiHoan(ketNoi, maHoanTien, maLoai, tieuDe, noiDung) {
  const [cacKn] = await ketNoi.query(
    "SELECT MaKhieuNai AS ma FROM KhieuNai WHERE MaHoanTien=? AND Loai='refund' AND TrangThai='pending' AND DaXoa=0", [maHoanTien]);
  const lan = cacKn.length ? await soLanDaHoan(ketNoi, maHoanTien) : 0; // mỗi lần hoàn lại sau "chưa nhận" cần thông báo mới
  for (const { ma } of cacKn) {
    await guiChoQuanTri(ketNoi, {
      loai: 'complaint_received', tieuDe,
      noiDung: `Khiếu nại KN${String(ma).padStart(6, '0')}: ${noiDung}`,
      loaiThamChieu: 'complaint', maThamChieu: ma, khoa: `complaint_refund_update:${ma}:${maLoai}:${lan}`,
    });
  }
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
  await baoAdminKhieuNaiHoan(ketNoi, maHoanTien, 'refunded', 'Chủ sân đã hoàn tiền, chờ khách xác nhận',
    `[${nguoi.vaiTro}] đã chuyển hoàn ${dinhDangTien(moi.soTien)} kèm ảnh chứng từ cho đơn ${ben.maDon}. Chờ khách bấm "Đã nhận lại" rồi bác bỏ/đóng khiếu nại.`);
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
  await baoAdminKhieuNaiHoan(ketNoi, maHoanTien, 'received', 'Khách đã xác nhận nhận được tiền hoàn',
    `khách xác nhận đã nhận ${dinhDangTien(hoanTien.soTien)} của đơn ${ben.maDon}. Có thể bác bỏ khiếu nại để đóng vụ việc.`);
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
// Quá HanHoan (+ refund_overdue_grace_minutes) → escalated + báo Admin, khách, chủ sân (thang bậc khóa nhận đặt mới nối sang G5).
async function leoThang(ketNoi, maHoanTien) {
  const hoanTien = await layTheoMa(ketNoi, maHoanTien, true);
  if (!hoanTien || !['processing', 'not_received'].includes(hoanTien.trangThai)) return false;
  await ketNoi.query("UPDATE HoanTien SET TrangThai='escalated', NgayLeoThang=NOW() WHERE MaHoanTien=?", [maHoanTien]);
  await ghiNhatKy(ketNoi, null, 'leo_thang_hoan_tien', maHoanTien, `Quá hạn hoàn ${dinhDangTien(hoanTien.soTien)}, chuyển Admin`);
  const ben = await layBenLienQuan(ketNoi, maHoanTien);
  // G9.C10: khoản này đã có khiếu nại hoàn tiền được Admin chấp nhận (hạn mới = refund_grace_hours) mà chủ sân vẫn không hoàn.
  // Khách không khiếu nại lần 2 được (UNIQUE (MaDatSan, Loai)) → báo Admin xử lý trực tiếp thay vì chờ khách.
  const [[khieuNaiDaChapNhan]] = await ketNoi.query(
    "SELECT MaKhieuNai AS maKhieuNai FROM KhieuNai WHERE MaHoanTien=? AND Loai='refund' AND TrangThai='upheld' AND DaXoa=0 LIMIT 1", [maHoanTien]);
  if (khieuNaiDaChapNhan) {
    await guiChoQuanTri(ketNoi, {
      loai: 'refund_escalated', tieuDe: 'Chủ sân vẫn không hoàn tiền sau khi khiếu nại được chấp nhận',
      noiDung: `Đơn ${ben.maDon} (${ben.tenCoSo}): khiếu nại hoàn tiền đã được chấp nhận nhưng chủ sân vẫn chưa hoàn `
        + `${dinhDangTien(hoanTien.soTien)} trong hạn mới. Khách không khiếu nại lần 2 được, Admin cần xử lý trực tiếp `
        + `(có thể khoá nhận đặt mới của chủ sân #${ben.maChuSan} qua PATCH /quan-tri/chu-san/${ben.maChuSan}/khoa-dat-moi).`,
      loaiThamChieu: 'complaint', maThamChieu: Number(khieuNaiDaChapNhan.maKhieuNai),
      khoa: `refund_escalated_truc_tiep:${maHoanTien}`,
    });
  } else {
    await guiChoQuanTri(ketNoi, {
      loai: 'refund_escalated', tieuDe: 'Hoàn tiền quá hạn cần xử lý',
      noiDung: `Chủ sân chưa hoàn ${dinhDangTien(hoanTien.soTien)} cho đơn ${ben.maDon} (${ben.tenCoSo}) dù đã quá hạn.`,
      loaiThamChieu: 'payment', maThamChieu: hoanTien.maThanhToan, khoa: `refund_escalated:${maHoanTien}`,
    });
  }
  await guiThongBao(ketNoi, {
    maNguoiDung: ben.maKhachHang, loai: 'refund_escalated', tieuDe: 'Hoàn tiền đang được Admin theo dõi',
    noiDung: `Khoản hoàn ${dinhDangTien(hoanTien.soTien)} của đơn ${ben.maDon} đã quá hạn, Admin đã được báo để hỗ trợ bạn.`,
    loaiThamChieu: 'booking', maThamChieu: hoanTien.maDatSan, khoa: `refund_escalated_khach:${maHoanTien}`,
  });
  await guiThongBao(ketNoi, {
    maNguoiDung: ben.maChuSan, loai: 'refund_escalated', tieuDe: 'Hoàn tiền đã quá hạn, chuyển Admin',
    noiDung: `Khoản hoàn ${dinhDangTien(hoanTien.soTien)} cho đơn ${ben.maDon} (${ben.tenCoSo}) đã quá hạn và được chuyển cho Admin. `
      + 'Bạn vẫn có thể chuyển khoản và tải ảnh chứng từ ngay để hoàn tất.',
    loaiThamChieu: 'payment', maThamChieu: hoanTien.maThanhToan, khoa: `refund_escalated_chu_san:${maHoanTien}`,
  });
  return true;
}

// G9.C5: nhắc chủ sân hoàn tiền theo MỐC (loại thông báo `refund_expiring`).
//   - Hạn ngắn (tổng hạn ≤ refund_deadline_minutes_owner_cancel, vd 30'): refund_reminder_steps_short (20/10/5).
//   - Hạn dài (vd 3 ngày, hoặc hạn đặt lại sau khi Admin chấp nhận khiếu nại): refund_reminder_steps_long (1440/360/60).
//   Mốc lớn hơn tổng hạn bị bỏ. Mỗi lượt chọn mốc nhỏ nhất s thoả conPhut <= s; chống trùng KhoaChongTrung
//   'refund_expiring:<maHoanTien>:<s>'. Trả số thông báo đã gửi.
async function nhacTheoMoc(ketNoi) {
  const hanNganToiDa = await layCauHinhSo(ketNoi, 'refund_deadline_minutes_owner_cancel', HAN_CHU_SAN_HUY_MAC_DINH_PHUT);
  const mocNgan = await layCauHinhDanhSach(ketNoi, 'refund_reminder_steps_short', [20, 10, 5]);
  const mocDai = await layCauHinhDanhSach(ketNoi, 'refund_reminder_steps_long', [1440, 360, 60]);
  const mocLonNhat = Math.max(mocNgan[0], mocDai[0]);
  const [cacKhoan] = await ketNoi.query(
    `SELECT MaHoanTien AS ma,
       GREATEST(CEIL(TIMESTAMPDIFF(SECOND, NOW(), HanHoan) / 60), 1) AS conPhut,
       TIMESTAMPDIFF(MINUTE, NgayTao, HanHoan) AS tongHanPhut
     FROM HoanTien
     WHERE TrangThai IN ('processing','not_received') AND HanHoan IS NOT NULL
       AND HanHoan > NOW() AND HanHoan <= NOW() + INTERVAL ? MINUTE
     ORDER BY MaHoanTien LIMIT 200`, [mocLonNhat]);
  let soNhac = 0;
  for (const khoan of cacKhoan) {
    const tongHan = Number(khoan.tongHanPhut);
    const moc = chonMocNhac(Number(khoan.conPhut), tongHan <= hanNganToiDa ? mocNgan : mocDai, tongHan);
    if (moc === null) continue;
    const hoanTien = await layTheoMa(ketNoi, khoan.ma, true);
    if (!hoanTien || !['processing', 'not_received'].includes(hoanTien.trangThai)) continue;
    const ben = await layBenLienQuan(ketNoi, khoan.ma);
    await guiThongBao(ketNoi, {
      maNguoiDung: ben.maChuSan, loai: 'refund_expiring', tieuDe: 'Sắp hết hạn hoàn tiền cho khách',
      noiDung: `Bạn còn khoảng ${dinhDangThoiGianPhut(khoan.conPhut)} để hoàn ${dinhDangTien(hoanTien.soTien)} cho đơn ${ben.maDon} `
        + `(${ben.tenCoSo}). Vui lòng chuyển khoản và tải ảnh chứng từ, quá hạn khoản này sẽ chuyển cho Admin xử lý.`,
      loaiThamChieu: 'payment', maThamChieu: hoanTien.maThanhToan, khoa: `refund_expiring:${khoan.ma}:${moc}`,
    });
    soNhac += 1;
  }
  return soNhac;
}

// Một lượt job (G9.C5, chu kỳ 1 phút):
//   1) khoản `processing`/`not_received` qua HanHoan + refund_overdue_grace_minutes (mặc định 0) → `escalated` NGAY,
//      báo Admin + khách + chủ sân (không còn nhánh "nhắc quá hạn rồi chờ refund_grace_hours"). Chủ sân vẫn hoàn được khi escalated.
//   2) khoản còn hạn → nhắc theo mốc (nhacTheoMoc).
async function chayJobHanHoan(ketNoi) {
  const gracePhut = await layCauHinhSo(ketNoi, 'refund_overdue_grace_minutes', 0);
  const [cacLeoThang] = await ketNoi.query(
    `SELECT MaHoanTien AS ma FROM HoanTien
     WHERE TrangThai IN ('processing','not_received') AND HanHoan IS NOT NULL AND HanHoan + INTERVAL ? MINUTE < NOW()
     ORDER BY MaHoanTien LIMIT 200 FOR UPDATE`, [gracePhut]);
  let soLeoThang = 0;
  for (const { ma } of cacLeoThang) if (await leoThang(ketNoi, ma)) soLeoThang += 1;
  const soNhac = await nhacTheoMoc(ketNoi);
  return { soNhac, soLeoThang };
}

module.exports = {
  LOAI, TRANG_THAI_CHO_HOAN,
  taoYeuCauHoan, dongBoHoanTienQuaHan, capNhatTaiKhoanNhan, kiemTraAnhChungTu,
  danhDauDaHoan, khachXacNhan, khachBaoChuaNhan, leoThang, nhacTheoMoc, chayJobHanHoan,
  layYeuCauDangMo, layTheoMa, dongBoThanhToan, layHanHoanPhut, layHanHoanPhutChoKhach, dinhDangThoiGianPhut,
};
