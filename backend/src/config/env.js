const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const cauHinh = {
  cong: Number(process.env.PORT || 3000),
  moiTruong: process.env.NODE_ENV || 'development',
  coSoDuLieu: {
    mayChu: process.env.DB_HOST || 'localhost',
    cong: Number(process.env.DB_PORT || 3306),
    nguoiDung: process.env.DB_USER || 'root',
    matKhau: process.env.DB_PASSWORD || '',
    ten: process.env.DB_NAME || 'db_sancaulong',
  },
  khoaBiMat: process.env.JWT_SECRET || 'dev_secret',
  thoiHanMaTruyCap: process.env.JWT_EXPIRES_IN || '7d',
  nguonTruyCap: process.env.CORS_ORIGIN || '*',
  // Tài khoản DỰ PHÒNG (tuỳ chọn): chỉ dùng khi chủ sân chưa nhập tài khoản ngân hàng trong HoSoChuSan.
  nganHang: {
    maNganHang: (process.env.BANK_CODE || '').trim(), // vd VIB, VCB, MB (hoặc mã BIN)
    soTaiKhoan: (process.env.BANK_ACCOUNT_NUMBER || '').trim(),
    chuTaiKhoan: (process.env.BANK_ACCOUNT_NAME || '').trim(), // vd TRINH THI NGOC LAN
  },
};

if (cauHinh.moiTruong === 'production' && cauHinh.khoaBiMat === 'dev_secret') {
  throw new Error('Phải đặt JWT_SECRET khi chạy production');
}
module.exports = cauHinh;
