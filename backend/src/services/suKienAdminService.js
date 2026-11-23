// G7.9: Admin khóa cơ sở / tài khoản chủ sân → hủy các sự kiện chưa bắt đầu.
// Hủy trong cùng giao dịch với thao tác khóa để không còn sự kiện giữ sân trên cơ sở bị khóa.
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const nhatKy = require('./nhatKyService');
const { ngatKetNoiNguoiDung } = require('../realtime/phat');
const { guiThongBao, guiChoQuanTri, baoSuKienBiAn } = require('./notificationService');

async function huySuKienSapToi(ketNoi, { maQuanTri, maCoSo = null, maChuSan = null, lyDo }) {
  if (!maCoSo && !maChuSan) return { soSuKienBiHuy: 0, soDangKyBiHuy: 0, soCanHoanPhi: 0 };

  const dieuKien = ["sk.TrangThai IN ('open','closed')", 'TIMESTAMP(sk.NgaySuKien, sk.GioBatDau) > NOW()'];
  const thamSo = [];
  if (maCoSo) { dieuKien.push('sk.MaCoSo = ?'); thamSo.push(maCoSo); }
  if (maChuSan) { dieuKien.push('sk.MaChuSan = ?'); thamSo.push(maChuSan); }

  const [cacSuKien] = await ketNoi.query(
    `SELECT sk.MaSuKien AS maSuKien, sk.TieuDe AS tieuDe, sk.MaCoSo AS maCoSo, sk.TrangThai AS trangThai
     FROM SuKien sk WHERE ${dieuKien.join(' AND ')}
     ORDER BY sk.MaSuKien FOR UPDATE`, thamSo);

  let soDangKyBiHuy = 0;
  let soCanHoanPhi = 0;
  const lyDoHuy = String(lyDo || 'Sự kiện bị hủy do cơ sở hoặc tài khoản chủ sân bị quản trị viên khóa.').trim().slice(0, 255);

  for (const sk of cacSuKien) {
    const [cacDangKy] = await ketNoi.query(
      `SELECT MaDangKy AS maDangKy, MaKhachHang AS maKhachHang
       FROM DangKySuKien
       WHERE MaSuKien = ? AND TrangThai IN ('pending','accepted')
       ORDER BY MaDangKy FOR UPDATE`, [sk.maSuKien]);
    // Khóa riêng các dòng thanh toán (không dùng LEFT JOIN ... FOR UPDATE).
    const thanhToanTheoDangKy = new Map();
    if (cacDangKy.length) {
      const cacMaDangKy = cacDangKy.map((dk) => dk.maDangKy);
      const [cacThanhToan] = await ketNoi.query(
        `SELECT MaDangKy AS maDangKy, TrangThai AS trangThaiThanhToan,
           TrangThaiHoan AS trangThaiHoan
         FROM ThanhToanSuKien WHERE MaDangKy IN (?) FOR UPDATE`, [cacMaDangKy]);
      for (const tt of cacThanhToan) thanhToanTheoDangKy.set(tt.maDangKy, tt);
    }
    for (const dk of cacDangKy) {
      const tt = thanhToanTheoDangKy.get(dk.maDangKy);
      dk.trangThaiThanhToan = tt?.trangThaiThanhToan ?? null;
      dk.trangThaiHoan = tt?.trangThaiHoan ?? null;
    }

    await ketNoi.query(
      `UPDATE SuKien SET TrangThai='cancelled', NguoiHuy='system', LyDoHuy=?, NgayHuy=NOW()
       WHERE MaSuKien=? AND TrangThai IN ('open','closed')`, [lyDoHuy, sk.maSuKien]);
    // Giải phóng tất cả sân do sự kiện giữ.
    await ketNoi.query('DELETE FROM KhoaSan WHERE MaSuKien=?', [sk.maSuKien]);

    // Chưa xác nhận đã thu → hủy khoản chờ. Đã thu → chủ sân tự hoàn, không qua nền tảng.
    if (cacDangKy.length) {
      const cacMaDangKy = cacDangKy.map((dk) => dk.maDangKy);
      await ketNoi.query(
        `UPDATE ThanhToanSuKien
         SET TrangThaiHoan = CASE
               WHEN TrangThai='success' AND TrangThaiHoan='none' THEN 'pending'
               ELSE TrangThaiHoan END,
             TrangThai = CASE
               WHEN TrangThai IN ('pending','confirming') THEN 'cancelled'
               ELSE TrangThai END
         WHERE MaDangKy IN (?)`, [cacMaDangKy]);
    }
    soCanHoanPhi += cacDangKy.filter((dk) =>
      dk.trangThaiThanhToan === 'success' && dk.trangThaiHoan !== 'refunded').length;

    await ketNoi.query(
      `UPDATE DangKySuKien SET TrangThai='cancelled', NguoiHuy='system', LyDo=?, NgayHuy=NOW()
       WHERE MaSuKien=? AND TrangThai IN ('pending','accepted')`, [lyDoHuy, sk.maSuKien]);

    // Một khách có thể đăng ký nhiều hạng mục; chỉ gửi một thông báo cho mỗi khách/sự kiện.
    const thongBaoTheoKhach = new Map();
    for (const dk of cacDangKy) {
      const hienTai = thongBaoTheoKhach.get(dk.maKhachHang) || { canHoanPhi: false };
      if (dk.trangThaiThanhToan === 'success' && dk.trangThaiHoan !== 'refunded') hienTai.canHoanPhi = true;
      thongBaoTheoKhach.set(dk.maKhachHang, hienTai);
    }
    for (const [maKhachHang, thongTin] of thongBaoTheoKhach) {
      const noiDung = (`Sự kiện “${sk.tieuDe}” đã bị hủy do cơ sở hoặc tài khoản chủ sân bị quản trị viên khóa. Lý do: ${lyDoHuy.slice(0, 180)}`
        + (thongTin.canHoanPhi
          ? ' Khoản phí đã xác nhận cần chủ sân tự chuyển khoản hoàn; nền tảng không giữ tiền.'
          : '')).slice(0, 500);
      await guiThongBao(ketNoi, {
        maNguoiDung: maKhachHang,
        loai: 'event_cancelled',
        tieuDe: 'Sự kiện đã bị hủy',
        noiDung,
        loaiThamChieu: 'event',
        maThamChieu: Number(sk.maSuKien),
        khoa: `event_cancelled:system:${sk.maSuKien}:${maKhachHang}`,
      });
    }

    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri,
      hanhDong: 'huy_su_kien',
      doiTuong: 'SuKien',
      maDoiTuong: sk.maSuKien,
      chiTiet: `Hệ thống hủy do khóa cơ sở/tài khoản. ${lyDoHuy}`,
      truoc: { trangThai: sk.trangThai },
      sau: { trangThai: 'cancelled', nguoiHuy: 'system', soDangKyBiHuy: cacDangKy.length },
    });
    soDangKyBiHuy += cacDangKy.length;
  }

  return {
    soSuKienBiHuy: cacSuKien.length,
    soDangKyBiHuy,
    soCanHoanPhi,
    cacMaSuKien: cacSuKien.map((sk) => Number(sk.maSuKien)),
  };
}



