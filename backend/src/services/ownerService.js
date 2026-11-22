const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const { kiemTraKhungGia } = require('../utils/time');
const { thongBaoTheoTrangThai, layMucConThieuHoSo } = require('../utils/hoSoChuSan');
const { timNganHang } = require('../utils/nganHang');
const { layToaDoTuLink } = require('../utils/toaDoBanDo');
const sanCoSo = require('./sanCoSoService');
const fs = require('fs/promises');
const { ANH_MAC_DINH, luuAnh, xoaAnh } = require('../middlewares/upload');
const { SLOT_BAN } = require('../utils/slot');
const { chuanHoaYeuCauKhoa } = require('../utils/khoaSan');
const nhatKy = require('./nhatKyService');

const TRANG_THAI_DUOC_SUA = ['rejected'];

async function layHoSo(maChuSan) {
  const [[hoSo]] = await pool.query(
    `SELECT MaNguoiDung AS maNguoiDung, TenDoanhNghiep AS tenDoanhNghiep,
       TenNganHang AS tenNganHang, MaNganHang AS maNganHang, SoTaiKhoan AS soTaiKhoan,
       ChuTaiKhoan AS chuTaiKhoan, TrangThaiDuyet AS trangThaiDuyet,
       NgayGuiDuyet AS ngayGuiDuyet, NgayDuyet AS ngayDuyet,
       MaQuanTriDuyet AS maQuanTriDuyet, LyDoTuChoi AS lyDoTuChoi
     FROM HoSoChuSan WHERE MaNguoiDung = ?`,
    [maChuSan]);
  return hoSo;
}

// Câu SELECT cơ sở dùng chung cho danh sách / chi tiết / "cơ sở đầu tiên".
const CHON_CO_SO = `
  SELECT cs.MaCoSo AS maCoSo, cs.MaChuSan AS maChuSan, cs.TenCoSo AS tenCoSo,
    cs.DiaChi AS diaChi, cs.SoDienThoai AS soDienThoai,
    cs.LinkBanDo AS linkBanDo, cs.ViDo AS viDo, cs.KinhDo AS kinhDo, cs.TinhThanh AS tinhThanh, cs.QuanHuyen AS quanHuyen,
    cs.MoTa AS moTa, cs.GioMoCua AS gioMoCua, cs.GioDongCua AS gioDongCua,
    cs.SoPhutDatToiThieu AS soPhutDatToiThieu, cs.SoPhutTreToiDa AS soPhutTreToiDa, cs.GiaThapNhat AS giaThapNhat,
    cs.TrangThai AS trangThai,
    COALESCE((SELECT DuongDan FROM AnhCoSo WHERE MaCoSo = cs.MaCoSo
     ORDER BY LaAnhBia DESC, ThuTu, MaAnh LIMIT 1), '${ANH_MAC_DINH.coso}') AS duongDanAnh,
    (SELECT COUNT(*) FROM San WHERE MaCoSo = cs.MaCoSo) AS soSan,
    (SELECT COUNT(*) FROM San WHERE MaCoSo = cs.MaCoSo AND TrangThai = 'active') AS soSanHoatDong
  FROM CoSo cs`;

// Tất cả cơ sở của chủ sân (mới nhất ở cuối), kèm số sân.
async function layDanhSachCoSo(maChuSan) {
  const [cacCoSo] = await pool.query(`${CHON_CO_SO} WHERE cs.MaChuSan = ? ORDER BY cs.MaCoSo`, [maChuSan]);
  return cacCoSo;
}

// Cơ sở đầu tiên (dùng cho bước đăng ký và các API cũ không truyền maCoSo).
async function layCoSo(maChuSan) {
  const [cacCoSo] = await pool.query(
    `${CHON_CO_SO} WHERE cs.MaChuSan = ? ORDER BY cs.MaCoSo LIMIT 1`, [maChuSan]);
  return cacCoSo[0] || null;
}

// Một cơ sở theo mã; 404 nếu không phải của chủ sân này (không lộ cơ sở người khác).
async function layCoSoTheoMa(maChuSan, maCoSo) {
  const [cacCoSo] = await pool.query(
    `${CHON_CO_SO} WHERE cs.MaChuSan = ? AND cs.MaCoSo = ?`, [maChuSan, maCoSo]);
  if (!cacCoSo[0]) throw AppError.khongTimThay('Không tìm thấy cơ sở');
  return cacCoSo[0];
}

