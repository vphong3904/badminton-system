const app = require('./app');
const env = require('./config/env');
app.listen(env.port, () => console.log(`API chạy tại http://localhost:${env.port}/api`));