// G7.12: khách báo cáo sự kiện (mỗi khách/sự kiện một lần theo UNIQUE BaoCaoViPham).
async function taoBaoCaoSuKien(maNguoiBaoCao, { maSuKien, lyDo, noiDung }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[sk]] = await ketNoi.query(
      `SELECT MaSuKien AS maSuKien, TieuDe AS tieuDe, MaChuSan AS maChuSan
       FROM SuKien WHERE MaSuKien=? FOR UPDATE`, [maSuKien]);
    if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');

    const [[daBaoCao]] = await ketNoi.query(
      `SELECT MaBaoCao AS maBaoCao FROM BaoCaoViPham
       WHERE MaNguoiBaoCao=? AND LoaiDoiTuong='event' AND MaDoiTuong=?`, [maNguoiBaoCao, maSuKien]);
    if (daBaoCao) throw AppError.biTrung('Bạn đã báo cáo sự kiện này rồi.', 'REPORT_ALREADY_EXISTS');

    const [ketQua] = await ketNoi.query(
      `INSERT INTO BaoCaoViPham (MaNguoiBaoCao, LoaiDoiTuong, MaDoiTuong, LyDo, NoiDung)
       VALUES (?, 'event', ?, ?, ?)`, [maNguoiBaoCao, maSuKien, lyDo, noiDung || null]);
    const maBaoCao = Number(ketQua.insertId);
    await guiChoQuanTri(ketNoi, {
      loai: 'complaint_received',
      tieuDe: 'Báo cáo vi phạm sự kiện mới',
      noiDung: `Có báo cáo mới về sự kiện “${sk.tieuDe}” (#${maSuKien}). Vui lòng kiểm tra trong mục Cộng đồng.`,
      loaiThamChieu: 'event', maThamChieu: Number(maSuKien),
      khoa: `event_report_received:${maBaoCao}`,
    });
    return { maBaoCao, maSuKien: Number(maSuKien), trangThai: 'pending' };
  });
}