async function layBangGia(maCoSo, ketNoi = pool) {
  const [khungGias] = await ketNoi.query(
    `SELECT GioBatDau AS gioBatDau, GioKetThuc AS gioKetThuc,
       MAX(CASE WHEN LoaiNgay = 'weekday' AND LoaiKhach = 'walk_in' THEN GiaMoiGio END) AS giaNgayThuongKhachVangLai,
       MAX(CASE WHEN LoaiNgay = 'weekday' AND LoaiKhach = 'fixed' THEN GiaMoiGio END) AS giaNgayThuongKhachCoDinh,
       MAX(CASE WHEN LoaiNgay = 'weekend' AND LoaiKhach = 'walk_in' THEN GiaMoiGio END) AS giaCuoiTuanKhachVangLai,
       MAX(CASE WHEN LoaiNgay = 'weekend' AND LoaiKhach = 'fixed' THEN GiaMoiGio END) AS giaCuoiTuanKhachCoDinh
     FROM BangGia WHERE MaCoSo = ?
     GROUP BY GioBatDau, GioKetThuc ORDER BY GioBatDau`,
    [maCoSo]);
  return khungGias.map((khungGia) => ({
    ...khungGia,
    gioBatDau: String(khungGia.gioBatDau).slice(0, 5),
    gioKetThuc: String(khungGia.gioKetThuc).slice(0, 5),
  }));
}

async function batBuocCoSo(maChuSan) {
  const coSo = await layCoSo(maChuSan);
  if (!coSo) throw AppError.duLieuKhongHopLe('Bạn chưa khai báo thông tin sân (bước 1)');
  return coSo;
}

// Có maCoSo → đúng cơ sở đó (phải của mình); không có → cơ sở đầu tiên (tương thích API cũ).
async function chonCoSo(maChuSan, maCoSo) {
  return maCoSo ? layCoSoTheoMa(maChuSan, maCoSo) : batBuocCoSo(maChuSan);
}

// Cơ sở mới tạo ở trạng thái ẩn; tự hiện cho khách khi đã có ≥1 sân hoạt động + có bảng giá
// và chủ sân đã được admin duyệt (xem sanCoSo.kichHoatCoSoNeuSanSang). Cơ sở `closed` do chủ sân
// tự đóng KHÔNG tự mở lại ở đây — phải gọi PATCH /co-so/:maCoSo/mo.
const kichHoatNeuSanSang = (maCoSo, ketNoi = pool) => sanCoSo.kichHoatCoSoNeuSanSang(ketNoi, maCoSo);

async function xacNhanDuocSua(maChuSan) {
  const hoSo = await layHoSo(maChuSan);
  if (!TRANG_THAI_DUOC_SUA.includes(hoSo.trangThaiDuyet)) {
    throw AppError.biTrung(hoSo.trangThaiDuyet === 'pending'
      ? 'Hồ sơ đang chờ duyệt, không thể chỉnh sửa' : 'Hồ sơ đã duyệt, hãy dùng chức năng chỉnh sửa sân');
  }
}

async function trangThaiDangKy(maChuSan) {
  const hoSo = await layHoSo(maChuSan);
  const coSo = await layCoSo(maChuSan);
  const khungGias = coSo ? await layBangGia(coSo.maCoSo) : [];
  return {
    trangThaiDuyet: hoSo.trangThaiDuyet,
    thongBaoDuyet: thongBaoTheoTrangThai(hoSo.trangThaiDuyet, hoSo.lyDoTuChoi),
    lyDoTuChoi: hoSo.lyDoTuChoi,
    ngayGuiDuyet: hoSo.ngayGuiDuyet,
    tenDoanhNghiep: hoSo.tenDoanhNghiep,
    cacBuoc: {
      doanhNghiep: !!hoSo.tenDoanhNghiep, coSo: !!coSo, bangGia: khungGias.length > 0, nganHang: !!hoSo.soTaiKhoan,
    },
    coSo,
    khungGias,
    thongTinNganHang: {
      tenNganHang: hoSo.tenNganHang,
      maNganHang: hoSo.maNganHang,
      soTaiKhoan: hoSo.soTaiKhoan,
      chuTaiKhoan: hoSo.chuTaiKhoan,
    },
  };
}

