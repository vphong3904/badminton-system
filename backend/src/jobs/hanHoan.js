const { thucHienGiaoDich } = require('../config/db');
const cauHinh = require('../config/env');
const hoanTienService = require('../services/hoanTienService');

// Job nền (G4.5): hạn hoàn tiền. Giờ so sánh là NOW() của MySQL.
//  - Khoản `processing`/`not_received` quá HanHoan (= lúc tạo + refund_deadline_hours) → nhắc chủ sân (1 lần).
//  - Quá HanHoan + refund_grace_hours mà vẫn chưa hoàn → `escalated` + báo Admin (thang bậc khóa nhận đặt mới: G5).
let dangChay = false;

const chayMotLan = () => thucHienGiaoDich((ketNoi) => hoanTienService.chayJobHanHoan(ketNoi));

// Chạy định kỳ bằng setInterval (mặc định 10 phút, đổi bằng JOB_HAN_HOAN_PHUT). Không chạy khi NODE_ENV=test.
function batDauJob() {
  if (cauHinh.moiTruong === 'test') return null;
  const luot = async () => {
    if (dangChay) return;
    dangChay = true;
    try {
      const ketQua = await chayMotLan();
      if (ketQua.soNhac || ketQua.soLeoThang) {
        console.log(`[job-han-hoan] nhắc ${ketQua.soNhac} khoản, leo thang ${ketQua.soLeoThang} khoản`);
      }
    } catch (loi) {
      console.error('[job-han-hoan] Lỗi:', loi.message);
    } finally {
      dangChay = false;
    }
  };
  const hen = setInterval(luot, cauHinh.jobHanHoanPhut * 60 * 1000);
  hen.unref();
  luot();
  return hen;
}

module.exports = { chayMotLan, batDauJob };