// Admin xem hàng đợi báo cáo sự kiện.
async function lietKeBaoCaoSuKien({ trangThai = 'pending', trang = 1, soLuong = 20 } = {}) {
  const lech = (Number(trang) - 1) * Number(soLuong);
  const dieuKien = trangThai === 'all' ? '' : 'AND bp.TrangThai=?';
  const thamSo = trangThai === 'all' ? [] : [trangThai];
  const [cacBaoCao] = await pool.query(
    `SELECT bp.MaBaoCao AS maBaoCao, bp.MaNguoiBaoCao AS maNguoiBaoCao,
       nguoiBao.HoTen AS tenNguoiBaoCao, nguoiBao.Email AS emailNguoiBaoCao,
       bp.LoaiDoiTuong AS loaiDoiTuong, bp.MaDoiTuong AS maDoiTuong,
       bp.LyDo AS lyDo, bp.NoiDung AS noiDung, bp.TrangThai AS trangThai,
       bp.HanhDong AS hanhDong, bp.CongViPham AS congViPham,
       bp.GhiChuQuanTri AS ghiChuQuanTri, bp.MaQuanTriXuLy AS maQuanTriXuLy,
       quanTri.HoTen AS tenQuanTriXuLy, bp.NgayXuLy AS ngayXuLy, bp.NgayTao AS ngayTao,
       sk.TieuDe AS tieuDeSuKien, sk.Loai AS loaiSuKien, sk.NgaySuKien AS ngaySuKien,
       sk.GioBatDau AS gioBatDau, sk.GioKetThuc AS gioKetThuc,
       sk.TrangThai AS trangThaiSuKien, sk.BiAn AS biAn, sk.LyDoAn AS lyDoAn,
       sk.MaChuSan AS maChuSan, chuSan.HoTen AS tenChuSan,
       sk.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo
     FROM BaoCaoViPham bp
       JOIN NguoiDung nguoiBao ON nguoiBao.MaNguoiDung=bp.MaNguoiBaoCao
       LEFT JOIN NguoiDung quanTri ON quanTri.MaNguoiDung=bp.MaQuanTriXuLy
       JOIN SuKien sk ON sk.MaSuKien=bp.MaDoiTuong AND bp.LoaiDoiTuong='event'
       JOIN NguoiDung chuSan ON chuSan.MaNguoiDung=sk.MaChuSan
       JOIN CoSo cs ON cs.MaCoSo=sk.MaCoSo
     WHERE 1=1 ${dieuKien}
     ORDER BY FIELD(bp.TrangThai,'pending','upheld','dismissed'), bp.NgayTao ASC, bp.MaBaoCao ASC
     LIMIT ? OFFSET ?`, [...thamSo, Number(soLuong), lech]);
  const [[dem]] = await pool.query(
    `SELECT COUNT(*) AS tong FROM BaoCaoViPham bp
     WHERE bp.LoaiDoiTuong='event' ${trangThai === 'all' ? '' : 'AND bp.TrangThai=?'}`,
    thamSo);
  return {
    cacBaoCao: cacBaoCao.map((bc) => ({ ...bc, congViPham: !!Number(bc.congViPham), biAn: !!Number(bc.biAn) })),
    tong: Number(dem.tong), trang: Number(trang), soLuong: Number(soLuong),
  };
}