// Toạ độ KHÔNG do chủ sân nhập: tự đọc từ link Google Maps (kể cả link rút gọn maps.app.goo.gl).
// Không đọc được: giữ toạ độ cũ nếu link không đổi; link mới mà không đọc được thì để trống
// (tránh tính khoảng cách theo vị trí cũ đã sai).
async function tinhToaDo(linkBanDo, coSoHienTai) {
  const toaDo = await layToaDoTuLink(linkBanDo);
  if (toaDo) return toaDo;
  if (coSoHienTai && coSoHienTai.linkBanDo === linkBanDo) {
    return { viDo: coSoHienTai.viDo ?? null, kinhDo: coSoHienTai.kinhDo ?? null };
  }
  return { viDo: null, kinhDo: null };
}

async function luuBuocCoSo(maChuSan, duLieuCoSo) {
  await xacNhanDuocSua(maChuSan);
  const coSoHienTai = await layCoSo(maChuSan);
  const toaDo = await tinhToaDo(duLieuCoSo.linkBanDo, coSoHienTai);
  const duLieuLuu = [
    duLieuCoSo.tenCoSo, duLieuCoSo.diaChi, duLieuCoSo.soDienThoai,
    duLieuCoSo.linkBanDo, duLieuCoSo.tinhThanh, duLieuCoSo.quanHuyen,
    duLieuCoSo.moTa ?? null, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua,
    duLieuCoSo.soPhutDatToiThieu, duLieuCoSo.soPhutTreToiDa ?? null, toaDo.viDo, toaDo.kinhDo,
  ];

  if (coSoHienTai) {
    const khungGias = await layBangGia(coSoHienTai.maCoSo);
    kiemTraKhungGia(khungGias, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua);
    await pool.query(
      `UPDATE CoSo SET TenCoSo=?, DiaChi=?, SoDienThoai=?, LinkBanDo=?,
       TinhThanh=?, QuanHuyen=?, MoTa=?, GioMoCua=?, GioDongCua=?, SoPhutDatToiThieu=?, SoPhutTreToiDa=COALESCE(?, SoPhutTreToiDa),
       ViDo=?, KinhDo=?
       WHERE MaCoSo=?`,
      [...duLieuLuu, coSoHienTai.maCoSo]);
  } else {
    await pool.query(
      `INSERT INTO CoSo (MaChuSan, TenCoSo, DiaChi, SoDienThoai, LinkBanDo,
       TinhThanh, QuanHuyen, MoTa, GioMoCua, GioDongCua, SoPhutDatToiThieu, SoPhutTreToiDa, ViDo, KinhDo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,COALESCE(?, 15),?,?)`,
      [maChuSan, ...duLieuLuu]);
  }
  return trangThaiDangKy(maChuSan);
}

async function thayBangGia(maChuSan, khungGias, maCoSo) {
  const coSo = await chonCoSo(maChuSan, maCoSo);
  kiemTraKhungGia(khungGias, coSo.gioMoCua.slice(0, 5), coSo.gioDongCua.slice(0, 5));

  const duLieuBangGia = khungGias.flatMap((khungGia) => [
    [coSo.maCoSo, 'weekday', 'walk_in', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaNgayThuongKhachVangLai],
    [coSo.maCoSo, 'weekday', 'fixed', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaNgayThuongKhachCoDinh],
    [coSo.maCoSo, 'weekend', 'walk_in', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaCuoiTuanKhachVangLai],
    [coSo.maCoSo, 'weekend', 'fixed', khungGia.gioBatDau, khungGia.gioKetThuc, khungGia.giaCuoiTuanKhachCoDinh],
  ]);
  const giaThapNhat = Math.min(...khungGias.flatMap((khungGia) => [
    khungGia.giaNgayThuongKhachVangLai,
    khungGia.giaCuoiTuanKhachVangLai,
  ]));

  await thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('DELETE FROM BangGia WHERE MaCoSo = ?', [coSo.maCoSo]);
    await ketNoi.query(
      `INSERT INTO BangGia (MaCoSo, LoaiNgay, LoaiKhach, GioBatDau, GioKetThuc, GiaMoiGio)
       VALUES ?`,
      [duLieuBangGia]);
    await ketNoi.query('UPDATE CoSo SET GiaThapNhat=? WHERE MaCoSo=?', [giaThapNhat, coSo.maCoSo]);
    await kichHoatNeuSanSang(coSo.maCoSo, ketNoi);
  });
  return layBangGia(coSo.maCoSo);
}

