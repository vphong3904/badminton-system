// Chủ sân xem đơn đặt sân của khách tại cơ sở của mình (chỉ đọc).
// Luồng: khách đặt (customerService) → khách trả tiền (paymentService) → chủ sân xem ở đây.
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { doiGioRaPhut } = require('../utils/time');
const khach = require('./customerService');
const { guiThongBao, dinhDangTien, rutGonVanBan } = require('./notificationService');
const hoanTienService = require('./hoanTienService');
const fs = require('fs/promises');
const { ganTrangThaiHienThi } = require('../utils/trangThaiDon');
const { taoAnhQrUrl, taoNoiDungQr } = require('../utils/vietqr');
const nhatKy = require('./nhatKyService');
const chungTu = require('./chungTuService');
const { layCauHinhSo } = require('./cauHinhService');

const SO_DONG_MAC_DINH = 20;
const PHUT_MO_CHECK_IN_MAC_DINH = 30;

// G3: nối bảng CheckIn + cờ "chủ sân bấm check-in thủ công được" do SERVER tính bằng NOW():
// đơn hợp lệ (confirmed, hoặc đã gửi ảnh chờ duyệt) + chưa check-in + trong khoảng [mở check-in, hết giờ chơi).
const NOI_CHECK_IN = 'LEFT JOIN CheckIn ci ON ci.MaDatSan = d.MaDatSan';
const cotCheckIn = (moSomPhut) => `
  ci.ThoiDiem AS thoiDiemCheckIn, ci.PhuongThuc AS phuongThucCheckIn, ci.LyDo AS lyDoCheckIn,
  (ci.MaCheckIn IS NULL
    AND (d.TrangThai='confirmed' OR (d.TrangThai='pending_payment' AND t.TrangThai IN ('confirming','overdue')))
    AND NOW() >= TIMESTAMP(d.NgayChoi, d.GioBatDau) - INTERVAL ${Number(moSomPhut)} MINUTE
    AND NOW() < TIMESTAMP(d.NgayChoi, d.GioKetThuc)) AS coTheCheckInThuCong`;

// Cột trả về cho 1 đơn (dùng chung cho danh sách và chi tiết).
const COT_DON = `
  d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaLichCoDinh AS maLichCoDinh,
  d.Nguon AS nguon, d.LoaiKhach AS loaiKhach,
  d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc, d.SoPhut AS soPhut,
  d.TongTien AS tongTien, d.PhiNenTang AS phiNenTang, d.TienChuSan AS tienChuSan,
  d.TrangThai AS trangThai, d.TrangThaiThu AS trangThaiThu, d.GhiChu AS ghiChu, d.NgayTao AS ngayTao,
  d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoaiLienHe,
  s.MaSan AS maSan, s.TenSan AS tenSan, cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo`;

// Thanh toán của đơn: đơn cố định nhiều buổi dùng chung 1 thanh toán (của buổi đầu).
const NOI_THANH_TOAN = `
  LEFT JOIN (SELECT MaLichCoDinh AS maLichDauLich, MIN(MaDatSan) AS maDonDauLich FROM DatSan WHERE MaLichCoDinh IS NOT NULL GROUP BY MaLichCoDinh) dauLich ON dauLich.maLichDauLich=d.MaLichCoDinh
     LEFT JOIN ThanhToan t ON t.MaDatSan=CASE WHEN d.MaLichCoDinh IS NULL THEN COALESCE(d.MaNhomDat, d.MaDatSan) ELSE dauLich.maDonDauLich END`;