async function anSuKienTrongGiaoDich(ketNoi, maQuanTri, maSuKien, lyDo, { boQuaDaAn = false } = {}) {
  const [[sk]] = await ketNoi.query(
    `SELECT MaSuKien AS maSuKien, TieuDe AS tieuDe, MaChuSan AS maChuSan,
       TrangThai AS trangThai, BiAn AS biAn, LyDoAn AS lyDoAn
     FROM SuKien WHERE MaSuKien=? FOR UPDATE`, [maSuKien]);
  if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');
  if (Number(sk.biAn)) {
    if (boQuaDaAn) return { maSuKien: Number(maSuKien), biAn: true, daThayDoi: false };
    throw AppError.biTrung('Sự kiện đã được ẩn.', 'EVENT_ALREADY_HIDDEN');
  }
  const lyDoAn = String(lyDo || '').trim().slice(0, 255);
  await ketNoi.query(
    `UPDATE SuKien SET BiAn=1, LyDoAn=?, MaQuanTriAn=?, NgayAn=NOW() WHERE MaSuKien=?`,
    [lyDoAn, maQuanTri, maSuKien]);
  await baoSuKienBiAn(ketNoi, { maSuKien, lyDo: lyDoAn });
  await guiThongBao(ketNoi, {
    maNguoiDung: sk.maChuSan, loai: 'system', tieuDe: 'Sự kiện của bạn đã bị ẩn',
    noiDung: `Sự kiện “${sk.tieuDe}” đã bị quản trị viên ẩn. Lý do: ${lyDoAn}`.slice(0, 500),
    loaiThamChieu: 'event', maThamChieu: Number(maSuKien),
    khoa: `event_hidden_owner:${maSuKien}:${Date.now()}`,
  });
  await nhatKy.ghiNhatKy(ketNoi, {
    maNguoiThucHien: maQuanTri, hanhDong: 'an_su_kien', doiTuong: 'SuKien', maDoiTuong: maSuKien,
    chiTiet: lyDoAn, truoc: { biAn: false, trangThai: sk.trangThai },
    sau: { biAn: true, lyDoAn, maQuanTriAn: Number(maQuanTri) },
  });
  return { maSuKien: Number(maSuKien), biAn: true, lyDoAn, daThayDoi: true };
}

async function anSuKien(maQuanTri, maSuKien, { lyDo }) {
  return thucHienGiaoDich((ketNoi) => anSuKienTrongGiaoDich(ketNoi, maQuanTri, maSuKien, lyDo));
}

async function boAnSuKien(maQuanTri, maSuKien) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[sk]] = await ketNoi.query(
      `SELECT TieuDe AS tieuDe, MaChuSan AS maChuSan, TrangThai AS trangThai, BiAn AS biAn,
         LyDoAn AS lyDoAn, MaQuanTriAn AS maQuanTriAn
       FROM SuKien WHERE MaSuKien=? FOR UPDATE`, [maSuKien]);
    if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');
    if (!Number(sk.biAn)) throw AppError.biTrung('Sự kiện hiện không bị ẩn.', 'EVENT_NOT_HIDDEN');
    await ketNoi.query(
      'UPDATE SuKien SET BiAn=0, LyDoAn=NULL, MaQuanTriAn=NULL, NgayAn=NULL WHERE MaSuKien=?', [maSuKien]);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri, hanhDong: 'bo_an_su_kien', doiTuong: 'SuKien', maDoiTuong: maSuKien,
      chiTiet: sk.lyDoAn, truoc: { biAn: true, lyDoAn: sk.lyDoAn, trangThai: sk.trangThai },
      sau: { biAn: false, trangThai: sk.trangThai },
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: sk.maChuSan, loai: 'system', tieuDe: 'Sự kiện của bạn đã được bỏ ẩn',
      noiDung: `Sự kiện “${sk.tieuDe}” đã được quản trị viên bỏ ẩn. Trạng thái sự kiện được giữ nguyên (${sk.trangThai}).`,
      loaiThamChieu: 'event', maThamChieu: Number(maSuKien), khoa: `event_unhidden_owner:${maSuKien}:${Date.now()}`,
    });
    return { maSuKien: Number(maSuKien), biAn: false, trangThai: sk.trangThai };
  });
}