// Bảng giá của MỘT cơ sở (trang quản lý bảng giá: chọn cơ sở ở dropdown → hiện danh sách khung giá).
async function layBangGiaCoSo(maChuSan, maCoSo) {
  const coSo = await layCoSoTheoMa(maChuSan, maCoSo);
  return {
    maCoSo: coSo.maCoSo,
    tenCoSo: coSo.tenCoSo,
    gioMoCua: String(coSo.gioMoCua).slice(0, 5),
    gioDongCua: String(coSo.gioDongCua).slice(0, 5),
    khungGias: await layBangGia(coSo.maCoSo),
  };
}

// Thêm MỘT khung giá tuỳ chỉnh vào cơ sở (không đụng các khung đã có). Khung mới phải nằm trong giờ mở cửa
// và không chồng khung cũ. Thêm xong, cơ sở tự hiện cho khách nếu đã đủ điều kiện (có sân hoạt động).
async function themKhungGia(maChuSan, maCoSo, khungMoi) {
  const coSo = await layCoSoTheoMa(maChuSan, maCoSo);
  await thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('SELECT MaCoSo FROM CoSo WHERE MaCoSo=? FOR UPDATE', [coSo.maCoSo]);
    const hienCo = await layBangGia(coSo.maCoSo, ketNoi);
    kiemTraKhungGia([...hienCo, khungMoi], coSo.gioMoCua.slice(0, 5), coSo.gioDongCua.slice(0, 5));
    await ketNoi.query(
      `INSERT INTO BangGia (MaCoSo, LoaiNgay, LoaiKhach, GioBatDau, GioKetThuc, GiaMoiGio) VALUES ?`,
      [[
        [coSo.maCoSo, 'weekday', 'walk_in', khungMoi.gioBatDau, khungMoi.gioKetThuc, khungMoi.giaNgayThuongKhachVangLai],
        [coSo.maCoSo, 'weekday', 'fixed', khungMoi.gioBatDau, khungMoi.gioKetThuc, khungMoi.giaNgayThuongKhachCoDinh],
        [coSo.maCoSo, 'weekend', 'walk_in', khungMoi.gioBatDau, khungMoi.gioKetThuc, khungMoi.giaCuoiTuanKhachVangLai],
        [coSo.maCoSo, 'weekend', 'fixed', khungMoi.gioBatDau, khungMoi.gioKetThuc, khungMoi.giaCuoiTuanKhachCoDinh],
      ]]);
    await ketNoi.query(
      `UPDATE CoSo SET GiaThapNhat=(SELECT MIN(GiaMoiGio) FROM BangGia WHERE MaCoSo=? AND LoaiKhach='walk_in')
       WHERE MaCoSo=?`,
      [coSo.maCoSo, coSo.maCoSo]);
    await kichHoatNeuSanSang(coSo.maCoSo, ketNoi);
  });
  return layBangGiaCoSo(maChuSan, coSo.maCoSo);
}

async function luuBuocBangGia(maChuSan, khungGias) {
  await xacNhanDuocSua(maChuSan);
  await thayBangGia(maChuSan, khungGias);
  return trangThaiDangKy(maChuSan);
}

async function luuBuocNganHang(maChuSan, thongTinNganHang) {
  await pool.query(
    `UPDATE HoSoChuSan SET TenNganHang=?, MaNganHang=?, SoTaiKhoan=?, ChuTaiKhoan=? WHERE MaNguoiDung=?`,
    [thongTinNganHang.tenNganHang, thongTinNganHang.maNganHang, thongTinNganHang.soTaiKhoan, thongTinNganHang.chuTaiKhoan, maChuSan]);
  return trangThaiDangKy(maChuSan);
}

