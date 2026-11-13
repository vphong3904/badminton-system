const cauHinh = require('../config/env');

// Tài khoản nhận tiền của chủ sân sở hữu sân được đặt (HoSoChuSan, chủ sân nhập khi đăng ký).
// Chưa có thì dùng tài khoản dự phòng BANK_* trong .env (nếu có); không có cả hai thì trả null.
function chuanHoaTaiKhoan(hang) {
  const maNganHang = (hang?.maNganHang || '').trim();
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

module.exports = { taoAnhQrUrl, layTaiKhoanChuSan, layTaiKhoanNhanTheoDatSan };