// Admin hủy một sự kiện bất kể đã bắt đầu hay chưa; phí đã thu vẫn do chủ sân tự hoàn.
async function huySuKienTheoMa(ketNoi, maQuanTri, maSuKien, lyDo) {
  const [[sk]] = await ketNoi.query(
    `SELECT MaSuKien AS maSuKien, TieuDe AS tieuDe, MaChuSan AS maChuSan,
       TrangThai AS trangThai, BiAn AS biAn
     FROM SuKien WHERE MaSuKien=? FOR UPDATE`, [maSuKien]);
  if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện');
  if (sk.trangThai === 'cancelled') {
    return { maSuKien: Number(maSuKien), trangThai: 'cancelled', daThayDoi: false, soDangKyBiHuy: 0, soCanHoanPhi: 0 };
  }
  const lyDoHuy = String(lyDo || '').trim().slice(0, 255);
  const [cacDangKy] = await ketNoi.query(
    `SELECT MaDangKy AS maDangKy, MaKhachHang AS maKhachHang
     FROM DangKySuKien WHERE MaSuKien=? AND TrangThai IN ('pending','accepted')
     ORDER BY MaDangKy FOR UPDATE`, [maSuKien]);
  const theoThanhToan = new Map();
  if (cacDangKy.length) {
    const ids = cacDangKy.map((dk) => dk.maDangKy);
    const [cacThanhToan] = await ketNoi.query(
      `SELECT MaDangKy AS maDangKy, TrangThai AS trangThaiThanhToan, TrangThaiHoan AS trangThaiHoan
       FROM ThanhToanSuKien WHERE MaDangKy IN (?) FOR UPDATE`, [ids]);
    for (const tt of cacThanhToan) theoThanhToan.set(tt.maDangKy, tt);
  }
  for (const dk of cacDangKy) Object.assign(dk, theoThanhToan.get(dk.maDangKy) || {});

  await ketNoi.query(
    `UPDATE SuKien SET TrangThai='cancelled', NguoiHuy='system', LyDoHuy=?, NgayHuy=NOW()
     WHERE MaSuKien=?`, [lyDoHuy, maSuKien]);
  await ketNoi.query('DELETE FROM KhoaSan WHERE MaSuKien=?', [maSuKien]);
  if (cacDangKy.length) {
    const ids = cacDangKy.map((dk) => dk.maDangKy);
    await ketNoi.query(
      `UPDATE ThanhToanSuKien SET
         TrangThaiHoan=CASE WHEN TrangThai='success' AND TrangThaiHoan='none' THEN 'pending' ELSE TrangThaiHoan END,
         TrangThai=CASE WHEN TrangThai IN ('pending','confirming') THEN 'cancelled' ELSE TrangThai END
       WHERE MaDangKy IN (?)`, [ids]);
  }
  await ketNoi.query(
    `UPDATE DangKySuKien SET TrangThai='cancelled', NguoiHuy='system', LyDo=?, NgayHuy=NOW()
     WHERE MaSuKien=? AND TrangThai IN ('pending','accepted')`, [lyDoHuy, maSuKien]);

  const thongBaoTheoKhach = new Map();
  let soCanHoanPhi = 0;
  for (const dk of cacDangKy) {
    const tt = dk.trangThaiThanhToan;
    const canHoan = tt === 'success' && dk.trangThaiHoan !== 'refunded';
    if (canHoan) soCanHoanPhi += 1;
    const hienTai = thongBaoTheoKhach.get(dk.maKhachHang) || { canHoanPhi: false };
    hienTai.canHoanPhi = hienTai.canHoanPhi || canHoan;
    thongBaoTheoKhach.set(dk.maKhachHang, hienTai);
  }
  for (const [maKhachHang, thongTin] of thongBaoTheoKhach) {
    await guiThongBao(ketNoi, {
      maNguoiDung: maKhachHang, loai: 'event_cancelled', tieuDe: 'Sự kiện đã bị hủy',
      noiDung: (`Sự kiện “${sk.tieuDe}” đã bị quản trị viên hủy. Lý do: ${lyDoHuy}`
        + (thongTin.canHoanPhi ? ' Khoản phí đã thu cần chủ sân tự chuyển khoản hoàn; nền tảng không giữ tiền.' : '')).slice(0, 500),
      loaiThamChieu: 'event', maThamChieu: Number(maSuKien),
      khoa: `event_cancelled:admin:${maSuKien}:${maKhachHang}`,
    });
  }
  await guiThongBao(ketNoi, {
    maNguoiDung: sk.maChuSan, loai: 'event_cancelled', tieuDe: 'Sự kiện của bạn đã bị hủy',
    noiDung: `Sự kiện “${sk.tieuDe}” đã bị quản trị viên hủy. Lý do: ${lyDoHuy}`.slice(0, 500),
    loaiThamChieu: 'event', maThamChieu: Number(maSuKien), khoa: `event_cancelled_owner:admin:${maSuKien}`,
  });
  await nhatKy.ghiNhatKy(ketNoi, {
    maNguoiThucHien: maQuanTri, hanhDong: 'huy_su_kien', doiTuong: 'SuKien', maDoiTuong: maSuKien,
    chiTiet: lyDoHuy, truoc: { trangThai: sk.trangThai },
    sau: { trangThai: 'cancelled', nguoiHuy: 'system', soDangKyBiHuy: cacDangKy.length, soCanHoanPhi },
  });
  return { maSuKien: Number(maSuKien), trangThai: 'cancelled', soDangKyBiHuy: cacDangKy.length, soCanHoanPhi };
}

