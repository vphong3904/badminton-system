const ungDung = require('./app');
const cauHinh = require('./config/env');
const { pool } = require('./config/db');
const { batDauJob: batDauJobHoanThanhDon } = require('./jobs/hoanThanhDon');
const { batDauJob: batDauJobHetHanGiuCho } = require('./jobs/hetHanGiuCho');
const { batDauJob: batDauJobHanHoan } = require('./jobs/hanHoan');

async function khoiDongServer() {
    try {
        // Kiểm tra kết nối MySQL
        const ketNoi = await pool.getConnection();

        console.log('✅ Kết nối MySQL thành công!');
        console.log(`📦 Database: ${cauHinh.coSoDuLieu.ten}`);

        ketNoi.release();

        // Khởi động API sau khi DB kết nối thành công
        ungDung.listen(cauHinh.cong, '0.0.0.0', () => {
            console.log(`🚀 API chạy tại port ${cauHinh.cong}`);
        });

        // Job nền: đơn confirmed đã qua giờ chơi → completed + nhắc khách đánh giá.
        batDauJobHoanThanhDon();
        // Job nền: nhả slot các đợt đặt quá hạn giữ chỗ (chưa gửi ảnh chuyển khoản).
        batDauJobHetHanGiuCho();
        // Job nền: khoản hoàn tiền quá hạn → nhắc chủ sân, quá gia hạn → leo thang Admin.
        batDauJobHanHoan();

    } catch (loi) {
        console.error('❌ Kết nối MySQL thất bại:', loi.message);
        process.exit(1);
    }
}

khoiDongServer();