async function lietKeDon(maChuSan, boLoc) {
  const dieuKien = ['cs.MaChuSan = ?'];
  const thamSo = [maChuSan];

  // Đơn chưa thanh toán (đang giữ chỗ / hết hạn) vẫn hiện để chủ sân biết sân đang bị giữ.
  if (boLoc.trangThai) { dieuKien.push('d.TrangThai = ?'); thamSo.push(boLoc.trangThai); }
  if (boLoc.trangThaiThanhToan) { dieuKien.push('t.TrangThai = ?'); thamSo.push(boLoc.trangThaiThanhToan); }
  if (boLoc.maCoSo) { dieuKien.push('cs.MaCoSo = ?'); thamSo.push(boLoc.maCoSo); }
  if (boLoc.maSan) { dieuKien.push('d.MaSan = ?'); thamSo.push(boLoc.maSan); }
  if (boLoc.ngay) {
    dieuKien.push('d.NgayChoi = ?'); thamSo.push(boLoc.ngay);
  } else {
    if (boLoc.tuNgay) { dieuKien.push('d.NgayChoi >= ?'); thamSo.push(boLoc.tuNgay); }
    if (boLoc.denNgay) { dieuKien.push('d.NgayChoi <= ?'); thamSo.push(boLoc.denNgay); }
  }
  if (boLoc.tuKhoa) {
    dieuKien.push('(d.MaDon LIKE ? OR d.TenKhach LIKE ? OR d.SoDienThoaiLienHe LIKE ?)');
    const mau = `%${boLoc.tuKhoa}%`;
    thamSo.push(mau, mau, mau);
  }
  const loc = dieuKien.join(' AND ');
  const tuHang = `FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
                  JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo ${NOI_THANH_TOAN} ${NOI_CHECK_IN}`;
  const moSomPhut = await layCauHinhSo(pool, 'checkin_open_minutes', PHUT_MO_CHECK_IN_MAC_DINH);

  const [[{ tong }]] = await pool.query(`SELECT COUNT(*) AS tong ${tuHang} WHERE ${loc}`, thamSo);
  const trang = boLoc.trang || 1;
  const soDong = boLoc.soDong || SO_DONG_MAC_DINH;
  // Mặc định mới nhất trước (cũ nhất ở cuối); sapXep=cu-nhat đảo ngược. Giá trị đã được zod giới hạn.
  const sapXep = ['cu-nhat', 'han-xac-nhan'].includes(boLoc.sapXep) ? boLoc.sapXep : 'moi-nhat';
  const huong = sapXep === 'cu-nhat' ? 'ASC' : 'DESC';
  // 'han-xac-nhan': hàng đợi duyệt thanh toán — đơn sắp/đã quá hạn xác nhận lên đầu (đơn không có hạn xuống cuối).
  const thuTuSapXep = sapXep === 'han-xac-nhan'
    ? 't.HanXacNhan IS NULL, t.HanXacNhan ASC, d.MaDatSan ASC'
    : `d.NgayChoi ${huong}, d.GioBatDau ${huong}, d.MaDatSan ${huong}`;
  const [cacDon] = await pool.query(
    `SELECT ${COT_DON}, d.HetHanGiuCho AS hetHanGiuCho, t.MaThanhToan AS maThanhToan,
       t.SoTien AS soTienThanhToan, t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.TrangThai AS trangThaiThanhToan,
       t.AnhChuyenKhoan AS anhChuyenKhoanUrl, t.NgayGuiAnh AS ngayGuiAnh,
       t.HanXacNhan AS hanXacNhan,
       (t.TrangThai='confirming' AND t.HanXacNhan IS NOT NULL AND t.HanXacNhan<NOW()) AS quaHanXacNhan,
       (SELECT COUNT(*) FROM ChungTuThanhToan c WHERE c.MaThanhToan=t.MaThanhToan) AS soChungTu,
       ${chungTu.SQL_CO_CANH_BAO_TRUNG} AS coCanhBaoTrungAnh,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan, t.LyDoLoi AS lyDoLoi,
       ${cotCheckIn(moSomPhut)}
     ${tuHang} WHERE ${loc}
     ORDER BY ${thuTuSapXep}
     LIMIT ? OFFSET ?`,
    [...thamSo, soDong, (trang - 1) * soDong]);
  // Thêm trangThaiHienThi/nhanTrangThai/nhomTrangThai (cùng bảng trạng thái với app khách).
  const cacDonKemTrangThai = cacDon.map(({ lyDoLoi, ...don }) => ganTrangThaiHienThi({
    ...don,
    quaHanXacNhan: !!Number(don.quaHanXacNhan),
    coTheCheckInThuCong: !!Number(don.coTheCheckInThuCong),
    soChungTu: Number(don.soChungTu),
    coCanhBaoTrungAnh: !!Number(don.coCanhBaoTrungAnh),
    lyDoTuChoi: don.trangThaiThanhToan === 'pending' && lyDoLoi ? lyDoLoi : null,
  }));
  return { cacDon: cacDonKemTrangThai, trang, soDongMoiTrang: soDong, tong, sapXep };
}