// Đổi tài khoản nhận tiền ở MỌI trạng thái hồ sơ (khách chuyển khoản trực tiếp vào đây).
// Chủ sân chọn ngân hàng bằng `maNganHang` (danh sách GET /tai-khoan/ngan-hang); BE tự lấy tên.
async function doiNganHang(maChuSan, { maNganHang, soTaiKhoan, chuTaiKhoan }) {
  const nganHang = timNganHang(maNganHang);
  if (!nganHang) throw AppError.duLieuKhongHopLe('Ngân hàng không hợp lệ');
  await thucHienGiaoDich(async (ketNoi) => {
    const [[cu]] = await ketNoi.query(
      'SELECT MaNganHang AS maNganHang, SoTaiKhoan AS soTaiKhoan FROM HoSoChuSan WHERE MaNguoiDung=? FOR UPDATE',
      [maChuSan]);
    if (!cu) throw AppError.khongDuQuyen('Tài khoản chủ sân chưa có hồ sơ');
    await ketNoi.query(
      'UPDATE HoSoChuSan SET TenNganHang=?, MaNganHang=?, SoTaiKhoan=?, ChuTaiKhoan=? WHERE MaNguoiDung=?',
      [nganHang.tenNganHang, nganHang.maNganHang, soTaiKhoan, chuTaiKhoan, maChuSan]);
    const che = (so) => (so ? `***${String(so).slice(-4)}` : '(trống)');
    await nhatKy.ghiNhatKy(ketNoi, {
      maNguoiThucHien: maChuSan, hanhDong: 'doi_ngan_hang', doiTuong: 'HoSoChuSan', maDoiTuong: maChuSan,
      chiTiet: `${cu.maNganHang || '-'} ${che(cu.soTaiKhoan)} -> ${nganHang.maNganHang} ${che(soTaiKhoan)}`,
    });
  });
  return (await trangThaiDangKy(maChuSan)).thongTinNganHang;
}

// Gửi lại hồ sơ sau khi bị từ chối. Đăng ký mới đã vào thẳng `pending` với đủ tên doanh nghiệp +
// tài khoản nhận tiền, nên chỉ cần 2 mục này; cơ sở/bảng giá làm sau khi được duyệt.
async function guiHoSoDuyet(maChuSan) {
  await xacNhanDuocSua(maChuSan);
  const mucConThieu = await layMucConThieuHoSo(pool, maChuSan);
  if (mucConThieu.length) throw AppError.duLieuKhongHopLe(`Chưa hoàn thành: ${mucConThieu.join(', ')}`);
  await pool.query(
    `UPDATE HoSoChuSan SET TrangThaiDuyet='pending', NgayGuiDuyet=NOW(), LyDoTuChoi=NULL,
       MaQuanTriDuyet=NULL, NgayDuyet=NULL WHERE MaNguoiDung=?`,
    [maChuSan]);
  return trangThaiDangKy(maChuSan);
}

async function luuBuocDoanhNghiep(maChuSan, { tenDoanhNghiep }) {
  await xacNhanDuocSua(maChuSan);
  await pool.query('UPDATE HoSoChuSan SET TenDoanhNghiep=? WHERE MaNguoiDung=?', [tenDoanhNghiep, maChuSan]);
  return trangThaiDangKy(maChuSan);
}

async function capNhatCoSo(maChuSan, duLieuCoSo, maCoSo) {
  const coSo = await chonCoSo(maChuSan, maCoSo);
  const khungGias = await layBangGia(coSo.maCoSo);
  kiemTraKhungGia(khungGias, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua);
  const toaDo = await tinhToaDo(duLieuCoSo.linkBanDo, coSo);
  await pool.query(
    `UPDATE CoSo SET TenCoSo=?, DiaChi=?, SoDienThoai=?, LinkBanDo=?,
       TinhThanh=?, QuanHuyen=?, MoTa=?, GioMoCua=?, GioDongCua=?, SoPhutDatToiThieu=?, SoPhutTreToiDa=COALESCE(?, SoPhutTreToiDa),
       ViDo=?, KinhDo=?
     WHERE MaCoSo=?`,
    [
      duLieuCoSo.tenCoSo, duLieuCoSo.diaChi, duLieuCoSo.soDienThoai,
      duLieuCoSo.linkBanDo, duLieuCoSo.tinhThanh, duLieuCoSo.quanHuyen,
      duLieuCoSo.moTa ?? null, duLieuCoSo.gioMoCua, duLieuCoSo.gioDongCua,
      duLieuCoSo.soPhutDatToiThieu, duLieuCoSo.soPhutTreToiDa ?? null, toaDo.viDo, toaDo.kinhDo,
      coSo.maCoSo,
    ]);
  return layCoSoTheoMa(maChuSan, coSo.maCoSo);
}

