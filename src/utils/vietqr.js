const cauHinh = require('../config/env');

// Dữ liệu cũ có thể lưu mã BIN dạng số; đổi về mã VietQR viết tắt để hiển thị và tạo QR thống nhất.
const BIN_SANG_MA = {
  970436: 'VCB', 970415: 'CTG', 970418: 'BIDV', 970405: 'VBA', 970422: 'MB', 970407: 'TCB',
  970416: 'ACB', 970432: 'VPB', 970423: 'TPB', 970403: 'STB', 970437: 'HDB', 970441: 'VIB',
  970443: 'SHB', 970448: 'OCB', 970426: 'MSB', 970429: 'SCB', 970431: 'EIB', 970449: 'LPB',
  970440: 'SEAB',
};

// Mã VietQR viết tắt → mã BIN 6 số của NAPAS (dùng khi tự dựng nội dung QR, không cần trang ngoài).
const MA_SANG_BIN = {
  ...Object.fromEntries(Object.entries(BIN_SANG_MA).map(([bin, ma]) => [ma, bin])),
  NAB: '970428', BAB: '970409', ABB: '970425', VAB: '970427', PVCB: '970412', NCB: '970419',
  KLB: '970452', BVB: '970438', CAKE: '546034', Ubank: '546035', TIMO: '963388',
};

// Tài khoản nhận tiền của chủ sân sở hữu sân được đặt (HoSoChuSan, chủ sân nhập khi đăng ký).
// Chưa có thì dùng tài khoản dự phòng BANK_* trong .env (nếu có); không có cả hai thì trả null.
function chuanHoaTaiKhoan(hang) {
  const maGoc = (hang?.maNganHang || '').trim();
  const maNganHang = BIN_SANG_MA[maGoc] || maGoc;
  const soTaiKhoan = (hang?.soTaiKhoan || '').trim();
  if (!maNganHang || !soTaiKhoan) return null;
  return {
    tenNganHang: (hang.tenNganHang || '').trim(),
    maNganHang,
    soTaiKhoan,
    chuTaiKhoan: (hang.chuTaiKhoan || '').trim(),
  };
}

const SQL_TAI_KHOAN = `SELECT h.TenNganHang AS tenNganHang, h.MaNganHang AS maNganHang,
    h.SoTaiKhoan AS soTaiKhoan, h.ChuTaiKhoan AS chuTaiKhoan FROM HoSoChuSan h`;

async function layTaiKhoanChuSan(ketNoi, maChuSan) {
  let taiKhoan = null;
  if (maChuSan != null) {
    const [[hang]] = await ketNoi.query(`${SQL_TAI_KHOAN} WHERE h.MaNguoiDung=?`, [maChuSan]);
    taiKhoan = chuanHoaTaiKhoan(hang);
  }
  return taiKhoan || chuanHoaTaiKhoan(cauHinh.nganHang);
}

// Tài khoản nhận tiền của đơn: chủ sân của cơ sở chứa sân trong đơn.
async function layTaiKhoanNhanTheoDatSan(ketNoi, maDatSan) {
  const [[hang]] = await ketNoi.query(
    `${SQL_TAI_KHOAN}
     JOIN CoSo cs ON cs.MaChuSan=h.MaNguoiDung
     JOIN San s ON s.MaCoSo=cs.MaCoSo
     JOIN DatSan d ON d.MaSan=s.MaSan
     WHERE d.MaDatSan=?`, [maDatSan]);
  return chuanHoaTaiKhoan(hang) || chuanHoaTaiKhoan(cauHinh.nganHang);
}

// Ảnh QR VietQR thật (img.vietqr.io, không cần khoá API): mở app ngân hàng quét là tự điền
// số tài khoản, số tiền và nội dung chuyển khoản. Trả null nếu chưa có tài khoản nhận tiền.
function taoAnhQrUrl(noiDungChuyenKhoan, soTien, taiKhoan) {
  if (!taiKhoan) return null;
  const url = new URL(
    `https://img.vietqr.io/image/${encodeURIComponent(taiKhoan.maNganHang)}-${encodeURIComponent(taiKhoan.soTaiKhoan)}-compact2.png`);
  url.searchParams.set('amount', String(soTien));
  url.searchParams.set('addInfo', noiDungChuyenKhoan);
  if (taiKhoan.chuTaiKhoan) url.searchParams.set('accountName', taiKhoan.chuTaiKhoan);
  return url.toString();
}

// ---- Tự tạo nội dung QR VietQR (chuẩn NAPAS 247 / EMVCo), vẽ ngay trong app, không cần mạng ----
const tlv = (tag, giaTri) => `${tag}${String(giaTri.length).padStart(2, '0')}${giaTri}`;

// CRC16-CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF) theo yêu cầu của EMVCo.
function crc16(chuoi) {
  let crc = 0xffff;
  for (const byte of Buffer.from(chuoi, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Nội dung chỉ gồm chữ không dấu, số, khoảng trắng; tối đa 25 ký tự để mọi app ngân hàng đọc được.
const lamSachNoiDung = (noiDung) => String(noiDung || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 25);

// Trả chuỗi để app vẽ thành mã QR; null nếu chưa có tài khoản hoặc chưa biết BIN ngân hàng.
function taoNoiDungQr(noiDungChuyenKhoan, soTien, taiKhoan) {
  if (!taiKhoan) return null;
  const bin = /^\d{6}$/.test(taiKhoan.maNganHang) ? taiKhoan.maNganHang : MA_SANG_BIN[taiKhoan.maNganHang];
  if (!bin || !taiKhoan.soTaiKhoan) return null;
  const nguoiNhan = tlv('00', bin) + tlv('01', taiKhoan.soTaiKhoan);
  const thongTinTaiKhoan = tlv('00', 'A000000727') + tlv('01', nguoiNhan) + tlv('02', 'QRIBFTTA');
  const noiDung = lamSachNoiDung(noiDungChuyenKhoan);
  const phanDau = tlv('00', '01') + tlv('01', '12') + tlv('38', thongTinTaiKhoan)
    + tlv('53', '704') + tlv('54', String(Math.round(Number(soTien))))
    + tlv('58', 'VN') + (noiDung ? tlv('62', tlv('08', noiDung)) : '') + '6304';
  return phanDau + crc16(phanDau);
}

module.exports = { crc16, taoNoiDungQr, taoAnhQrUrl, layTaiKhoanChuSan, layTaiKhoanNhanTheoDatSan };
