const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sepayDoLechThoiGianToiDa = Number(process.env.SEPAY_WEBHOOK_MAX_SKEW_SECONDS || 300);
if (!Number.isSafeInteger(sepayDoLechThoiGianToiDa)
  || sepayDoLechThoiGianToiDa < 1 || sepayDoLechThoiGianToiDa > 3600) {
  throw new Error('SEPAY_WEBHOOK_MAX_SKEW_SECONDS phải là số nguyên từ 1 đến 3600');
}

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
  sepayWebhookSecret: (process.env.SEPAY_WEBHOOK_SECRET || '').trim(),
  sepayTaiKhoan: (process.env.SEPAY_BANK_ACCOUNT || '').trim(),
  sepayNganHang: (process.env.SEPAY_BANK_CODE || '').trim(),
  sepayDoLechThoiGianToiDa,
};

if (cauHinh.moiTruong === 'production' && cauHinh.khoaBiMat === 'dev_secret') {
  throw new Error('Phải đặt JWT_SECRET khi chạy production');
}
if (cauHinh.moiTruong === 'production'
  && (!cauHinh.sepayWebhookSecret || !cauHinh.sepayTaiKhoan || !cauHinh.sepayNganHang)) {
  throw new Error('Phải cấu hình SEPAY_WEBHOOK_SECRET, SEPAY_BANK_ACCOUNT và SEPAY_BANK_CODE khi chạy production');
}
module.exports = cauHinh;
