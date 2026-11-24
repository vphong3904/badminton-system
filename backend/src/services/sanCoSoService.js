const { thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { guiThongBao } = require('./notificationService');
const { SLOT_BAN } = require('../utils/slot');
const { SAN_CHUA_XOA } = require('../utils/sanHienHanh');
const nhatKy = require('./nhatKyService');

// Đóng / mở / xoá SÂN và CƠ SỞ — dùng chung cho chủ sân và admin.
//   Đóng sân  : San.TrangThai = 'maintenance'       Đóng cơ sở : CoSo.TrangThai = 'closed'
//   Điều kiện đóng/xoá: không còn khách đặt hiện tại/sắp tới (đơn đang giữ chỗ hoặc đã xác nhận chưa chơi xong)
//                       và không còn lịch cố định (các ngày trong tuần) đang hiệu lực.
//   Muốn XOÁ phải ĐÓNG trước.
//   Xoá SÂN (G9.F3) là xoá MỀM (San.DaXoa=1, NgayXoa=NOW()): giữ dòng để lịch sử (đơn, báo cáo, khiếu nại) còn tên sân cũ,
//   nên KHÔNG còn chặn vì đã từng có đơn. Xoá CƠ SỞ vẫn là xoá cứng, chỉ được khi chưa từng có đơn/lịch nào (còn lịch sử thì để đóng).
// `nguoiThucHien`: { maNguoiDung, vaiTro }. Chủ sân chỉ thao tác trên của mình; admin thao tác mọi nơi.

const MA_LOI_CON_KHACH = 'HAS_ACTIVE_BOOKINGS';
const MA_LOI_CHUA_DONG = 'MUST_CLOSE_FIRST';
const MA_LOI_CO_LICH_SU = 'HAS_BOOKING_HISTORY';

const laAdmin = (nguoi) => nguoi.vaiTro === 'admin';

async function ghiNhatKy(ketNoi, nguoi, hanhDong, doiTuong, maDoiTuong, chiTiet) {
  await nhatKy.ghiNhatKy(ketNoi, { maNguoiThucHien: nguoi.maNguoiDung, hanhDong, doiTuong, maDoiTuong, chiTiet });
}

// Đếm khách còn đặt (đơn hiện tại/sắp tới) và lịch cố định còn hiệu lực trên một nhóm sân.
async function demKhachConLai(ketNoi, cacMaSan) {
  if (!cacMaSan.length) return { soDon: 0, soLichCoDinh: 0, cacSuKien: [] };
  const cho = cacMaSan.map(() => '?').join(',');
  const [[don]] = await ketNoi.query(
    `SELECT COUNT(*) AS so FROM DatSan
     WHERE MaSan IN (${cho})
       AND ${SLOT_BAN()} AND TIMESTAMP(NgayChoi, GioKetThuc) > NOW()`,
    cacMaSan);
  const [[lich]] = await ketNoi.query(
    `SELECT COUNT(*) AS so FROM LichCoDinh
     WHERE MaSan IN (${cho}) AND TrangThai='active'
       AND (NgayKetThuc IS NULL OR NgayKetThuc >= CURDATE())`,
    cacMaSan);
  // Sự kiện open/closed còn chưa đến giờ kết thúc vẫn giữ sân qua KhoaSan.MaSuKien.
  const [cacSuKien] = await ketNoi.query(
    `SELECT DISTINCT sk.MaSuKien AS maSuKien, sk.TieuDe AS tieuDe,
       sk.NgaySuKien AS ngay, sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc,
       sk.TrangThai AS trangThai
     FROM KhoaSan k JOIN SuKien sk ON sk.MaSuKien=k.MaSuKien
     WHERE k.MaSan IN (${cho}) AND sk.TrangThai IN ('open','closed')
       AND TIMESTAMP(sk.NgaySuKien, sk.GioKetThuc) > NOW()
     ORDER BY sk.NgaySuKien, sk.GioBatDau, sk.MaSuKien`,
    cacMaSan);
  const cacSuKienHopLe = cacSuKien.filter((sk) => sk.maSuKien !== undefined && sk.maSuKien !== null);
  return {
    soDon: Number(don.so), soLichCoDinh: Number(lich.so),
    ...(cacSuKienHopLe.length ? { cacSuKien: cacSuKienHopLe } : {}),
  };
}

function chanNeuConKhach({ soDon, soLichCoDinh, cacSuKien = [] }, doiTuong, hanhDong) {
  if (cacSuKien.length) {
    const tenSuKien = cacSuKien.slice(0, 3).map((sk) => `“${sk.tieuDe}” (${sk.ngay} ${String(sk.gioBatDau).slice(0, 5)}–${String(sk.gioKetThuc).slice(0, 5)})`);
    const conLai = cacSuKien.length > 3 ? ` và ${cacSuKien.length - 3} sự kiện khác` : '';
    throw new AppError(409,
      `Không thể ${hanhDong} ${doiTuong}: sân đang được giữ cho ${tenSuKien.join(', ')}${conLai}. Hãy chỉnh sửa hoặc hủy sự kiện trước.`,
      'HAS_ACTIVE_EVENTS', { cacSuKien });
  }
  if (!soDon && !soLichCoDinh) return;
  const phan = [];
  if (soDon) phan.push(`${soDon} đơn đặt hiện tại/sắp tới`);
  if (soLichCoDinh) phan.push(`${soLichCoDinh} lịch cố định theo tuần`);
  throw AppError.biTrung(
    `Không thể ${hanhDong} ${doiTuong}: còn ${phan.join(' và ')}. Hãy huỷ hoặc chờ các lịch này kết thúc rồi thử lại.`,
    MA_LOI_CON_KHACH);
}

async function demLichSu(ketNoi, cacMaSan) {
  if (!cacMaSan.length) return 0;
  const cho = cacMaSan.map(() => '?').join(',');
  const [[don]] = await ketNoi.query(`SELECT COUNT(*) AS so FROM DatSan WHERE MaSan IN (${cho})`, cacMaSan);
  const [[lich]] = await ketNoi.query(`SELECT COUNT(*) AS so FROM LichCoDinh WHERE MaSan IN (${cho})`, cacMaSan);
  return Number(don.so) + Number(lich.so);
}

// Khoá dòng sân (cùng khoá với lúc khách đặt) để không có đơn mới chen vào giữa lúc kiểm tra và đóng.
async function khoaSan(ketNoi, nguoi, maSan) {
  await ketNoi.query('SELECT MaSan FROM San WHERE MaSan=? FOR UPDATE', [maSan]);
  const [[san]] = await ketNoi.query(
    `SELECT s.MaSan AS maSan, s.MaCoSo AS maCoSo, s.TenSan AS tenSan, s.TrangThai AS trangThai,
       cs.MaChuSan AS maChuSan, cs.TrangThai AS trangThaiCoSo, cs.TenCoSo AS tenCoSo
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND ${SAN_CHUA_XOA('s')} ${laAdmin(nguoi) ? '' : 'AND cs.MaChuSan=?'}`,
    laAdmin(nguoi) ? [maSan] : [maSan, nguoi.maNguoiDung]);
  if (!san) throw AppError.khongTimThay('Không tìm thấy sân');
  return san;
}

async function khoaCoSo(ketNoi, nguoi, maCoSo) {
  const [[coSo]] = await ketNoi.query(
    `SELECT MaCoSo AS maCoSo, MaChuSan AS maChuSan, TenCoSo AS tenCoSo, TrangThai AS trangThai
     FROM CoSo WHERE MaCoSo=? ${laAdmin(nguoi) ? '' : 'AND MaChuSan=?'} FOR UPDATE`,
    laAdmin(nguoi) ? [maCoSo] : [maCoSo, nguoi.maNguoiDung]);
  if (!coSo) throw AppError.khongTimThay('Không tìm thấy cơ sở');
  const [cacSan] = await ketNoi.query(
    'SELECT MaSan AS maSan FROM San WHERE MaCoSo=? ORDER BY MaSan FOR UPDATE', [maCoSo]);
  return { coSo, cacMaSan: cacSan.map((san) => san.maSan) };
}

async function baoChuSan(ketNoi, nguoi, maChuSan, maCoSo, tieuDe, noiDung) {
  if (!laAdmin(nguoi)) return;
  await guiThongBao(ketNoi, {
    maNguoiDung: maChuSan, loai: 'system', tieuDe, noiDung,
    loaiThamChieu: 'venue', maThamChieu: Number(maCoSo),
    khoa: `dong_xoa:${maCoSo}:${Date.now()}`,
  });
}

// Cơ sở `hidden` tự hiện cho khách (`active`) khi đã có ≥1 sân hoạt động + có bảng giá + chủ sân đã được duyệt.
// Dùng chung cho: mở sân, mở lại cơ sở, thêm bảng giá, tạo sân (ownerService).
async function kichHoatCoSoNeuSanSang(ketNoi, maCoSo) {
  await ketNoi.query(
    `UPDATE CoSo cs SET cs.TrangThai='active'
     WHERE cs.MaCoSo=? AND cs.TrangThai='hidden'
       AND EXISTS (SELECT 1 FROM San WHERE MaCoSo=cs.MaCoSo AND TrangThai='active' AND ${SAN_CHUA_XOA()})
       AND EXISTS (SELECT 1 FROM BangGia WHERE MaCoSo=cs.MaCoSo)
       AND EXISTS (SELECT 1 FROM HoSoChuSan WHERE MaNguoiDung=cs.MaChuSan AND TrangThaiDuyet='approved')`,
    [maCoSo]);
}

// ----- SÂN -----
async function kiemTraDuocDongSan(ketNoi, maSan, doiTuong = 'sân', hanhDong = 'đóng') {
  chanNeuConKhach(await demKhachConLai(ketNoi, [maSan]), doiTuong, hanhDong);
}

async function dongSan(nguoi, maSan, lyDo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const san = await khoaSan(ketNoi, nguoi, maSan);
    if (san.trangThai === 'maintenance') return { maSan: san.maSan, trangThai: 'maintenance' };
    await kiemTraDuocDongSan(ketNoi, san.maSan, `sân "${san.tenSan}"`);
    await ketNoi.query("UPDATE San SET TrangThai='maintenance' WHERE MaSan=?", [san.maSan]);
    await ghiNhatKy(ketNoi, nguoi, 'dong_san', 'San', san.maSan, lyDo);
    await baoChuSan(ketNoi, nguoi, san.maChuSan, san.maCoSo, 'Sân đã bị đóng',
      `Quản trị viên đã đóng sân "${san.tenSan}" (${san.tenCoSo}).${lyDo ? ` Lý do: ${lyDo}` : ''}`);
    return { maSan: san.maSan, trangThai: 'maintenance' };
  });
}

