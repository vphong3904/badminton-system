const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const taiLieuApi = require('./config/openapi');
const cauHinh = require('./config/env');
const { pool } = require('./config/db');
const xuLyBatDongBo = require('./utils/asyncHandler');
const { thanhCong } = require('./utils/response');
const { thuMucTepTaiLen } = require('./middlewares/upload');
const { khongTimThayDuongDan, xuLyLoi } = require('./middlewares/errorHandler');

const ungDung = express();
ungDung.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
ungDung.use(cors({ origin: cauHinh.nguonTruyCap === '*' ? true : cauHinh.nguonTruyCap.split(',') }));
ungDung.use('/api/webhooks/sepay', require('./routes/sepayWebhook'));
ungDung.use(express.json({ limit: '1mb' }));
if (cauHinh.moiTruong !== 'test') ungDung.use(morgan('dev'));
ungDung.use('/tep-tai-len', express.static(thuMucTepTaiLen));
ungDung.get('/api-docs/openapi.json', (_yeuCau, phanHoi) => phanHoi.json(taiLieuApi));
ungDung.use('/api-docs', swaggerUi.serve, swaggerUi.setup(taiLieuApi, {
  explorer: true,
  customSiteTitle: 'Badminton System API',
  swaggerOptions: {
    displayRequestDuration: true,
    filter: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
}));
ungDung.get('/api/suc-khoe', (_yeuCau, phanHoi) => thanhCong(phanHoi, {
  trangThai: 'ok',
  thoiGian: new Date().toISOString(),
}));
ungDung.get('/api/suc-khoe/co-so-du-lieu', xuLyBatDongBo(async (_yeuCau, phanHoi) => {
  await pool.query('SELECT 1');
  thanhCong(phanHoi, { tenCoSoDuLieu: 'db_sancaulong', trangThai: 'ok' });
}));
ungDung.use('/api/tai-khoan', require('./routes/auth'));
ungDung.use('/api/khach', require('./routes/customer'));
ungDung.use('/api/thanh-toan', require('./routes/payment'));
ungDung.use('/api/chu-san', require('./routes/owner'));
ungDung.use('/api/quan-tri', require('./routes/admin'));
ungDung.use(khongTimThayDuongDan);
ungDung.use(xuLyLoi);

module.exports = ungDung;