async function congViPhamTuBaoCao(ketNoi, maQuanTri, maBaoCao, maSuKien, maChuSan) {
  const [[hoSo]] = await ketNoi.query('SELECT MaNguoiDung FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE', [maChuSan]);
  if (!hoSo) throw AppError.khongTimThay('Không tìm thấy hồ sơ chủ sân để ghi nhận vi phạm');
  const [themGay] = await ketNoi.query(
    `INSERT INTO Gay (MaChuSan, MaBaoCao, TrangThai) VALUES (?, ?, 'active')`, [maChuSan, maBaoCao]);
  const [[dem]] = await ketNoi.query(
    `SELECT COUNT(*) AS so FROM Gay WHERE MaChuSan=? AND TrangThai IN ('active','appealed')
       AND (HetHieuLuc IS NULL OR HetHieuLuc>NOW())`, [maChuSan]);
  const soLanViPham = Number(dem.so);
  await ketNoi.query('UPDATE HoSoChuSan SET SoLanViPham=? WHERE MaNguoiDung=?', [soLanViPham, maChuSan]);
  const mucXuLy = soLanViPham >= 3 ? 'banned' : soLanViPham === 2 ? 'severe_warning' : 'warning';
  const noiDung = `Báo cáo vi phạm sự kiện #${maSuKien} đã được xác nhận. Đây là lần vi phạm thứ ${soLanViPham}/3.`;
  if (mucXuLy === 'banned') {
    await ketNoi.query(
      `UPDATE NguoiDung SET TrangThai='locked', LyDoKhoa=? WHERE MaNguoiDung=?`,
      [`Bị khóa do ${soLanViPham} lần vi phạm được xác nhận`, maChuSan]);
    // Đang trong giao dịch của người gọi → ngắt trễ để lệnh khóa kịp commit (G8.0).
    ngatKetNoiNguoiDung(maChuSan, { troMs: 1000 });
    await ketNoi.query("UPDATE CoSo SET TrangThai='hidden' WHERE MaChuSan=? AND TrangThai='active'", [maChuSan]);
    await guiThongBao(ketNoi, {
      maNguoiDung: maChuSan, loai: 'owner_banned', tieuDe: 'Tài khoản chủ sân đã bị khóa',
      noiDung: `${noiDung} Tài khoản và các cơ sở đang hoạt động đã bị khóa/ẩn.`,
      loaiThamChieu: 'event', maThamChieu: Number(maSuKien), khoa: `event_report_banned:${maBaoCao}`,
    });
    await suKienAdminHuySuKienSapToi(ketNoi, maQuanTri, maChuSan,
      `Tài khoản chủ sân bị khóa do đủ ${soLanViPham} lần vi phạm được xác nhận.`);
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri, hanhDong: 'khoa_tai_khoan', doiTuong: 'NguoiDung', maDoiTuong: maChuSan,
      chiTiet: `Đủ ${soLanViPham} lần vi phạm được xác nhận từ khiếu nại và báo cáo sự kiện.`,
    });
  } else {
    await guiThongBao(ketNoi, {
      maNguoiDung: maChuSan, loai: 'owner_warning',
      tieuDe: mucXuLy === 'severe_warning' ? 'Cảnh cáo nghiêm trọng - sắp bị khóa tài khoản' : 'Cảnh cáo vi phạm sự kiện',
      noiDung: `${noiDung}${mucXuLy === 'severe_warning' ? ' Chỉ cần thêm 1 lần vi phạm nữa, tài khoản sẽ bị khóa.' : ''}`,
      loaiThamChieu: 'event', maThamChieu: Number(maSuKien), khoa: `event_report_warning:${maBaoCao}`,
    });
  }
  return { maGay: Number(themGay.insertId), soLanViPham, mucXuLy, daKhoaChuSan: mucXuLy === 'banned' };
}

// Dùng lại hook G7.9 để khóa chủ sân do đạt ngưỡng vi phạm cũng giải phóng các sự kiện sắp tới.
async function suKienAdminHuySuKienSapToi(ketNoi, maQuanTri, maChuSan, lyDo) {
  return huySuKienSapToi(ketNoi, { maQuanTri, maChuSan, lyDo });
}

