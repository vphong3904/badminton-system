const fs = require('fs/promises');
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { taoAnhQrUrl, taoNoiDungQr, layTaiKhoanNhanTheoDatSan } = require('../utils/vietqr');
const { layDuongDanTep, laAnhThat } = require('../middlewares/upload');
const hoanTienService = require('./hoanTienService');
const { guiThongBao, giaiPhongKhoaNhac, dinhDangTien } = require('./notificationService');
const { layCauHinhSo } = require('./cauHinhService');
const nhatKy = require('./nhatKyService');
const chungTu = require('./chungTuService');

// Luồng thanh toán (không dùng cổng thanh toán tự động):
//  1) khách đặt sân → ThanhToan 'pending', giữ chỗ hold_minutes
//  2) khách quét QR chuyển khoản, chụp màn hình, gửi ảnh → ThanhToan 'confirming' (đợi xác nhận) + thêm 1 dòng
//     ChungTuThanhToan (G2: KHÔNG xoá ảnh cũ, có SHA-256 + giờ chuyển tuỳ chọn). Đơn gửi ảnh được giữ chỗ vô thời hạn
//     (DatSan.HetHanGiuCho=NULL, slot.js coi là đang bận); ThanhToan.HanXacNhan = LEAST(lúc gửi + confirm_minutes (confirm_urgent_minutes
//     nếu đặt gấp), giờ bắt đầu chơi) — gửi ngoài giờ mở cửa thì tính từ lúc mở cửa kế tiếp (G9.C3). Chỉ là hạn để
//     nhắc/Admin theo dõi, quá hạn KHÔNG tự nhả slot.
//  3) chủ sân HOẶC admin xác nhận → ThanhToan 'success' + đơn 'confirmed';
//     hoặc từ chối (kèm lý do) → quay về 'pending', giữ chỗ lại hold_minutes, khách gửi lại ảnh (ảnh cũ vẫn lưu ở chứng từ)
//  4) quá HanXacNhan mà chưa ai xử lý → hiện ở tab Admin "Chờ xác nhận / quá hạn" để xử lý tay (đối soát tự động: hoãn, 4a)

const PHUT_CHO_XAC_NHAN_MAC_DINH = 30;
const PHUT_GIU_CHO_MAC_DINH = 10;

// Điều kiện chọn mọi DatSan cùng một đợt thanh toán: lịch cố định có nhiều buổi dùng chung 1 thanh toán;
// đặt nhiều sân/khung giờ (G1) gom các đơn con theo MaNhomDat (đơn lẻ = nhóm 1 dòng).
function dieuKienCungDot(thanhToan) {
  return thanhToan.maLichCoDinh
    ? { sql: 'MaLichCoDinh=?', thamSo: [thanhToan.maLichCoDinh] }
    : { sql: 'COALESCE(MaNhomDat, MaDatSan)=?', thamSo: [thanhToan.maNhomDat ?? thanhToan.maDatSan] };
}

async function layThanhToanCuaKhach(maNguoiDung, maDatSan, ketNoi = pool, khoa = false) {
  const [[thanhToan]] = await ketNoi.query(
    `SELECT t.MaThanhToan AS maThanhToan,
       t.SoTien AS soTien, t.TrangThai AS trangThai, t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.HanXacNhan AS hanXacNhan,
       d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh, d.MaNhomDat AS maNhomDat,
       d.MaKhachHang AS maKhachHang, d.TrangThai AS trangThaiDatSan,
       d.HetHanGiuCho AS hetHanGiuCho
     FROM DatSan d JOIN ThanhToan t ON t.MaDatSan=CASE
       WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
       ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
     END
     WHERE d.MaDatSan=? AND d.MaKhachHang=? ${khoa ? 'FOR UPDATE' : ''}`,
    [maDatSan, maNguoiDung]);
  if (!thanhToan) throw AppError.khongTimThay('Không tìm thấy thanh toán');
  return thanhToan;
}

