const app = require('./app');
app.listen(process.env.PORT, () => console.log('Server chạy cổng', process.env.PORT));
// require('./jobs'); // bật ở bước 8