async function xuLyBaoCaoSuKien(maQuanTri, maBaoCao, { quyetDinh, hanhDong = 'none', congViPham = false, ghiChu }) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[bc]] = await ketNoi.query(
      `SELECT MaBaoCao AS maBaoCao, MaNguoiBaoCao AS maNguoiBaoCao,
         MaDoiTuong AS maSuKien, TrangThai AS trangThai, LyDo AS lyDo,
         HanhDong AS hanhDong, CongViPham AS congViPham
       FROM BaoCaoViPham WHERE MaBaoCao=? AND LoaiDoiTuong='event' FOR UPDATE`, [maBaoCao]);
    if (!bc) throw AppError.khongTimThay('Không tìm thấy báo cáo vi phạm');
    if (bc.trangThai !== 'pending') throw AppError.biTrung('Báo cáo này đã được xử lý.', 'REPORT_ALREADY_PROCESSED');
    const [[sk]] = await ketNoi.query(
      `SELECT MaChuSan AS maChuSan, TrangThai AS trangThai, BiAn AS biAn
       FROM SuKien WHERE MaSuKien=? FOR UPDATE`, [bc.maSuKien]);
    if (!sk) throw AppError.khongTimThay('Không tìm thấy sự kiện được báo cáo');

    const hanhDongLuu = quyetDinh === 'upheld' ? hanhDong : 'none';
    const congViPhamLuu = quyetDinh === 'upheld' && congViPham;
    let ketQuaHanhDong = null;
    if (quyetDinh === 'upheld') {
      if (hanhDongLuu === 'hide') {
        ketQuaHanhDong = await anSuKienTrongGiaoDich(ketNoi, maQuanTri, bc.maSuKien, ghiChu, { boQuaDaAn: true });
      } else if (hanhDongLuu === 'cancel') {
        ketQuaHanhDong = await huySuKienTheoMa(ketNoi, maQuanTri, bc.maSuKien, ghiChu);
      }
    }

    await ketNoi.query(
      `UPDATE BaoCaoViPham SET TrangThai=?, HanhDong=?, CongViPham=?, GhiChuQuanTri=?, MaQuanTriXuLy=?, NgayXuLy=NOW()
       WHERE MaBaoCao=?`,
      [quyetDinh === 'upheld' ? 'upheld' : 'dismissed', hanhDongLuu, congViPhamLuu ? 1 : 0, ghiChu, maQuanTri, maBaoCao]);

    let mucViPham = null;
    if (congViPhamLuu) {
      mucViPham = await congViPhamTuBaoCao(ketNoi, maQuanTri, maBaoCao, bc.maSuKien, sk.maChuSan);
    }
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maQuanTri, hanhDong: 'xu_ly_bao_cao_su_kien', doiTuong: 'BaoCaoViPham', maDoiTuong: maBaoCao,
      chiTiet: ghiChu,
      truoc: { trangThai: 'pending' },
      sau: { trangThai: quyetDinh === 'upheld' ? 'upheld' : 'dismissed', hanhDong: hanhDongLuu,
        congViPham: !!congViPhamLuu, mucViPham, ketQuaHanhDong },
    });
    await guiThongBao(ketNoi, {
      maNguoiDung: bc.maNguoiBaoCao, loai: 'system', tieuDe: 'Báo cáo sự kiện đã được xử lý',
      noiDung: quyetDinh === 'upheld'
        ? `Báo cáo sự kiện #${bc.maSuKien} của bạn đã được xác nhận. Cảm ơn bạn đã góp phần xây dựng cộng đồng.`
        : `Báo cáo sự kiện #${bc.maSuKien} của bạn đã được xem xét nhưng chưa đủ căn cứ xử lý. Ghi chú: ${ghiChu}`,
      loaiThamChieu: 'event', maThamChieu: Number(bc.maSuKien), khoa: `event_report_resolved:${maBaoCao}`,
    });
    return {
      maBaoCao: Number(maBaoCao), trangThai: quyetDinh === 'upheld' ? 'upheld' : 'dismissed',
      hanhDong: hanhDongLuu, congViPham: !!congViPhamLuu, mucViPham, ketQuaHanhDong,
    };
  });
}

module.exports = {
  huySuKienSapToi, taoBaoCaoSuKien, lietKeBaoCaoSuKien, xuLyBaoCaoSuKien, anSuKien, boAnSuKien,
};