// Chốt đơn đã quá hạn giữ chỗ (gọi trong giao dịch). Đã gửi ảnh (confirming) → late_payment để admin
// xử lý hoàn tiền nếu khách thật sự đã chuyển; chưa gửi ảnh (pending) → expired.
async function chotHetHan(ketNoi, thanhToan) {
  const cungDot = dieuKienCungDot(thanhToan);
  await ketNoi.query(
    `UPDATE DatSan SET TrangThai='expired' WHERE ${cungDot.sql} AND TrangThai='pending_payment'`,
    cungDot.thamSo);
  if (thanhToan.maLichCoDinh) {
    await ketNoi.query(
      "UPDATE LichCoDinh SET TrangThai='ended' WHERE MaLichCoDinh=?", [thanhToan.maLichCoDinh]);
  }
  if (thanhToan.trangThai === 'confirming') {
    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThai='late_payment', TrangThaiHoanTien='waiting_info',
         SoTienHoan=SoTien, LyDoLoi='Het han giu cho khi chu san chua xac nhan'
       WHERE MaThanhToan=? AND TrangThai='confirming'`,
      [thanhToan.maThanhToan]);
    await hoanTienService.dongBoHoanTienQuaHan(ketNoi, thanhToan.maThanhToan); // G4
  } else {
    await ketNoi.query(
      "UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan=? AND TrangThai='pending'",
      [thanhToan.maThanhToan]);
  }
}

// Còn hạn giữ chỗ không? HetHanGiuCho=NULL = giữ vô thời hạn (khách đã gửi ảnh, đang chờ chủ sân/Admin — G2):
// không bao giờ coi là hết hạn. Chỉ đơn `pending` (chưa gửi ảnh) mới có hạn thật và so với NOW() của DB.
async function conHanGiuCho(ketNoi, thanhToan) {
  if (thanhToan.hetHanGiuCho === null || thanhToan.hetHanGiuCho === undefined) {
    return thanhToan.trangThai === 'confirming';
  }
  const [[hanGiu]] = await ketNoi.query('SELECT ? > NOW() AS conHan', [thanhToan.hetHanGiuCho]);
  return !!Number(hanGiu.conHan);
}

// Kiểm tra đơn còn chờ thanh toán và còn hạn. Hết hạn thì chốt rồi trả cờ (ném lỗi SAU khi commit).
async function kiemTraConHan(ketNoi, thanhToan) {
  if (thanhToan.trangThai === 'success') {
    throw AppError.biTrung('Đơn đã được xác nhận thanh toán');
  }
  if (!['pending', 'confirming'].includes(thanhToan.trangThai)
    || thanhToan.trangThaiDatSan !== 'pending_payment') {
    throw AppError.biTrung('Đơn không còn trong thời hạn chờ thanh toán');
  }
  if (!await conHanGiuCho(ketNoi, thanhToan)) {
    await chotHetHan(ketNoi, thanhToan);
    return false;
  }
  return true;
}

async function layQr(maNguoiDung, maDatSan) {
  const thanhToan = await layThanhToanCuaKhach(maNguoiDung, maDatSan);
  if (!['pending', 'confirming'].includes(thanhToan.trangThai)
    || thanhToan.trangThaiDatSan !== 'pending_payment') {
    throw AppError.biTrung('Đơn không còn trong thời hạn chờ thanh toán');
  }
  if (!await conHanGiuCho(pool, thanhToan)) {
    await thucHienGiaoDich((ketNoi) => chotHetHan(ketNoi, thanhToan));
    throw AppError.biTrung('Thời gian giữ chỗ đã hết hạn');
  }
  const taiKhoan = await layTaiKhoanNhanTheoDatSan(pool, maDatSan);
  return {
    maThanhToan: thanhToan.maThanhToan,
    soTien: Number(thanhToan.soTien),
    noiDungChuyenKhoan: thanhToan.noiDungChuyenKhoan,
    trangThai: thanhToan.trangThai,
    anhQrUrl: taoAnhQrUrl(thanhToan.noiDungChuyenKhoan, Number(thanhToan.soTien), taiKhoan),
    maQr: taoNoiDungQr(thanhToan.noiDungChuyenKhoan, Number(thanhToan.soTien), taiKhoan),
    chuaCauHinhThanhToan: !taiKhoan,
  };
}

// Khách gửi ảnh chuyển khoản. Mã đơn, tên, SĐT, số tiền đã nằm sẵn trong đơn nên chủ sân xem được
// cùng ảnh; không nhận từ client để khỏi bị sửa. Chỉ nhận thêm `thoiDiemChuyen` (giờ trên biên lai, tuỳ chọn).
// G2: mỗi lần gửi thêm 1 dòng ChungTuThanhToan (KHÔNG xoá ảnh cũ); trùng hash với đơn khác KHÔNG bị từ chối
// (cảnh báo chỉ hiện cho chủ sân/Admin, khách không biết).
async function guiAnhChuyenKhoan(maNguoiDung, maDatSan, tep, duLieu = {}) {
  if (!tep) {
    throw AppError.duLieuKhongHopLe('Vui lòng tải ảnh chuyển khoản.', [
      { truong: 'anhChuyenKhoan', thongBao: 'Vui lòng tải ảnh chuyển khoản.' }]);
  }
  try {
    if (!await laAnhThat(tep.path)) {
      throw AppError.duLieuKhongHopLe('Chỉ nhận ảnh JPG, PNG, WEBP.', [
        { truong: 'anhChuyenKhoan', thongBao: 'Chỉ nhận ảnh JPG, PNG, WEBP.' }]);
    }
    const thoiDiemChuyen = chungTu.docThoiDiemChuyen(duLieu?.thoiDiemChuyen);
    const maBamAnh = await chungTu.bamTep(tep.path);
    const duongDanMoi = layDuongDanTep(tep);
    const ketQua = await thucHienGiaoDich(async (ketNoi) => {
      const thanhToan = await layThanhToanCuaKhach(maNguoiDung, maDatSan, ketNoi, true);
      if (!await kiemTraConHan(ketNoi, thanhToan)) return { hetHan: true };
      await chungTu.kiemTraThoiDiemChuyen(ketNoi, thoiDiemChuyen);
      const soAnhTruoc = await chungTu.demChungTu(ketNoi, thanhToan.maThanhToan);
      if (soAnhTruoc >= chungTu.TOI_DA_CHUNG_TU_MOI_DON) {
        throw AppError.biTrung(
          `Bạn đã gửi tối đa ${chungTu.TOI_DA_CHUNG_TU_MOI_DON} ảnh cho đơn này. Vui lòng liên hệ chủ sân.`,
          'PROOF_LIMIT');
      }
      const maChungTu = await chungTu.themChungTu(ketNoi, {
        maThanhToan: thanhToan.maThanhToan,
        soTien: thanhToan.soTien,
        thoiDiemChuyen,
        anh: duongDanMoi,
        maBamAnh,
      });
      const cungDot = dieuKienCungDot(thanhToan);
      const dangCho = thanhToan.trangThai === 'confirming';
      const { han: hanXacNhanMoi } = await chungTu.tinhHanXacNhan(ketNoi, cungDot); // G9.C3
      // Gửi lần đầu (pending → confirming): đặt HanXacNhan. Gửi THÊM khi đã confirming: giữ hạn cũ để không kéo dài
      // bằng cách gửi ảnh liên tục (chỉ đặt lại nếu dữ liệu cũ chưa có hạn).
      if (dangCho) {
        await ketNoi.query(
          `UPDATE ThanhToan SET AnhChuyenKhoan=?, NgayGuiAnh=NOW(),
             HanXacNhan=COALESCE(HanXacNhan, ?)
           WHERE MaThanhToan=?`,
          [duongDanMoi, hanXacNhanMoi, thanhToan.maThanhToan]);
      } else {
        await ketNoi.query(
          `UPDATE ThanhToan SET TrangThai='confirming', AnhChuyenKhoan=?, NgayGuiAnh=NOW(),
             HanXacNhan=?,
             LyDoLoi=NULL, MaNguoiXacNhan=NULL, VaiTroXacNhan=NULL
           WHERE MaThanhToan=?`,
          [duongDanMoi, hanXacNhanMoi, thanhToan.maThanhToan]);
        // Chu kỳ chờ duyệt mới (lần đầu hoặc gửi lại sau khi bị từ chối): nhắc mốc + báo quá hạn lại từ đầu (G9.C4).
        await giaiPhongKhoaNhac(ketNoi, `confirm_expiring:${thanhToan.maThanhToan}:`);
        await giaiPhongKhoaNhac(ketNoi, `confirm_overdue:${thanhToan.maThanhToan}:`);
      }
      // Đã gửi ảnh → giữ chỗ vô thời hạn (NULL): không bao giờ tự nhả slot chỉ vì chủ sân chậm (slot.js).
      await ketNoi.query(
        `UPDATE DatSan SET HetHanGiuCho=NULL WHERE ${cungDot.sql} AND TrangThai='pending_payment'`,
        cungDot.thamSo);
      // Báo chủ sân có ảnh chuyển khoản cần duyệt (không để lỗi thông báo làm hỏng việc gửi ảnh).
      try {
        const [[don]] = await ketNoi.query(
          `SELECT d.MaDon AS maDon, d.TenKhach AS tenKhach, s.TenSan AS tenSan,
             cs.TenCoSo AS tenCoSo, cs.MaChuSan AS maChuSan
           FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
           WHERE d.MaDatSan=?`, [thanhToan.maDatSan]);
        if (don) {
          await guiThongBao(ketNoi, {
            maNguoiDung: don.maChuSan,
            loai: 'new_booking_for_owner',
            tieuDe: dangCho ? 'Khách gửi thêm ảnh chuyển khoản' : 'Khách đã gửi ảnh chuyển khoản',
            noiDung: `${don.tenKhach} đã chuyển khoản ${dinhDangTien(thanhToan.soTien)} cho ${don.tenSan} - `
              + `${don.tenCoSo} (mã ${don.maDon}). Vui lòng kiểm tra và duyệt đơn.`,
            loaiThamChieu: 'booking',
            maThamChieu: thanhToan.maDatSan,
            khoa: `anh_chuyen_khoan:${maChungTu}`,
          });
        }
      } catch (loi) {
        console.error('[thong-bao] Không báo được cho chủ sân:', loi.message);
      }
      const [[han]] = await ketNoi.query(
        `SELECT HanXacNhan AS hanXacNhan, TIMESTAMPDIFF(SECOND, NOW(), HanXacNhan) AS conLaiXacNhanGiay
         FROM ThanhToan WHERE MaThanhToan=?`, [thanhToan.maThanhToan]);
      return {
        maThanhToan: thanhToan.maThanhToan,
        maChungTu,
        soAnhDaGui: soAnhTruoc + 1,
        hanXacNhan: han.hanXacNhan,
        conLaiXacNhanGiay: han.conLaiXacNhanGiay === null ? null : Number(han.conLaiXacNhanGiay),
      };
    });
    if (ketQua.hetHan) throw AppError.biTrung('Thời gian giữ chỗ đã hết hạn');
    return {
      maThanhToan: ketQua.maThanhToan,
      trangThaiThanhToan: 'confirming',
      anhChuyenKhoanUrl: duongDanMoi,
      maChungTu: ketQua.maChungTu,
      soAnhDaGui: ketQua.soAnhDaGui,
      hanXacNhan: ketQua.hanXacNhan,
      conLaiXacNhanGiay: ketQua.conLaiXacNhanGiay,
      thongBao: 'Đã gửi ảnh chuyển khoản. Vui lòng chờ chủ sân xác nhận.',
    };
  } catch (loi) {
    await fs.unlink(tep.path).catch(() => {}); // gửi thất bại (chưa có dòng chứng từ nào trỏ tới file) → không giữ file mồ côi
    throw loi;
  }
}

// Đơn (+ thanh toán) cần duyệt, khoá để đổi trạng thái. Chủ sân chỉ duyệt đơn thuộc cơ sở của mình;
// admin duyệt được mọi đơn.
async function layThanhToanDeDuyet(ketNoi, maNguoiDung, vaiTro, maDatSan) {
  const laAdmin = vaiTro === 'admin';
  const [[thanhToan]] = await ketNoi.query(
    `SELECT t.MaThanhToan AS maThanhToan, t.MaDatSan AS maDatSanThanhToan, t.TrangThai AS trangThai,
       t.AnhChuyenKhoan AS anhChuyenKhoan, t.SoTien AS soTien,
       d.MaDatSan AS maDatSan, d.MaLichCoDinh AS maLichCoDinh, d.MaNhomDat AS maNhomDat,
       d.TrangThai AS trangThaiDatSan,
       d.MaKhachHang AS maKhachHang, d.MaDon AS maDon, d.NgayChoi AS ngay,
       d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       s.TenSan AS tenSan, cs.TenCoSo AS tenCoSo
     FROM DatSan d JOIN San s ON s.MaSan=d.MaSan JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
       JOIN ThanhToan t ON t.MaDatSan=CASE
         WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan)
         ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh=d.MaLichCoDinh)
       END
     WHERE d.MaDatSan=? AND d.Nguon='app' ${laAdmin ? '' : 'AND cs.MaChuSan=?'}
     FOR UPDATE`,
    laAdmin ? [maDatSan] : [maDatSan, maNguoiDung]);
  if (!thanhToan) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
  if (thanhToan.trangThai !== 'confirming') {
    const thongBao = {
      success: 'Đơn đã được xác nhận trước đó',
      pending: 'Khách chưa gửi ảnh chuyển khoản',
    }[thanhToan.trangThai] || 'Đơn không còn ở trạng thái chờ xác nhận';
    throw AppError.biTrung(thongBao);
  }
  const cungDot = dieuKienCungDot({
    maLichCoDinh: thanhToan.maLichCoDinh, maNhomDat: thanhToan.maNhomDat, maDatSan: thanhToan.maDatSan });
  const [cacDon] = await ketNoi.query(
    `SELECT TrangThai AS trangThai FROM DatSan WHERE ${cungDot.sql} FOR UPDATE`, cungDot.thamSo);
  if (!cacDon.length || cacDon.some((don) => don.trangThai !== 'pending_payment')) {
    throw AppError.biTrung('Đơn đã hết hạn giữ chỗ hoặc đã bị huỷ');
  }
  return { ...thanhToan, cungDot };
}

// Mọi quyết định duyệt/từ chối của chủ sân HOẶC Admin đều ghi nhật ký (người + vai trò + lý do + thời điểm do DB đặt).
async function ghiNhatKyDuyet(ketNoi, vaiTro, maNguoiDung, hanhDong, maThanhToan, lyDo = null) {
  await nhatKy.ghiNhatKy(ketNoi, {
    maNguoiThucHien: maNguoiDung,
    hanhDong,
    doiTuong: 'ThanhToan',
    maDoiTuong: maThanhToan,
    chiTiet: `[${vaiTro}]${lyDo ? ` ${lyDo}` : ''}`,
  });
}

// Chủ sân/admin xác nhận đã nhận đủ tiền → đơn thành công, khách giữ được sân.
async function xacNhanThanhToan(maNguoiDung, maDatSan, vaiTro = 'owner') {
  return thucHienGiaoDich(async (ketNoi) => {
    const thanhToan = await layThanhToanDeDuyet(ketNoi, maNguoiDung, vaiTro, maDatSan);
    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThai='success', NgayThanhToan=NOW(), LyDoLoi=NULL,
         MaNguoiXacNhan=?, VaiTroXacNhan=?
       WHERE MaThanhToan=?`,
      [maNguoiDung, vaiTro, thanhToan.maThanhToan]);
    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='confirmed', HetHanGiuCho=NULL
       WHERE ${thanhToan.cungDot.sql} AND TrangThai='pending_payment'`,
      thanhToan.cungDot.thamSo);
    await chungTu.chotKetQuaChungTu(ketNoi, thanhToan.maThanhToan, 'accepted', { maNguoiDuyet: maNguoiDung, vaiTro });
    await ghiNhatKyDuyet(ketNoi, vaiTro, maNguoiDung, 'xac_nhan_thanh_toan', thanhToan.maThanhToan);
    // Đơn được duyệt → báo khách giữ sân thành công.
    await guiThongBao(ketNoi, {
      maNguoiDung: thanhToan.maKhachHang,
      loai: 'payment_success',
      tieuDe: 'Chủ sân đã xác nhận đơn của bạn',
      noiDung: `Chủ sân đã xác nhận đơn ${thanhToan.maDon} của bạn đã được thanh toán `
        + `(${dinhDangTien(thanhToan.soTien)}) cho ${thanhToan.tenSan} - ${thanhToan.tenCoSo}. `
        + 'Sân đã được giữ cho bạn.',
      loaiThamChieu: 'booking',
      maThamChieu: thanhToan.maDatSan,
      khoa: `payment_success:${thanhToan.maThanhToan}`,
    });
    return {
      maDatSan: Number(maDatSan),
      maThanhToan: thanhToan.maThanhToan,
      trangThaiThanhToan: 'success',
      trangThaiDatSan: 'confirmed',
      nguoiXacNhan: vaiTro,
    };
  });
}

// Không thấy tiền / ảnh sai → từ chối kèm lý do (bắt buộc); ThanhToan quay về `pending`, giữ chỗ lại hold_minutes để khách
// gửi lại ảnh. Các ảnh đã gửi KHÔNG bị xoá: chuyển `rejected` (kèm lý do, người từ chối) trong ChungTuThanhToan.
async function tuChoiThanhToan(maNguoiDung, maDatSan, lyDo, vaiTro = 'owner') {
  return thucHienGiaoDich(async (ketNoi) => {
    const thanhToan = await layThanhToanDeDuyet(ketNoi, maNguoiDung, vaiTro, maDatSan);
    await ketNoi.query(
      `UPDATE ThanhToan SET TrangThai='pending', LyDoLoi=?, AnhChuyenKhoan=NULL, NgayGuiAnh=NULL, HanXacNhan=NULL,
         MaNguoiXacNhan=NULL, VaiTroXacNhan=NULL
       WHERE MaThanhToan=?`,
      [lyDo, thanhToan.maThanhToan]);
    await chungTu.chotKetQuaChungTu(ketNoi, thanhToan.maThanhToan, 'rejected', { maNguoiDuyet: maNguoiDung, vaiTro, lyDo });
    const phut = await layCauHinhSo(ketNoi, 'hold_minutes', PHUT_GIU_CHO_MAC_DINH);
    await ketNoi.query(
      `UPDATE DatSan SET HetHanGiuCho=DATE_ADD(NOW(), INTERVAL ? MINUTE)
       WHERE ${thanhToan.cungDot.sql} AND TrangThai='pending_payment'`,
      [phut, ...thanhToan.cungDot.thamSo]);
    await ghiNhatKyDuyet(ketNoi, vaiTro, maNguoiDung, 'tu_choi_thanh_toan', thanhToan.maThanhToan, lyDo);
    await guiThongBao(ketNoi, {
      maNguoiDung: thanhToan.maKhachHang,
      loai: 'payment_failed',
      tieuDe: 'Thanh toán chưa được xác nhận',
      noiDung: `Chủ sân chưa xác nhận thanh toán đơn ${thanhToan.maDon}. Lý do: ${lyDo}. `
        + `Vui lòng gửi lại ảnh chuyển khoản trong ${phut} phút để giữ sân.`,
      loaiThamChieu: 'booking',
      maThamChieu: thanhToan.maDatSan,
    });
    return {
      maDatSan: Number(maDatSan),
      maThanhToan: thanhToan.maThanhToan,
      trangThaiThanhToan: 'pending',
      lyDo,
      giuChoPhut: phut,
    };
  });
}

module.exports = {
  layQr,
  guiAnhChuyenKhoan,
  xacNhanThanhToan,
  tuChoiThanhToan,
};