// Chi tiết 1 đơn = hoá đơn: tiền khách trả, phí nền tảng, tiền chủ sân nhận, trạng thái thanh toán.
async function layChiTietDon(maChuSan, maDatSan) {
  const [[don]] = await pool.query(
    `SELECT ${COT_DON},
       d.HetHanGiuCho AS hetHanGiuCho, d.NguoiHuy AS nguoiHuy, d.LyDoHuy AS lyDoHuy,
       d.NgayHuy AS ngayHuy, d.TrangThaiThu AS trangThaiThu,
       t.MaThanhToan AS maThanhToan, t.SoTien AS soTienThanhToan,
       t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.TrangThai AS trangThaiThanhToan, t.NgayThanhToan AS ngayThanhToan,
       t.AnhChuyenKhoan AS anhChuyenKhoanUrl, t.NgayGuiAnh AS ngayGuiAnh,
       t.HanXacNhan AS hanXacNhan,
       CASE WHEN t.TrangThai='confirming' THEN TIMESTAMPDIFF(SECOND, NOW(), t.HanXacNhan) END AS conLaiXacNhanGiay,
       t.LyDoLoi AS lyDoTuChoiThanhToan, t.VaiTroXacNhan AS vaiTroXacNhan,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan,
       ${cotCheckIn(await layCauHinhSo(pool, 'checkin_open_minutes', PHUT_MO_CHECK_IN_MAC_DINH))}
     FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
       JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo ${NOI_THANH_TOAN} ${NOI_CHECK_IN}
     WHERE d.MaDatSan = ? AND cs.MaChuSan = ?`,
    [maDatSan, maChuSan]);
  if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');

  // Đơn thuộc lịch cố định: kèm các buổi còn lại để chủ sân thấy cả chuỗi.
  let cacBuoiCungLich = [];
  if (don.maLichCoDinh) {
    [cacBuoiCungLich] = await pool.query(
      `SELECT MaDatSan AS maDatSan, MaDon AS maDon, NgayChoi AS ngay, TrangThai AS trangThai,
         TongTien AS tongTien
       FROM DatSan WHERE MaLichCoDinh = ? ORDER BY NgayChoi`,
      [don.maLichCoDinh]);
  }
  // Chứng từ (nhiều ảnh, mới nhất trước) + cảnh báo "ảnh đã dùng ở đơn khác" (G2.3): chỉ để chủ sân cân nhắc, không tự từ chối.
  const cacChungTu = don.maThanhToan
    ? await chungTu.layChungTu(pool, don.maThanhToan, { goc: 'owner', maChuSan })
    : [];
  const conLai = don.conLaiXacNhanGiay === null || don.conLaiXacNhanGiay === undefined
    ? null : Number(don.conLaiXacNhanGiay);
  return {
    ...don,
    coTheCheckInThuCong: !!Number(don.coTheCheckInThuCong),
    conLaiXacNhanGiay: conLai,
    quaHanXacNhan: don.trangThaiThanhToan === 'confirming' && conLai !== null && conLai < 0,
    chungTu: cacChungTu,
    canhBaoTrungAnh: chungTu.gomCanhBaoTrungAnh(cacChungTu),
    cacBuoiCungLich,
  };
}

// ----- Hoàn tiền cho khách huỷ đơn đã trả (chủ sân tự chuyển khoản rồi tải ẢNH chứng từ — G4) -----
// Hàng đợi lấy từ bảng HoanTien của cơ sở thuộc chủ sân (trừ khoản quá hạn xác nhận `late_proof` do Admin xử lý):
//   trangThai='processing' → chờ hoàn: processing / not_received (khách báo chưa nhận) / escalated (đã quá hạn, báo Admin)
//   trangThai='refunded'   → đã hoàn : refunded (chờ khách xác nhận) / received (khách đã nhận)
const NHOM_TRANG_THAI_HOAN = {
  processing: ['processing', 'not_received', 'escalated'],
  refunded: ['refunded', 'received'],
};