async function moSan(nguoi, maSan) {
  return thucHienGiaoDich(async (ketNoi) => {
    const san = await khoaSan(ketNoi, nguoi, maSan);
    if (san.trangThaiCoSo === 'locked') {
      throw AppError.biTrung('Cơ sở đang bị quản trị khoá, không thể mở sân', 'VENUE_LOCKED');
    }
    // G9.A3: cơ sở chưa có bảng giá thì không có giá để đặt → không cho mở sân.
    const [coBangGia] = await ketNoi.query(
      "SELECT 1 FROM BangGia WHERE MaCoSo=? AND LoaiKhach='walk_in' LIMIT 1", [san.maCoSo]);
    if (coBangGia.length === 0) {
      throw AppError.biTrung(
        'Cơ sở chưa có bảng giá. Hãy thiết lập bảng giá trước khi mở sân.', 'NO_PRICE_TABLE');
    }
    await ketNoi.query("UPDATE San SET TrangThai='active' WHERE MaSan=?", [san.maSan]);
    // Sân mới tạo ở trạng thái chưa hoạt động: bật sân đầu tiên (đã có giá) thì cơ sở mới hiện cho khách.
    await kichHoatCoSoNeuSanSang(ketNoi, san.maCoSo);
    await ghiNhatKy(ketNoi, nguoi, 'mo_san', 'San', san.maSan);
    return { maSan: san.maSan, trangThai: 'active' };
  });
}

