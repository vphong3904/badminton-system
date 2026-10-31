const express = require('express');
const dieuKhien = require('../controllers/paymentController');
const { sepayWebhookSecret } = require('../config/env');

const dinhTuyen = express.Router();
dinhTuyen.post('/',
  express.raw({ type: '*/*', limit: '64kb' }),
  sepayWebhookSecret ? dieuKhien.webhookSePay : dieuKhien.thieuCauHinhWebhook);

module.exports = dinhTuyen;