async function lietKeHoanTien(maChuSan, trangThai = 'processing') {
  const cacTrangThai = NHOM_TRANG_THAI_HOAN[trangThai] || NHOM_TRANG_THAI_HOAN.processing;
  const [cacYeuCau] = await pool.query(
    `SELECT h.MaHoanTien AS maHoanTien, t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaDon AS maDon,
       d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoai,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, s.TenSan AS tenSan,
       d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       d.NgayHuy AS ngayHuy, t.SoTien AS soTienDaTra, h.SoTien AS soTienHoan, h.Loai AS loai, h.TyLe AS tiLeHoan,
       h.TrangThai AS trangThaiHoanTien, h.AnhChungTu AS anhChungTuUrl,
       h.NgayHoan AS ngayHoan, h.HanHoan AS hanHoan, (h.HanHoan < NOW()) AS quaHan,
       h.SoLanChuaNhan AS soLanChuaNhan, h.GhiChuKhach AS ghiChuKhach,
       h.TenNganHang AS tenNganHang, h.MaNganHang AS maNganHang,
       h.SoTaiKhoan AS soTaiKhoan, h.ChuTaiKhoan AS chuTaiKhoan
     FROM HoanTien h JOIN ThanhToan t ON t.MaThanhToan = h.MaThanhToan
       JOIN DatSan d ON d.MaDatSan = h.MaDatSan
       JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     WHERE cs.MaChuSan = ? AND h.Loai <> 'late_proof' AND h.TrangThai IN (${cacTrangThai.map(() => '?').join(',')})
     ORDER BY COALESCE(h.NgayHoan, h.NgayTao) DESC, h.MaHoanTien DESC`,
    [maChuSan, ...cacTrangThai]);
  // Chờ hoàn + khách đã nhập tài khoản nhận hoàn → dựng sẵn QR để chủ sân quét chuyển đúng số tiền.
  // Khách chưa nhập tài khoản (hoặc ngân hàng không nhận ra) → null, chủ sân gọi SĐT khách.
  return cacYeuCau.map((yeuCau) => {
    const choHoan = trangThai === 'processing';
    const taiKhoan = yeuCau.maNganHang && yeuCau.soTaiKhoan
      ? { maNganHang: yeuCau.maNganHang, soTaiKhoan: yeuCau.soTaiKhoan, chuTaiKhoan: yeuCau.chuTaiKhoan || '' }
      : null;
    const soTien = Number(yeuCau.soTienHoan);
    const noiDung = `HOAN ${yeuCau.maDon}`;
    return {
      ...yeuCau,
      quaHan: !!Number(yeuCau.quaHan),
      noiDungHoan: noiDung,
      anhQrHoanUrl: choHoan ? taoAnhQrUrl(noiDung, soTien, taiKhoan) : null,
      maQrHoan: choHoan ? taoNoiDungQr(noiDung, soTien, taiKhoan) : null,
    };
  });
}

// Chủ sân bấm "Đã hoàn": BẮT BUỘC kèm ảnh chứng từ chuyển khoản (`tep` do multer nhận, field `anhChungTu`).
async function hoanThanhHoanTien(maChuSan, maThanhToan, tep) {
  const duongDanAnh = await hoanTienService.kiemTraAnhChungTu(tep);
  try {
    return await thucHienGiaoDich(async (ketNoi) => {
      const [[chuSo]] = await ketNoi.query(
        `SELECT t.MaThanhToan AS maThanhToan
         FROM ThanhToan t JOIN DatSan d ON d.MaDatSan = t.MaDatSan
           JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
         WHERE t.MaThanhToan = ? AND cs.MaChuSan = ?`,
        [maThanhToan, maChuSan]);
      if (!chuSo) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
      const yeuCau = await hoanTienService.layYeuCauDangMo(ketNoi, maThanhToan, true);
      if (!yeuCau || yeuCau.loai === 'late_proof') throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
      return hoanTienService.danhDauDaHoan(ketNoi, {
        maHoanTien: yeuCau.maHoanTien, nguoi: { maNguoiDung: maChuSan, vaiTro: 'owner' }, duongDanAnh,
      });
    });
  } catch (loi) {
    await fs.unlink(tep.path).catch(() => {}); // không giữ ảnh của yêu cầu bị từ chối
    throw loi;
  }
}

