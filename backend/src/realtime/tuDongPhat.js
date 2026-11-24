// Middleware: SAU MỖI yêu cầu ghi (POST/PUT/PATCH/DELETE) thành công, phát `du-lieu:doi` để mọi màn
// đang mở tự tải lại — không phải sửa từng controller. Gắn một lần ở app.js, trước các route.
// Phát lúc `finish` nên service đã commit xong. Chưa khởi tạo Socket.IO (test, script) → no-op.
// Chat / cộng đồng / thông báo đã có sự kiện riêng nên bỏ qua; đơn đặt sân đã có `dat-san:cap-nhat` + `lich-san:doi`.
const { phatDuLieuDoi, phatDangKySuKienDoi, phatSuKienDoi, phatKhieuNaiDoi, phatDanhGiaDoi } = require('./duLieu');
const { phatCapNhatDatSan } = require('./datSan');
const { pool } = require('../config/db');
const { layIo } = require('./phat');

const BO_QUA = /\/(chat|tim-nguoi|doi-nhom|cong-dong|thong-bao|tai-khoan)(\/|$)|\/chu-san\/dang-ky(\/|$)/;
// khop → loai; chung: thay đổi công khai (ai đang mở app cũng thấy); admin: báo phòng Admin.
const QUY_TAC = [
  { khop: /\/(dang-ky-su-kien|su-kien)(\/|$)/, loai: 'su-kien', chung: true },
  { khop: /\/khoa-san(\/|$)/, loai: 'lich', chung: true },
  { khop: /\/(co-so|san|bang-gia)(\/|$)/, loai: 'co-so', chung: true },
  { khop: /\/danh-gia(\/|$)/, loai: 'danh-gia', chung: true },
  { khop: /\/(khieu-nai|khang-nghi)(\/|$)/, loai: 'khieu-nai', admin: true },
  { khop: /\/hoan-tien(\/|$)/, loai: 'hoan-tien', admin: true },
  { khop: /\/(dat-san|thanh-toan|check-in|qr)(\/|$)/, loai: 'dat-san' },
  { khop: /\/yeu-thich(\/|$)/, loai: 'yeu-thich' },
];

const so = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

// Lấy mã từ URL (không dựa vào req.params vì lúc `finish` router lồng nhau có thể đã đổi/khôi phục).
function thamSoTuUrl(duongDan) {
  const lay = (re) => { const r = duongDan.match(re); return r ? r[1] : undefined; };
  const laKhach = /\/khach\//.test(duongDan);
  return {
    maDangKy: lay(/\/dang-ky-su-kien\/(\d+)/),
    maSuKien: lay(/(?:^|\/)su-kien\/(\d+)/),
    maDatSan: lay(/\/dat-san\/(\d+)/),
    maCoSo: lay(/\/co-so\/(\d+)/),
    maHoanTien: laKhach ? lay(/\/hoan-tien\/(\d+)/) : undefined,
    maThanhToan: laKhach ? undefined : lay(/\/hoan-tien\/(\d+)/),
    maKhieuNai: lay(/\/khieu-nai\/(\d+)/),
    maKhangNghi: lay(/\/khang-nghi\/(\d+)/),
    maDanhGia: lay(/\/danh-gia\/(\d+)/),
  };
}

async function phatDoiTac(p, duongDan) {
  // Sự kiện: khách ↔ chủ sân
  if (p.maDangKy) await phatDangKySuKienDoi(p.maDangKy);
  else if (p.maSuKien && /\/dang-ky(\/|$)/.test(duongDan)) await phatSuKienDoi(p.maSuKien);
  // Hoàn tiền: khách ↔ chủ sân ↔ Admin (cập nhật đơn của cả hai bên)
  if (p.maHoanTien) {
    const [[h]] = await pool.query('SELECT MaDatSan AS maDatSan FROM HoanTien WHERE MaHoanTien=?', [p.maHoanTien]);
    if (h) await phatCapNhatDatSan(h.maDatSan);
  } else if (p.maThanhToan && /\/hoan-tien\//.test(duongDan)) {
    const [[t]] = await pool.query('SELECT MaDatSan AS maDatSan FROM ThanhToan WHERE MaThanhToan=?', [p.maThanhToan]);
    if (t) await phatCapNhatDatSan(t.maDatSan);
  }
  // Khiếu nại / kháng nghị
  if (p.maKhieuNai) await phatKhieuNaiDoi({ maKhieuNai: p.maKhieuNai });
  else if (p.maKhangNghi) await phatKhieuNaiDoi({ maKhangNghi: p.maKhangNghi });
  else if (p.maDatSan && /\/khieu-nai(\/|$)/.test(duongDan)) await phatKhieuNaiDoi({ maDatSan: p.maDatSan });
  else if (p.maHoanTien && /\/khieu-nai(\/|$)/.test(duongDan)) {
    const [[h]] = await pool.query('SELECT MaDatSan AS maDatSan FROM HoanTien WHERE MaHoanTien=?', [p.maHoanTien]);
    if (h) await phatKhieuNaiDoi({ maDatSan: h.maDatSan });
  }
  // Đánh giá: chủ sân phản hồi / Admin ẩn → báo khách đã viết
  if (p.maDanhGia) await phatDanhGiaDoi(p.maDanhGia);
}

function tuDongPhat(yeuCau, phanHoi, tiep) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(yeuCau.method)) return tiep();
  phanHoi.on('finish', () => {
    if (phanHoi.statusCode >= 400 || !layIo()) return; // chưa bật Socket.IO (test/script) → bỏ qua, không đụng DB
    const duongDan = String(yeuCau.originalUrl || '').split('?')[0];
    if (BO_QUA.test(duongDan)) return;
    const cacLoai = QUY_TAC.filter((q) => q.khop.test(duongDan));
    if (cacLoai.length === 0) return;
    const nguoiThucHien = yeuCau.nguoiDung?.maNguoiDung ?? null;
    const thamSo = thamSoTuUrl(duongDan);
    const ma = {
      hanhDong: yeuCau.method,
      maCoSo: so(thamSo.maCoSo ?? yeuCau.body?.maCoSo),
      maSuKien: so(thamSo.maSuKien),
      maDangKy: so(thamSo.maDangKy),
      maDatSan: so(thamSo.maDatSan),
    };
    try {
      for (const q of cacLoai) {
        phatDuLieuDoi(q.loai, ma, { nguoiNhan: [nguoiThucHien], chung: !!q.chung, admin: !!q.admin });
      }
      phatDoiTac(thamSo, duongDan).catch((loi) => console.error('[realtime] phát đối tác lỗi:', loi.message));
    } catch (loi) {
      console.error('[realtime] tự động phát lỗi:', loi.message);
    }
  });
  return tiep();
}

module.exports = { tuDongPhat };
