// Chủ sân xem đơn đặt sân của khách tại cơ sở của mình (chỉ đọc).
// Luồng: khách đặt (customerService) → khách trả tiền (paymentService) → chủ sân xem ở đây.
const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { doiGioRaPhut } = require('../utils/time');
const khach = require('./customerService');
const { baoKhachDaHoanTien, guiThongBao, dinhDangTien, rutGonVanBan } = require('./notificationService');
const { ganTrangThaiHienThi } = require('../utils/trangThaiDon');
const { taoAnhQrUrl, taoNoiDungQr } = require('../utils/vietqr');

const SO_DONG_MAC_DINH = 20;

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
  LEFT JOIN ThanhToan t ON t.MaDatSan = CASE
    WHEN d.MaLichCoDinh IS NULL THEN d.MaDatSan
    ELSE (SELECT MIN(d2.MaDatSan) FROM DatSan d2 WHERE d2.MaLichCoDinh = d.MaLichCoDinh)
  END`;

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
                  JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo ${NOI_THANH_TOAN}`;

  const [[{ tong }]] = await pool.query(`SELECT COUNT(*) AS tong ${tuHang} WHERE ${loc}`, thamSo);
  const trang = boLoc.trang || 1;
  const soDong = boLoc.soDong || SO_DONG_MAC_DINH;
  // Mặc định mới nhất trước (cũ nhất ở cuối); sapXep=cu-nhat đảo ngược. Giá trị đã được zod giới hạn.
  const sapXep = boLoc.sapXep === 'cu-nhat' ? 'cu-nhat' : 'moi-nhat';
  const huong = sapXep === 'cu-nhat' ? 'ASC' : 'DESC';
  const [cacDon] = await pool.query(
    `SELECT ${COT_DON}, d.HetHanGiuCho AS hetHanGiuCho, t.MaThanhToan AS maThanhToan,
       t.SoTien AS soTienThanhToan, t.NoiDungChuyenKhoan AS noiDungChuyenKhoan,
       t.TrangThai AS trangThaiThanhToan,
       t.AnhChuyenKhoan AS anhChuyenKhoanUrl, t.NgayGuiAnh AS ngayGuiAnh,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan, t.LyDoLoi AS lyDoLoi
     ${tuHang} WHERE ${loc}
     ORDER BY d.NgayChoi ${huong}, d.GioBatDau ${huong}, d.MaDatSan ${huong}
     LIMIT ? OFFSET ?`,
    [...thamSo, soDong, (trang - 1) * soDong]);
  // Thêm trangThaiHienThi/nhanTrangThai/nhomTrangThai (cùng bảng trạng thái với app khách).
  const cacDonKemTrangThai = cacDon.map(({ lyDoLoi, ...don }) => ganTrangThaiHienThi({
    ...don,
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
       t.LyDoLoi AS lyDoTuChoiThanhToan, t.VaiTroXacNhan AS vaiTroXacNhan,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.SoTienHoan AS soTienHoan
     FROM DatSan d JOIN San s ON s.MaSan = d.MaSan
       JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo ${NOI_THANH_TOAN}
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
  return { ...don, cacBuoiCungLich };
}

// ----- Hoàn tiền cho khách huỷ đơn đã trả (chủ sân tự chuyển khoản rồi bấm hoàn thành) -----
// Hàng đợi = ThanhToan success có TrangThaiHoanTien 'processing' (chờ hoàn) / 'refunded' (đã hoàn)
// của cơ sở thuộc chủ sân. Hoàn tiền do trả muộn (late_payment) vẫn do admin xử lý.
async function lietKeHoanTien(maChuSan, trangThai = 'processing') {
  const [cacYeuCau] = await pool.query(
    `SELECT t.MaThanhToan AS maThanhToan, d.MaDatSan AS maDatSan, d.MaDon AS maDon,
       d.TenKhach AS tenKhach, d.SoDienThoaiLienHe AS soDienThoai,
       cs.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo, s.TenSan AS tenSan,
       d.NgayChoi AS ngay, d.GioBatDau AS gioBatDau, d.GioKetThuc AS gioKetThuc,
       d.NgayHuy AS ngayHuy, t.SoTien AS soTienDaTra, t.SoTienHoan AS soTienHoan,
       t.TrangThaiHoanTien AS trangThaiHoanTien, t.MaGiaoDichHoan AS maGiaoDichHoan,
       t.NgayHoan AS ngayHoan, t.TenNganHangHoan AS tenNganHang, t.MaNganHangHoan AS maNganHang,
       t.SoTaiKhoanHoan AS soTaiKhoan, t.ChuTaiKhoanHoan AS chuTaiKhoan
     FROM ThanhToan t JOIN DatSan d ON d.MaDatSan = t.MaDatSan
       JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     WHERE cs.MaChuSan = ? AND t.TrangThai = 'success' AND t.TrangThaiHoanTien = ?
     ORDER BY COALESCE(t.NgayHoan, d.NgayHuy) DESC, t.MaThanhToan DESC`,
    [maChuSan, trangThai]);
  // Chờ hoàn + khách đã nhập tài khoản nhận hoàn → dựng sẵn QR để chủ sân quét chuyển đúng số tiền.
  // Khách chưa nhập tài khoản (hoặc ngân hàng không nhận ra) → null, chủ sân gọi SĐT khách.
  return cacYeuCau.map((yeuCau) => {
    const taiKhoan = yeuCau.maNganHang && yeuCau.soTaiKhoan
      ? { maNganHang: yeuCau.maNganHang, soTaiKhoan: yeuCau.soTaiKhoan, chuTaiKhoan: yeuCau.chuTaiKhoan || '' }
      : null;
    const soTien = Number(yeuCau.soTienHoan ?? yeuCau.soTienDaTra);
    const noiDung = `HOAN ${yeuCau.maDon}`;
    return {
      ...yeuCau,
      noiDungHoan: noiDung,
      anhQrHoanUrl: trangThai === 'processing' ? taoAnhQrUrl(noiDung, soTien, taiKhoan) : null,
      maQrHoan: trangThai === 'processing' ? taoNoiDungQr(noiDung, soTien, taiKhoan) : null,
    };
  });
}

async function hoanThanhHoanTien(maChuSan, maThanhToan, maGiaoDichHoan) {
  const [ketQua] = await pool.query(
    `UPDATE ThanhToan t JOIN DatSan d ON d.MaDatSan = t.MaDatSan
       JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     SET t.TrangThaiHoanTien = 'refunded', t.MaGiaoDichHoan = ?, t.NgayHoan = NOW()
     WHERE t.MaThanhToan = ? AND cs.MaChuSan = ? AND t.TrangThai = 'success'
       AND t.TrangThaiHoanTien = 'processing'`,
    [maGiaoDichHoan || null, maThanhToan, maChuSan]);
  if (!ketQua.affectedRows) {
    // Phân biệt "không phải của chủ sân" với "đã hoàn / không ở trạng thái chờ hoàn".
    const [[dong]] = await pool.query(
      `SELECT t.TrangThaiHoanTien AS trangThaiHoanTien
       FROM ThanhToan t JOIN DatSan d ON d.MaDatSan = t.MaDatSan
         JOIN San s ON s.MaSan = d.MaSan JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
       WHERE t.MaThanhToan = ? AND cs.MaChuSan = ?`,
      [maThanhToan, maChuSan]);
    if (!dong) throw AppError.khongTimThay('Không tìm thấy yêu cầu hoàn tiền');
    throw AppError.biTrung('Yêu cầu hoàn tiền không ở trạng thái chờ hoàn');
  }
  // Chủ sân đã hoàn tiền → báo khách.
  await baoKhachDaHoanTien(pool, maThanhToan, maGiaoDichHoan);
  return { maThanhToan: Number(maThanhToan), trangThaiHoanTien: 'refunded' };
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
        await ketNoi.query(
          `UPDATE ThanhToan SET SoTienHoan = ?, TrangThaiHoanTien = 'processing'
           WHERE MaThanhToan = ? AND TrangThai = 'success'`,
          [soTienHoan, don.maThanhToan]);
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
  await ketNoi.query(
    `INSERT INTO NhatKyHeThong (MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet)
     VALUES (?,?,?,?,?)`,
    [maChuSan, hanhDong, 'DatSan', maDatSan, String(chiTiet).slice(0, 500)]);
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
       WHERE Nguon='owner' AND TrangThaiThu='unpaid' AND TrangThai IN ('confirmed','completed')
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
