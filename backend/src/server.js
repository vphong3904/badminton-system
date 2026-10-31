const ungDung = require('./app');
const cauHinh = require('./config/env');
const { pool } = require('./config/db');

async function khoiDongServer() {
    try {
        // Kiểm tra kết nối MySQL
        const ketNoi = await pool.getConnection();

        console.log('✅ Kết nối MySQL thành công!');
        console.log(`📦 Database: ${cauHinh.coSoDuLieu.ten}`);

        ketNoi.release();

        // Khởi động API sau khi DB kết nối thành công
        ungDung.listen(cauHinh.cong, () => {
            console.log(`🚀 API chạy tại http://localhost:${cauHinh.cong}/api`);
        });

    } catch (loi) {
        console.error('❌ Kết nối MySQL thất bại:', loi.message);
        process.exit(1);
    }
}

khoiDongServer();