// Thêm cơ sở thứ 2, 3… (chỉ sau khi được duyệt). Bắt đầu ở trạng thái ẩn cho tới khi có sân + giá.
async function taoCoSoMoi(maChuSan, duLieuCoSo) {
  const toaDo = await tinhToaDo(duLieuCoSo.linkBanDo, null);
  const [ketQua] = await pool.query(
    `INSERT INTO CoSo (MaChuSan, TenCoSo, DiaChi, SoDienThoai, LinkBanDo,
       TinhThanh, QuanHuyen, MoTa, GioMoCua, GioDongCua, SoPhutDatToiThieu, SoPhutTreToiDa, ViDo, KinhDo, TrangThai)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,COALESCE(?, 15),?,?, 'hidden')`,
    [
      maChuSan, duLieuCoSo.tenCoSo, duLieuCoSo.diaChi, duLieuCoSo.soDienThoai,
      duLieuCoSo.linkBanDo, duLieuCoSo.tinhThanh,
      duLieuCoSo.quanHuyen, duLieuCoSo.moTa ?? null, duLieuCoSo.gioMoCua,
      duLieuCoSo.gioDongCua, duLieuCoSo.soPhutDatToiThieu, duLieuCoSo.soPhutTreToiDa ?? null,
      toaDo.viDo, toaDo.kinhDo,
    ]);
  return layCoSoTheoMa(maChuSan, ketQua.insertId);
}

// Ảnh mới thành ảnh bìa; ảnh cũ giữ trong gallery. File lưu uploads/coso/cs<maCoSo>-<ms>-<4hex>.<đuôi>.
async function capNhatAnhCoSo(maChuSan, tep, maCoSo) {
  let coSo;
  try {
    coSo = await chonCoSo(maChuSan, maCoSo);
  } catch (loi) {
    await fs.unlink(tep.path).catch(() => {});
    throw loi;
  }
  const duongDan = await luuAnh(tep, 'coso', `cs${coSo.maCoSo}`);
  try {
    await thucHienGiaoDich(async (ketNoi) => {
      await ketNoi.query('UPDATE AnhCoSo SET LaAnhBia=0 WHERE MaCoSo=?', [coSo.maCoSo]);
      await ketNoi.query('INSERT INTO AnhCoSo (MaCoSo, DuongDan, LaAnhBia) VALUES (?,?,1)', [coSo.maCoSo, duongDan]);
    });
  } catch (loi) {
    await xoaAnh(duongDan);
    throw loi;
  }
  return { duongDanAnh: duongDan };
}

// Không truyền maCoSo → sân của TẤT CẢ cơ sở của chủ sân (kèm tên cơ sở).
async function lietKeSan(maChuSan, maCoSo) {
  if (maCoSo) await layCoSoTheoMa(maChuSan, maCoSo);
  const [cacSan] = await pool.query(
    `SELECT s.MaSan AS maSan, s.MaCoSo AS maCoSo, cs.TenCoSo AS tenCoSo,
       s.TenSan AS tenSan, s.TrangThai AS trangThai
     FROM San s JOIN CoSo cs ON cs.MaCoSo = s.MaCoSo
     WHERE cs.MaChuSan = ? ${maCoSo ? 'AND s.MaCoSo = ?' : ''}
     ORDER BY s.MaCoSo, s.MaSan`,
    maCoSo ? [maChuSan, maCoSo] : [maChuSan]);
  return cacSan;
}

// Sân mới LUÔN ở trạng thái chưa hoạt động (`maintenance`): chủ sân phải bật (PATCH /san/:maSan/mo)
// thì sân mới nhận khách. Body có maCoSo → thêm vào cơ sở đó; không có → cơ sở đầu tiên (API cũ).
async function taoSan(maChuSan, duLieuSan) {
  const coSo = await chonCoSo(maChuSan, duLieuSan.maCoSo);
  try {
    const [ketQua] = await pool.query(
      "INSERT INTO San (MaCoSo, TenSan, TrangThai) VALUES (?,?,'maintenance')",
      [coSo.maCoSo, duLieuSan.tenSan]);
    const [[sanMoi]] = await pool.query(
      `SELECT MaSan AS maSan, MaCoSo AS maCoSo, TenSan AS tenSan, TrangThai AS trangThai
       FROM San WHERE MaSan=?`,
      [ketQua.insertId]);
    return sanMoi;
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.biTrung('Tên sân đã tồn tại trong cơ sở này');
    throw loi;
  }
}