async function xoaSan(nguoi, maSan, lyDo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const san = await khoaSan(ketNoi, nguoi, maSan);
    if (san.trangThai !== 'maintenance') {
      throw AppError.biTrung('Phải đóng sân trước khi xoá', MA_LOI_CHUA_DONG);
    }
    await kiemTraDuocDongSan(ketNoi, san.maSan, `sân "${san.tenSan}"`, 'xoá');
    // Xoá mềm: giữ dòng San (đơn/báo cáo/khiếu nại cũ vẫn join ra tên sân). TenDangDung tự thành NULL → sân khác được dùng lại tên.
    await ketNoi.query('UPDATE San SET DaXoa=1, NgayXoa=NOW() WHERE MaSan=? AND DaXoa=0', [san.maSan]);
    await ghiNhatKy(ketNoi, nguoi, 'xoa_san', 'San', san.maSan, `${san.tenSan} - ${san.tenCoSo}${lyDo ? `: ${lyDo}` : ''}`);
    await baoChuSan(ketNoi, nguoi, san.maChuSan, san.maCoSo, 'Sân đã bị xoá',
      `Quản trị viên đã xoá sân "${san.tenSan}" (${san.tenCoSo}).${lyDo ? ` Lý do: ${lyDo}` : ''}`);
    return { maSan: san.maSan, daXoa: true };
  });
}