// Chủ sân tạo đơn cho khách đặt tại chỗ (1 ngày) hoặc khách cố định (nhiều ngày liên tiếp, có `ngayKetThuc`).
// Khác đơn của khách: không giữ chỗ/QR, xác nhận ngay (`confirmed`), không thu hoa hồng
// (PhiNenTang=0), theo dõi công nợ bằng TrangThaiThu (`daThu` = khách đã trả tiền mặt/chuyển khoản).
// Cùng quy tắc kiểm tra giờ/giá/trùng lịch/khoá sân với đơn của khách, trong 1 giao dịch.
async function taoDon(maChuSan, duLieu) {
  const ngayKetThuc = duLieu.ngayKetThuc || duLieu.ngay;
  const coDinh = ngayKetThuc !== duLieu.ngay;
  const loaiKhach = coDinh ? 'fixed' : 'walk_in';
  const cacNgay = khach.taoDanhSachNgay(duLieu.ngay, ngayKetThuc);
  const soPhut = doiGioRaPhut(duLieu.gioKetThuc) - doiGioRaPhut(duLieu.gioBatDau);

  return thucHienGiaoDich(async (ketNoi) => {
    const san = await khach.layThongTinSan(duLieu.maSan, ketNoi, true);
    if (san.maChuSan !== maChuSan) throw AppError.khongTimThay('Không tìm thấy sân đang hoạt động');

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='expired'
       WHERE MaSan=? AND NgayChoi IN (${cacNgay.map(() => '?').join(',')})
         AND TrangThai='pending_payment' AND HetHanGiuCho<=NOW()`,
      [san.maSan, ...cacNgay]);
    const cacGia = [];
    for (const ngay of cacNgay) {
      if (!await khach.kiemTraKhungDat(san, ngay, duLieu.gioBatDau, duLieu.gioKetThuc, ketNoi)) {
        throw AppError.biTrung(`Sân đã có lịch hoặc bị khóa vào ngày ${ngay}`);
      }
      cacGia.push(await khach.tinhTongTien(
        san.maCoSo, ngay, duLieu.gioBatDau, duLieu.gioKetThuc, loaiKhach, ketNoi));
    }

    let maLichCoDinh = null;
    if (coDinh) {
      const [lich] = await ketNoi.query(
        `INSERT INTO LichCoDinh
         (MaSan, MaKhachHang, TenKhach, SoDienThoai, CacThu, NgayBatDau, NgayKetThuc,
          GioBatDau, GioKetThuc, SoPhut, DonGiaMoiBuoi, GhiChu, MaNguoiTao)
         VALUES (?,NULL,?,?, 'T2,T3,T4,T5,T6,T7,CN', ?,?,?,?,?,?,?,?)`,
        [san.maSan, duLieu.tenKhach, duLieu.soDienThoai, duLieu.ngay, ngayKetThuc,
          duLieu.gioBatDau, duLieu.gioKetThuc, soPhut, cacGia[0], duLieu.ghiChu || null, maChuSan]);
      maLichCoDinh = lich.insertId;
    }

    const daThu = duLieu.daThu === true;
    const cacDon = [];
    for (let viTri = 0; viTri < cacNgay.length; viTri += 1) {
      const maDon = khach.taoMaDon();
      const [don] = await ketNoi.query(
        `INSERT INTO DatSan
         (MaDon, MaKhachHang, TenKhach, SoDienThoaiLienHe, GhiChu, Nguon, LoaiKhach,
          MaLichCoDinh, MaSan, NgayChoi, GioBatDau, GioKetThuc, SoPhut, TongTien,
          PhiNenTang, TienChuSan, TrangThaiThu, NgayThu, TrangThai)
         VALUES (?,NULL,?,?,?,'owner',?,?,?,?,?,?,?,?,0,?,?,${daThu ? 'NOW()' : 'NULL'},'confirmed')`,
        [maDon, duLieu.tenKhach, duLieu.soDienThoai, duLieu.ghiChu || null, loaiKhach, maLichCoDinh,
          san.maSan, cacNgay[viTri], duLieu.gioBatDau, duLieu.gioKetThuc, soPhut,
          cacGia[viTri], cacGia[viTri], daThu ? 'paid' : 'unpaid']);
      cacDon.push({ maDatSan: don.insertId, maDon, ngay: cacNgay[viTri], tongTien: cacGia[viTri] });
    }
    // Task 2.1: đơn mới là nhóm 1 dòng (MaNhomDat = MaDatSan); đặt nhiều sân (2.3) sẽ gom nhiều dòng vào một nhóm.
    await ketNoi.query(
      `UPDATE DatSan SET MaNhomDat = MaDatSan WHERE MaDatSan IN (${cacDon.map(() => '?').join(',')})`,
      cacDon.map((don) => don.maDatSan));
    return {
      maLichCoDinh,
      loaiKhach,
      soNgay: cacNgay.length,
      tongTien: cacGia.reduce((tong, gia) => tong + gia, 0),
      trangThai: 'confirmed',
      trangThaiThu: daThu ? 'paid' : 'unpaid',
      cacDon,
    };
  });
}

// Chủ sân huỷ đơn đã đặt (vd đóng sân bảo trì). Chủ sân là bên huỷ nên khách luôn được hoàn 100% số đã trả,
// không áp chính sách 24h/12h của khách. Tiền hoàn vào hàng đợi hoàn tiền (`processing`) để chủ sân tự chuyển
// khoản rồi bấm hoàn thành như các khoản hoàn khác.
// - Chỉ huỷ đơn `pending_payment` / `confirmed` và chưa tới giờ chơi.
// - Đơn khách đã gửi ảnh chuyển khoản mà chưa duyệt (`confirming`) → 409: phải duyệt hoặc từ chối thanh toán trước,
//   tránh huỷ khi tiền đã chuyển mà chưa được ghi nhận.
// - Đơn thuộc lịch cố định: huỷ MỌI buổi còn lại chưa tới giờ (giống khách huỷ), hoàn tổng tiền các buổi đó.
// - Đơn chủ sân tự tạo (không có thanh toán trong hệ thống): chỉ huỷ; nếu đã thu tiền thì trả cờ để chủ sân tự hoàn ngoài hệ thống.
const daBatDau = (ngay, gio, bayGio) => new Date(`${ngay}T${String(gio).slice(0, 8)}+07:00`).getTime() <= bayGio;

async function huyDon(maChuSan, maDatSan, lyDo) {
  return thucHienGiaoDich(async (ketNoi) => {
    const [[don]] = await ketNoi.query(
      `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.MaKhachHang AS maKhachHang, d.TenKhach AS tenKhach,
         d.Nguon AS nguon, d.MaLichCoDinh AS maLichCoDinh, d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau,
         d.TongTien AS tongTien, d.TrangThai AS trangThai, d.TrangThaiThu AS trangThaiThu,
         s.TenSan AS tenSan, cs.TenCoSo AS tenCoSo,
         t.MaThanhToan AS maThanhToan, t.TrangThai AS trangThaiThanhToan
       FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
         JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo ${NOI_THANH_TOAN}
       WHERE d.MaDatSan = ? AND cs.MaChuSan = ? FOR UPDATE`,
      [maDatSan, maChuSan]);
    if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
    if (!['pending_payment', 'confirmed'].includes(don.trangThai)) {
      throw AppError.biTrung('Đơn đặt sân không thể huỷ ở trạng thái hiện tại');
    }
    if (don.trangThaiThanhToan === 'confirming') {
      throw AppError.biTrung(
        'Khách đã gửi ảnh chuyển khoản. Hãy xác nhận hoặc từ chối thanh toán trước khi huỷ đơn.',
        'PAYMENT_CONFIRMING');
    }

    const bayGio = Date.now();
    if (daBatDau(don.ngay, don.gioBatDau, bayGio)) {
      throw AppError.biTrung('Đơn đã đến giờ chơi hoặc đã qua, không thể huỷ');
    }
    const cacBuoi = don.maLichCoDinh
      ? (await ketNoi.query(
        `SELECT MaDatSan AS maDatSan, NgayChoi AS ngay, GioBatDau AS gioBatDau, TongTien AS tongTien
         FROM DatSan WHERE MaLichCoDinh = ? AND TrangThai IN ('pending_payment','confirmed')
         ORDER BY NgayChoi FOR UPDATE`,
        [don.maLichCoDinh]))[0].filter((buoi) => !daBatDau(buoi.ngay, buoi.gioBatDau, bayGio))
      : [{ maDatSan: don.maDatSan, ngay: don.ngay, gioBatDau: don.gioBatDau, tongTien: don.tongTien }];
    const tongTienCacBuoi = cacBuoi.reduce((tong, buoi) => tong + Number(buoi.tongTien), 0);

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='cancelled', NguoiHuy='owner', LyDoHuy=?, NgayHuy=NOW()
       WHERE MaDatSan IN (${cacBuoi.map(() => '?').join(',')})`,
      [lyDo, ...cacBuoi.map((buoi) => buoi.maDatSan)]);
    if (don.maLichCoDinh) {
      await ketNoi.query("UPDATE LichCoDinh SET TrangThai='cancelled' WHERE MaLichCoDinh = ?", [don.maLichCoDinh]);
    }

    // Hoàn 100% số tiền của các buổi bị huỷ nếu khách đã trả qua hệ thống.
    const daThanhToan = don.trangThaiThanhToan === 'success';
    const soTienHoan = daThanhToan ? tongTienCacBuoi : 0;
    if (don.maThanhToan) {
      if (daThanhToan) {
        await hoanTienService.taoYeuCauHoan(ketNoi, {
          maThanhToan: don.maThanhToan, maDatSan: don.maDatSan, loai: 'owner_cancel', soTien: soTienHoan,
          tyLe: 100, lyDo,
        });
      } else if (don.trangThaiThanhToan === 'pending') {
        await ketNoi.query("UPDATE ThanhToan SET TrangThai='expired' WHERE MaThanhToan = ? AND TrangThai='pending'",
          [don.maThanhToan]);
      }
    }
    // Đơn chủ sân tự tạo và đã thu tiền ngoài hệ thống: chủ sân tự hoàn cho khách, hệ thống không giữ khoản này.
    const daThuNgoaiHeThong = don.nguon === 'owner' && don.trangThaiThu === 'paid';

    if (don.maKhachHang) {
      const nhanDon = `${don.tenSan} - ${don.tenCoSo} (mã ${don.maDon})`;
      const cauHoan = soTienHoan > 0
        ? ` Bạn được hoàn 100% (${dinhDangTien(soTienHoan)}); chủ sân sẽ chuyển khoản hoàn cho bạn.`
        : '';
      await guiThongBao(ketNoi, {
        maNguoiDung: don.maKhachHang,
        loai: 'booking_cancelled',
        tieuDe: 'Chủ sân đã huỷ đơn đặt sân',
        noiDung: `Chủ sân đã huỷ ${nhanDon}. Lý do: ${rutGonVanBan(lyDo, 120)}.${cauHoan}`,
        loaiThamChieu: 'booking',
        maThamChieu: Number(don.maDatSan),
        khoa: `booking_cancelled_by_owner:${don.maDatSan}`,
      });
    }

    return {
      daHuy: true,
      maDatSan: Number(don.maDatSan),
      maDon: don.maDon,
      nguoiHuy: 'owner',
      soBuoiHuy: cacBuoi.length,
      daThanhToan,
      tiLeHoan: daThanhToan ? 100 : 0,
      soTienHoan,
      // Có khoản phải hoàn trong hàng đợi /hoan-tien → chủ sân chuyển khoản rồi bấm hoàn thành.
      canHoanTien: soTienHoan > 0,
      daThuNgoaiHeThong,
      soTienCanHoanNgoaiHeThong: daThuNgoaiHeThong ? tongTienCacBuoi : 0,
    };
  });
}

