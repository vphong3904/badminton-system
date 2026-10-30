const ungDung = require('./app');
const cauHinh = require('./config/env');
ungDung.listen(cauHinh.cong, () => console.log(`API chạy tại http://localhost:${cauHinh.cong}/api`));