async function laySanCuaChu(maChuSan, maSan) {
  const [[san]] = await pool.query(
    `SELECT s.MaSan AS maSan, s.MaCoSo AS maCoSo, s.TenSan AS tenSan, s.TrangThai AS trangThai
     FROM San s JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE s.MaSan=? AND cs.MaChuSan=?`,
    [maSan, maChuSan]);
  if (!san) throw AppError.khongTimThay('Không tìm thấy sân');
  return san;
}

async function capNhatSan(maChuSan, maSan, duLieuSan) {
  const san = await laySanCuaChu(maChuSan, maSan);
  // Chuyển sang bảo trì = đóng sân: phải qua cùng điều kiện (không còn khách/lịch cố định).
  if (duLieuSan.trangThai === 'maintenance' && san.trangThai !== 'maintenance') {
    await sanCoSo.dongSan({ maNguoiDung: maChuSan, vaiTro: 'owner' }, san.maSan);
  }
  // Bật sân (maintenance → active) đi qua cùng đường với PATCH /san/:maSan/mo.
  if (duLieuSan.trangThai === 'active' && san.trangThai !== 'active') {
    await sanCoSo.moSan({ maNguoiDung: maChuSan, vaiTro: 'owner' }, san.maSan);
  }
  try {
    await pool.query(
      'UPDATE San SET TenSan=? WHERE MaSan=?',
      [duLieuSan.tenSan ?? san.tenSan, san.maSan]);
  } catch (loi) {
    if (loi.code === 'ER_DUP_ENTRY') throw AppError.biTrung('Tên sân đã tồn tại');
    throw loi;
  }
  return laySanCuaChu(maChuSan, maSan);
}

// Khóa sân theo khoảng ngày (Task 1.3): mỗi ngày 1 bản ghi KhoaSan cùng khung giờ.
// Tất cả hoặc không: nếu BẤT KỲ ngày nào đã có đơn giữ slot trong khung giờ → 409, không ghi gì (không khóa đè đơn).
// Ngày đã có khóa phủ kín khung giờ này thì bỏ qua (bấm lặp không sinh bản ghi trùng).
async function taoKhoaSan(maChuSan, duLieuKhoa) {
  const san = await laySanCuaChu(maChuSan, duLieuKhoa.maSan);
  const { kieu, cacNgay, gioBatDau, gioKetThuc } = chuanHoaYeuCauKhoa(duLieuKhoa);
  const ngayDau = cacNgay[0];
  const ngayCuoi = cacNgay[cacNgay.length - 1];

  const cacKhoaMoi = await thucHienGiaoDich(async (ketNoi) => {
    await ketNoi.query('SELECT MaSan FROM San WHERE MaSan=? FOR UPDATE', [san.maSan]);
    const [cacDonTrung] = await ketNoi.query(
      `SELECT DATE_FORMAT(NgayChoi, '%Y-%m-%d') AS ngay FROM DatSan
       WHERE MaSan=? AND NgayChoi BETWEEN ? AND ?
         AND ${SLOT_BAN()}
         AND GioBatDau < ? AND GioKetThuc > ?
       ORDER BY NgayChoi FOR UPDATE`,
      [san.maSan, ngayDau, ngayCuoi, gioKetThuc, gioBatDau]);
    if (cacDonTrung.length) {
      const cacNgayTrung = [...new Set(cacDonTrung.map((don) => don.ngay))];
      const hienThi = cacNgayTrung.slice(0, 5).join(', ') + (cacNgayTrung.length > 5 ? ` và ${cacNgayTrung.length - 5} ngày khác` : '');
      throw new AppError(409, `Khung giờ này đã có khách đặt vào ngày ${hienThi}, hãy hủy đơn trước khi khóa`,
        'CONFLICT', { cacNgayTrung });
    }
    const [cacKhoaCo] = await ketNoi.query(
      `SELECT DATE_FORMAT(NgayKhoa, '%Y-%m-%d') AS ngay FROM KhoaSan
       WHERE MaSan=? AND NgayKhoa BETWEEN ? AND ? AND GioBatDau <= ? AND GioKetThuc >= ?`,
      [san.maSan, ngayDau, ngayCuoi, gioBatDau, gioKetThuc]);
    const daKhoa = new Set(cacKhoaCo.map((khoa) => khoa.ngay));
    const ketQuaGhi = [];
    for (const ngay of cacNgay.filter((n) => !daKhoa.has(n))) {
      const [mucKhoa] = await ketNoi.query(
        'INSERT INTO KhoaSan (MaSan, NgayKhoa, GioBatDau, GioKetThuc, LyDo) VALUES (?,?,?,?,?)',
        [san.maSan, ngay, gioBatDau, gioKetThuc, duLieuKhoa.lyDo ?? null]);
      ketQuaGhi.push({ maKhoa: mucKhoa.insertId, ngay });
    }
    return ketQuaGhi;
  });

  if (kieu === 'mot-ngay') {
    // Dạng cũ: giữ nguyên dạng trả về (web/app cũ không đổi).
    return {
      maKhoa: cacKhoaMoi[0]?.maKhoa ?? null,
      maSan: duLieuKhoa.maSan,
      thoiGianBatDau: `${ngayDau} ${gioBatDau}`,
      thoiGianKetThuc: `${ngayDau} ${gioKetThuc}`,
      lyDo: duLieuKhoa.lyDo ?? null,
    };
  }
  return {
    maSan: duLieuKhoa.maSan,
    tuNgay: ngayDau,
    denNgay: ngayCuoi,
    gioBatDau,
    gioKetThuc,
    lyDo: duLieuKhoa.lyDo ?? null,
    soNgayKhoa: cacKhoaMoi.length,
    soNgayBoQua: cacNgay.length - cacKhoaMoi.length,
    cacKhoa: cacKhoaMoi,
  };
}

