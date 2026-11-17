// Danh sách ngân hàng cho ô "Chọn ngân hàng" khi đăng ký chủ sân.
// `maNganHang` là mã VietQR (img.vietqr.io nhận mã viết tắt này), dùng để tạo QR thanh toán;
// `tenNganHang` là tên hiển thị lưu vào HoSoChuSan. Client chỉ gửi `maNganHang`, BE tự lấy tên.
const DANH_SACH_NGAN_HANG = [
  { maNganHang: 'VCB', tenNganHang: 'Vietcombank' },
  { maNganHang: 'CTG', tenNganHang: 'VietinBank' },
  { maNganHang: 'BIDV', tenNganHang: 'BIDV' },
  { maNganHang: 'VBA', tenNganHang: 'Agribank' },
  { maNganHang: 'MB', tenNganHang: 'MB Bank' },
  { maNganHang: 'TCB', tenNganHang: 'Techcombank' },
  { maNganHang: 'ACB', tenNganHang: 'ACB' },
  { maNganHang: 'VPB', tenNganHang: 'VPBank' },
  { maNganHang: 'TPB', tenNganHang: 'TPBank' },
  { maNganHang: 'STB', tenNganHang: 'Sacombank' },
  { maNganHang: 'HDB', tenNganHang: 'HDBank' },
  { maNganHang: 'VIB', tenNganHang: 'VIB' },
  { maNganHang: 'SHB', tenNganHang: 'SHB' },
  { maNganHang: 'OCB', tenNganHang: 'OCB' },
  { maNganHang: 'MSB', tenNganHang: 'MSB' },
  { maNganHang: 'SCB', tenNganHang: 'SCB' },
  { maNganHang: 'EIB', tenNganHang: 'Eximbank' },
  { maNganHang: 'LPB', tenNganHang: 'LPBank' },
  { maNganHang: 'SEAB', tenNganHang: 'SeABank' },
  { maNganHang: 'NAB', tenNganHang: 'Nam A Bank' },
  { maNganHang: 'BAB', tenNganHang: 'Bac A Bank' },
  { maNganHang: 'ABB', tenNganHang: 'ABBANK' },
  { maNganHang: 'VAB', tenNganHang: 'VietABank' },
  { maNganHang: 'PVCB', tenNganHang: 'PVcomBank' },
  { maNganHang: 'NCB', tenNganHang: 'NCB' },
  { maNganHang: 'KLB', tenNganHang: 'KienlongBank' },
  { maNganHang: 'BVB', tenNganHang: 'BaoVietBank' },
  { maNganHang: 'CAKE', tenNganHang: 'CAKE by VPBank' },
  { maNganHang: 'Ubank', tenNganHang: 'Ubank by VPBank' },
  { maNganHang: 'TIMO', tenNganHang: 'Timo' },
];

const THEO_MA = new Map(DANH_SACH_NGAN_HANG.map((nganHang) => [nganHang.maNganHang, nganHang]));

function timNganHang(maNganHang) {
  return THEO_MA.get(String(maNganHang ?? '').trim()) || null;
}

module.exports = { DANH_SACH_NGAN_HANG, timNganHang };
