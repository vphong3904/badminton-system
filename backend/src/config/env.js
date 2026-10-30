require('dotenv').config();

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
};

if (cauHinh.moiTruong === 'production' && cauHinh.khoaBiMat === 'dev_secret') {
  throw new Error('Phải đặt JWT_SECRET khi chạy production');
}
module.exports = cauHinh;