// ----- Đơn chủ sân tự tạo (Nguon='owner', thanh toán ngoài hệ thống) -----
async function ghiNhatKyDon(ketNoi, maChuSan, hanhDong, maDatSan, chiTiet) {
  await nhatKy.ghiNhatKy(ketNoi, { maNguoiThucHien: maChuSan, hanhDong, doiTuong: 'DatSan', maDoiTuong: maDatSan, chiTiet });
}

// Khoá + đọc đơn thuộc cơ sở của chủ sân (404 nếu không phải của mình); 409 nếu không phải đơn owner.
async function layDonOwnerDeSua(ketNoi, maChuSan, maDatSan) {
  const [[don]] = await ketNoi.query(
    `SELECT d.MaDatSan AS maDatSan, d.MaDon AS maDon, d.Nguon AS nguon, d.MaLichCoDinh AS maLichCoDinh,
       d.NgayChoi AS ngay, d.GioKetThuc AS gioKetThuc, d.TongTien AS tongTien,
       d.TrangThai AS trangThai, d.TrangThaiThu AS trangThaiThu
     FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
       JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     WHERE d.MaDatSan = ? AND cs.MaChuSan = ? FOR UPDATE`,
    [maDatSan, maChuSan]);
  if (!don) throw AppError.khongTimThay('Không tìm thấy đơn đặt sân');
  if (don.nguon !== 'owner') {
    throw AppError.biTrung(
      'Đây là đơn khách đặt qua app, không thao tác được tại đây (đơn app huỷ theo luồng hoàn tiền riêng).',
      'NOT_OWNER_BOOKING');
  }
  return don;
}

