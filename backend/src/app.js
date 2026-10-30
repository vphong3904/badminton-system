const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cauHinh = require('./config/env');
const { hoBoi } = require('./config/db');
const xuLyBatDongBo = require('./utils/asyncHandler');
const { thanhCong } = require('./utils/response');
const { thuMucTepTaiLen } = require('./middlewares/upload');
const { khongTimThayDuongDan, xuLyLoi } = require('./middlewares/errorHandler');

const ungDung = express();
ungDung.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
ungDung.use(cors({ origin: cauHinh.nguonTruyCap === '*' ? true : cauHinh.nguonTruyCap.split(',') }));
ungDung.use(express.json({ limit: '1mb' }));
if (cauHinh.moiTruong !== 'test') ungDung.use(morgan('dev'));
ungDung.use('/tep-tai-len', express.static(thuMucTepTaiLen));
ungDung.get('/api/suc-khoe', (_yeuCau, phanHoi) => thanhCong(phanHoi, {
  trangThai: 'ok',
  thoiGian: new Date().toISOString(),
}));
ungDung.get('/api/suc-khoe/co-so-du-lieu', xuLyBatDongBo(async (_yeuCau, phanHoi) => {
  await hoBoi.query('SELECT 1');
  thanhCong(phanHoi, { tenCoSoDuLieu: 'db_sancaulong', trangThai: 'ok' });
}));
ungDung.use('/api/tai-khoan', require('./routes/auth'));
ungDung.use('/api/chu-san', require('./routes/owner'));
ungDung.use(khongTimThayDuongDan);
ungDung.use(xuLyLoi);

module.exports = ungDung;