// ----- CƠ SỞ -----
async function dongCoSo(nguoi, maCoSo, lyDo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const { coSo, cacMaSan } = await khoaCoSo(ketNoi, nguoi, maCoSo);
    if (coSo.trangThai === 'closed') return { maCoSo: coSo.maCoSo, trangThai: 'closed' };
    if (coSo.trangThai === 'locked') {
      throw AppError.biTrung('Cơ sở đang bị quản trị khoá, không thể tự đóng', 'VENUE_LOCKED');
    }
    chanNeuConKhach(await demKhachConLai(ketNoi, cacMaSan), `cơ sở "${coSo.tenCoSo}"`, 'đóng');
    await ketNoi.query("UPDATE CoSo SET TrangThai='closed' WHERE MaCoSo=?", [coSo.maCoSo]);
    await ghiNhatKy(ketNoi, nguoi, 'dong_co_so', 'CoSo', coSo.maCoSo, lyDo);
    await baoChuSan(ketNoi, nguoi, coSo.maChuSan, coSo.maCoSo, 'Cơ sở đã bị đóng',
      `Quản trị viên đã đóng cơ sở "${coSo.tenCoSo}".${lyDo ? ` Lý do: ${lyDo}` : ''}`);
    return { maCoSo: coSo.maCoSo, trangThai: 'closed' };
  });
}

// Mở lại: về `hidden`, rồi tự hiện cho khách (`active`) nếu đủ ≥1 sân hoạt động + bảng giá + chủ sân đã duyệt.
async function moCoSo(nguoi, maCoSo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const { coSo } = await khoaCoSo(ketNoi, nguoi, maCoSo);
    if (coSo.trangThai !== 'closed') {
      throw AppError.biTrung('Chỉ mở lại được cơ sở đang đóng', 'VENUE_NOT_CLOSED');
    }
    await ketNoi.query("UPDATE CoSo SET TrangThai='hidden' WHERE MaCoSo=?", [coSo.maCoSo]);
    await kichHoatCoSoNeuSanSang(ketNoi, coSo.maCoSo);
    const [[moi]] = await ketNoi.query('SELECT TrangThai AS trangThai FROM CoSo WHERE MaCoSo=?', [coSo.maCoSo]);
    await ghiNhatKy(ketNoi, nguoi, 'mo_co_so', 'CoSo', coSo.maCoSo);
    return { maCoSo: coSo.maCoSo, trangThai: moi.trangThai };
  });
}

async function xoaCoSo(nguoi, maCoSo, lyDo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const { coSo, cacMaSan } = await khoaCoSo(ketNoi, nguoi, maCoSo);
    if (coSo.trangThai !== 'closed') {
      throw AppError.biTrung('Phải đóng cơ sở trước khi xoá', MA_LOI_CHUA_DONG);
    }
    chanNeuConKhach(await demKhachConLai(ketNoi, cacMaSan), `cơ sở "${coSo.tenCoSo}"`, 'xoá');
    if (await demLichSu(ketNoi, cacMaSan)) {
      throw AppError.biTrung(
        'Cơ sở đã từng có đơn đặt nên không thể xoá vì cần giữ lịch sử. Hãy để cơ sở ở trạng thái đóng.',
        MA_LOI_CO_LICH_SU);
    }
    await ketNoi.query('DELETE FROM CoSo WHERE MaCoSo=?', [coSo.maCoSo]);
    await ghiNhatKy(ketNoi, nguoi, 'xoa_co_so', 'CoSo', coSo.maCoSo, `${coSo.tenCoSo}${lyDo ? `: ${lyDo}` : ''}`);
    await baoChuSan(ketNoi, nguoi, coSo.maChuSan, coSo.maCoSo, 'Cơ sở đã bị xoá',
      `Quản trị viên đã xoá cơ sở "${coSo.tenCoSo}".${lyDo ? ` Lý do: ${lyDo}` : ''}`);
    return { maCoSo: coSo.maCoSo, daXoa: true };
  });
}

module.exports = {
  dongSan, moSan, xoaSan, dongCoSo, moCoSo, xoaCoSo, kichHoatCoSoNeuSanSang,
  demKhachConLai, chanNeuConKhach, kiemTraDuocDongSan,
  MA_LOI_CON_KHACH, MA_LOI_CHUA_DONG, MA_LOI_CO_LICH_SU,
};
