const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { uploadDir } = require('./middlewares/upload');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
app.use(express.json({ limit: '1mb' }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));
app.use('/uploads', express.static(uploadDir));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