const daChoiXong = (ngay, gio, bayGio) => new Date(`${ngay}T${String(gio).slice(0, 8)}+07:00`).getTime() <= bayGio;

// Đánh dấu đã thu tiền ngoài hệ thống: unpaid → paid (mặc định 1 buổi; tatCaBuoi → mọi buổi chưa thu của lịch cố định).
async function danhDauDaThu(maChuSan, maDatSan, tatCaBuoi = false) {
  return thucHienGiaoDich(async (ketNoi) => {
    const don = await layDonOwnerDeSua(ketNoi, maChuSan, maDatSan);
    if (['cancelled', 'expired'].includes(don.trangThai)) throw AppError.biTrung('Đơn đã huỷ nên không thể đánh dấu đã thu', 'BOOKING_CANCELLED');
    if (don.trangThaiThu === 'paid') throw AppError.biTrung('Đơn này đã được đánh dấu đã thu', 'ALREADY_PAID');

    const hangLoat = tatCaBuoi && don.maLichCoDinh;
    const [ketQua] = await ketNoi.query(
      `UPDATE DatSan SET TrangThaiThu='paid', NgayThu=NOW()
       WHERE Nguon='owner' AND TrangThaiThu='unpaid' AND TrangThai IN ('confirmed','checked_in','completed')
         AND ${hangLoat ? 'MaLichCoDinh = ?' : 'MaDatSan = ?'}`,
      [hangLoat ? don.maLichCoDinh : don.maDatSan]);
    await ghiNhatKyDon(ketNoi, maChuSan, 'thu_tien_don', don.maDatSan,
      `Đánh dấu đã thu đơn ${don.maDon}${hangLoat ? ` (cả lịch cố định, ${ketQua.affectedRows} buổi)` : ''}`);
    return {
      maDatSan: Number(don.maDatSan),
      maDon: don.maDon,
      trangThaiThu: 'paid',
      soBuoiDaThu: ketQua.affectedRows,
    };
  });
}