async function lietKeKhoaSan(maChuSan, boLoc) {
  const thamSo = [maChuSan];
  let truyVan = `SELECT k.MaKhoa AS maKhoa, k.MaSan AS maSan,
      CONCAT(DATE_FORMAT(k.NgayKhoa, '%Y-%m-%d'), ' ', TIME_FORMAT(k.GioBatDau, '%H:%i')) AS thoiGianBatDau,
      CONCAT(DATE_FORMAT(k.NgayKhoa, '%Y-%m-%d'), ' ', TIME_FORMAT(k.GioKetThuc, '%H:%i')) AS thoiGianKetThuc,
      k.LyDo AS lyDo
    FROM KhoaSan k JOIN San s ON s.MaSan=k.MaSan
      JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
    WHERE cs.MaChuSan=?`;
  if (boLoc.maSan) {
    truyVan += ' AND k.MaSan=?';
    thamSo.push(boLoc.maSan);
  }
  if (boLoc.tuNgay) {
    truyVan += ' AND TIMESTAMP(k.NgayKhoa, k.GioKetThuc) >= ?';
    thamSo.push(boLoc.tuNgay);
  }
  if (boLoc.denNgay) {
    truyVan += ' AND TIMESTAMP(k.NgayKhoa, k.GioBatDau) <= ?';
    thamSo.push(boLoc.denNgay);
  }
  const [cacKhoaSan] = await pool.query(`${truyVan} ORDER BY k.NgayKhoa, k.GioBatDau`, thamSo);
  return cacKhoaSan;
}

async function xoaKhoaSan(maChuSan, maKhoa) {
  const [ketQua] = await pool.query(
    `DELETE k FROM KhoaSan k
     JOIN San s ON s.MaSan=k.MaSan
     JOIN CoSo cs ON cs.MaCoSo=s.MaCoSo
     WHERE k.MaKhoa=? AND cs.MaChuSan=?`,
    [maKhoa, maChuSan]);
  if (!ketQua.affectedRows) throw AppError.khongTimThay('Không tìm thấy khóa giờ');
}

module.exports = {
  trangThaiDangKy,
  luuBuocCoSo,
  luuBuocBangGia,
  luuBuocNganHang,
  doiNganHang,
  luuBuocDoanhNghiep,
  guiHoSoDuyet,
  capNhatCoSo,
  thayBangGia,
  layBangGiaCoSo,
  themKhungGia,
  capNhatAnhCoSo,
  layCoSo,
  layDanhSachCoSo,
  layCoSoTheoMa,
  taoCoSoMoi,
  lietKeSan,
  taoSan,
  capNhatSan,
  taoKhoaSan,
  lietKeKhoaSan,
  xoaKhoaSan,
};
