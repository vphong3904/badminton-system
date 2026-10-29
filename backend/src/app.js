// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors(), express.json());
app.use('/api/v1', require('./routes'));
app.use(require('./middlewares/errorHandler'));
module.exports = app;