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
const { tuDongPhat } = require('./realtime/tuDongPhat');

const ungDung = express();
ungDung.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
ungDung.use(cors({ origin: cauHinh.nguonTruyCap === '*' ? true : cauHinh.nguonTruyCap.split(',') }));
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
// G9.A4: giờ máy chủ theo NOW() của MySQL (cùng nguồn giờ với mọi hạn nghiệp vụ). FE chỉ dùng để hiển thị/đếm ngược.
ungDung.get('/api/gio-may-chu', xuLyBatDongBo(async (_yeuCau, phanHoi) => {
  const [[dong]] = await pool.query(
    `SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS ngay, DATE_FORMAT(NOW(), '%H:%i:%s') AS gio,
            ROUND(UNIX_TIMESTAMP(NOW(3)) * 1000) AS epochMs`);
  const mui = '+07:00';
  thanhCong(phanHoi, {
    iso: `${dong.ngay}T${dong.gio}${mui}`, epochMs: Number(dong.epochMs), mui, ngay: dong.ngay, gio: dong.gio,
  });
}));
ungDung.get('/api/suc-khoe/co-so-du-lieu', xuLyBatDongBo(async (_yeuCau, phanHoi) => {
  await pool.query('SELECT 1');
  thanhCong(phanHoi, { tenCoSoDuLieu: 'db_sancaulong', trangThai: 'ok' });
}));
// Realtime: sau mỗi yêu cầu ghi thành công → phát `du-lieu:doi` (xem realtime/tuDongPhat.js).
ungDung.use('/api', tuDongPhat);
ungDung.use('/api', require('./routes/suKien'));
ungDung.use('/api/tai-khoan', require('./routes/auth'));
ungDung.use('/api/khach', require('./routes/customer'));
ungDung.use('/api/khach/chat', require('./routes/communityChat'));
ungDung.use('/api/khach', require('./routes/community'));
ungDung.use('/api/thanh-toan', require('./routes/payment'));
ungDung.use('/api/thong-bao', require('./routes/notification'));
ungDung.use('/api/chu-san', require('./routes/owner'));
ungDung.use('/api/quan-tri', require('./routes/admin'));
ungDung.use(khongTimThayDuongDan);
ungDung.use(xuLyLoi);

module.exports = ungDung;