// Chủ sân huỷ đơn do chính mình tạo: không có thanh toán trong hệ thống nên KHÔNG hoàn tiền; giải phóng lịch.
// Đơn đã thu → doanh thu tự giảm (báo cáo chỉ tính đơn owner chưa huỷ). 409: đơn app / đã huỷ / đã chơi xong.
async function huyDonOwner(maChuSan, maDatSan, { lyDo, tatCaBuoi = false } = {}) {
  return thucHienGiaoDich(async (ketNoi) => {
    const don = await layDonOwnerDeSua(ketNoi, maChuSan, maDatSan);
    if (['cancelled', 'expired'].includes(don.trangThai)) throw AppError.biTrung('Đơn đã được huỷ trước đó', 'ALREADY_CANCELLED');
    const bayGio = Date.now();
    if (don.trangThai === 'completed' || daChoiXong(don.ngay, don.gioKetThuc, bayGio)) {
      throw AppError.biTrung('Đơn đã chơi xong, không thể huỷ', 'BOOKING_FINISHED');
    }
    const hangLoat = tatCaBuoi && don.maLichCoDinh;
    const cacBuoi = hangLoat
      ? (await ketNoi.query(
        `SELECT MaDatSan AS maDatSan, NgayChoi AS ngay, GioKetThuc AS gioKetThuc, TongTien AS tongTien,
           TrangThaiThu AS trangThaiThu
         FROM DatSan WHERE MaLichCoDinh = ? AND TrangThai IN ('pending_payment','confirmed') ORDER BY NgayChoi FOR UPDATE`,
        [don.maLichCoDinh]))[0].filter((buoi) => !daChoiXong(buoi.ngay, buoi.gioKetThuc, bayGio))
      : [{ maDatSan: don.maDatSan, tongTien: don.tongTien, trangThaiThu: don.trangThaiThu }];
    const cacMa = cacBuoi.map((buoi) => buoi.maDatSan);

    await ketNoi.query(
      `UPDATE DatSan SET TrangThai='cancelled', NguoiHuy='owner', LyDoHuy=?, NgayHuy=NOW()
       WHERE Nguon='owner' AND MaDatSan IN (${cacMa.map(() => '?').join(',')})`,
      [lyDo || 'Chủ sân huỷ đơn tự tạo', ...cacMa]);
    if (don.maLichCoDinh) {
      // Huỷ hết buổi còn hiệu lực → đóng luôn lịch cố định.
      const [[{ conLai }]] = await ketNoi.query(
        `SELECT COUNT(*) AS conLai FROM DatSan WHERE MaLichCoDinh = ? AND TrangThai IN ('pending_payment','confirmed')`,
        [don.maLichCoDinh]);
      if (!conLai) await ketNoi.query("UPDATE LichCoDinh SET TrangThai='cancelled' WHERE MaLichCoDinh = ?", [don.maLichCoDinh]);
    }
    const tienDaThuBiGo = cacBuoi
      .filter((buoi) => buoi.trangThaiThu === 'paid')
      .reduce((tong, buoi) => tong + Number(buoi.tongTien), 0);
    await ghiNhatKyDon(ketNoi, maChuSan, 'huy_don_ngoai_he_thong', don.maDatSan,
      `Chủ sân huỷ đơn ${don.maDon} (${cacMa.length} buổi), không hoàn tiền trong hệ thống`);
    return {
      daHuy: true,
      maDatSan: Number(don.maDatSan),
      maDon: don.maDon,
      nguoiHuy: 'owner',
      soBuoiHuy: cacMa.length,
      // Tiền đã thu ngoài hệ thống của các buổi vừa huỷ: trừ khỏi doanh thu; chủ sân tự hoàn khách nếu cần.
      soTienTruKhoiDoanhThu: tienDaThuBiGo,
    };
  });
}

module.exports = {
  taoDon, huyDon, danhDauDaThu, huyDonOwner, lietKeDon, layChiTietDon, lietKeHoanTien, hoanThanhHoanTien };
