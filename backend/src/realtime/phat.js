// Điểm phát sự kiện Socket.IO DUY NHẤT của backend (G8.0).
// Quy tắc: chỉ là tín hiệu/đẩy dữ liệu nhẹ (không tiền/chứng từ); REST + DB vẫn là nguồn sự thật.
// Luôn gọi SAU khi transaction commit. Chưa khởi tạo Socket.IO (test, script) → các hàm là no-op.
// Lỗi phát không bao giờ làm hỏng nghiệp vụ.
const tienTo = {
  nguoiDung: 'user:',
  phong: 'phong:',
  lich: 'lich:',
};
const PHONG_ADMIN = 'admin';
// Độ trễ khi KHÔNG bắt được thời điểm commit (vd guiThongBao chạy chung ketNoi của giao dịch).
const TRE_SAU_GIAO_DICH_MS = 300;

let io = null;

function datIo(maychu) { io = maychu; }
function layIo() { return io; }

const tenPhongNguoiDung = (maNguoiDung) => `${tienTo.nguoiDung}${Number(maNguoiDung)}`;
const tenPhongChat = (maPhong) => `${tienTo.phong}${Number(maPhong)}`;
const tenPhongLich = (maCoSo, ngay) => `${tienTo.lich}${Number(maCoSo)}:${ngay}`;

function phat(tenPhong, suKien, duLieu) {
  if (!io) return;
  try {
    io.to(tenPhong).emit(suKien, duLieu);
  } catch (loi) {
    console.error(`[realtime] phát "${suKien}" tới ${tenPhong} lỗi:`, loi.message);
  }
}

// Phát tới mọi socket của một người dùng (thông báo, cập nhật đơn của chính họ).
function phatChoNguoiDung(maNguoiDung, suKien, duLieu) {
  if (maNguoiDung == null) return;
  phat(tenPhongNguoiDung(maNguoiDung), suKien, duLieu);
}

// Phát tới phòng chat (chỉ socket đã `chat:vao` hợp lệ mới ở trong phòng).
function phatChoPhong(maPhong, suKien, duLieu) {
  if (maPhong == null) return;
  phat(tenPhongChat(maPhong), suKien, duLieu);
}

// Gỡ toàn bộ socket của một người dùng khỏi phòng chat ngay sau khi họ bị xóa.
function xoaNguoiDungKhoiPhong(maNguoiDung, maPhong) {
  if (!io || maNguoiDung == null || maPhong == null) return;
  try { io.in(tenPhongNguoiDung(maNguoiDung)).socketsLeave(tenPhongChat(maPhong)); }
  catch (loi) { console.error('[realtime] không thể gỡ người dùng khỏi phòng:', loi.message); }
}

// Phát `lich-san:doi` tới người đang mở lịch sân của cơ sở/ngày đó.
// cacSlot: [{maSan, gioBatDau, gioKetThuc, trangThai}] — các khung giờ vừa đổi.
function phatLichSan(maCoSo, ngay, cacSlot) {
  if (maCoSo == null || !ngay) return;
  const ngayChuoi = ngay instanceof Date ? ngay.toISOString().slice(0, 10) : String(ngay).slice(0, 10);
  phat(tenPhongLich(maCoSo, ngayChuoi), 'lich-san:doi', {
    maCoSo: Number(maCoSo), ngay: ngayChuoi, cacSlot: Array.isArray(cacSlot) ? cacSlot : [],
  });
}

// Phát tới mọi Admin đang kết nối (vd `bao-cao:moi`).
function phatChoAdmin(suKien, duLieu) {
  phat(PHONG_ADMIN, suKien, duLieu);
}

// Chạy `hamPhat` sau khi giao dịch hiện tại kịp commit (dùng khi không có điểm "sau commit" rõ ràng).
function phatSauGiaoDich(hamPhat) {
  if (!io) return;
  const hen = setTimeout(() => {
    try { hamPhat(); } catch (loi) { console.error('[realtime] phát trễ lỗi:', loi.message); }
  }, TRE_SAU_GIAO_DICH_MS);
  if (typeof hen.unref === 'function') hen.unref();
}

// Admin khóa tài khoản → ngắt mọi socket của người đó. Dùng `troMs` > 0 khi gọi từ trong transaction
// để tránh client nối lại trước khi lệnh khóa kịp commit.
function ngatKetNoiNguoiDung(maNguoiDung, { troMs = 0 } = {}) {
  if (!io || maNguoiDung == null) return;
  const lam = () => {
    try {
      io.in(tenPhongNguoiDung(maNguoiDung)).emit('loi', {
        ma: 'ACCOUNT_LOCKED', thongBao: 'Tài khoản của bạn đã bị khóa.',
      });
      io.in(tenPhongNguoiDung(maNguoiDung)).disconnectSockets(true);
    } catch (loi) {
      console.error('[realtime] ngắt kết nối lỗi:', loi.message);
    }
  };
  if (troMs > 0) {
    const hen = setTimeout(lam, troMs);
    if (typeof hen.unref === 'function') hen.unref();
  } else {
    lam();
  }
}

module.exports = {
  datIo, layIo,
  tenPhongNguoiDung, tenPhongChat, tenPhongLich, PHONG_ADMIN, TRE_SAU_GIAO_DICH_MS,
  phatChoNguoiDung, phatChoPhong, xoaNguoiDungKhoiPhong, phatLichSan, phatChoAdmin, phatSauGiaoDich,
  ngatKetNoiNguoiDung,
};
