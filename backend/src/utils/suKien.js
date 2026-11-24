// G7.2: hàm thuần cho Sự kiện (Cộng đồng) – không đụng DB, không đọc đồng hồ (giờ hiện tại luôn truyền vào).
// Quy tắc: docs/agent/features/events/rules.md (SK-03…SK-07, KH-02, KH-03, KH-07, §2 trạng thái).
// Giờ là giờ Việt Nam (+07:00); ngày 'YYYY-MM-DD', giờ 'HH:MM' hoặc 'HH:MM:SS'.
const AppError = require('./AppError');
const { doiGioRaPhut } = require('./time');
const { laNgayHopLe } = require('./khoaSan');

const BUOC_PHUT = 30;
const PHI_TOI_DA_MAC_DINH = 10000000;
const GIO_VN = '+07:00';

// Thang trình độ 1–8 (lưu 2 mã TrinhDoTu/TrinhDoDen).
const TRINH_DO = [
  { ma: 1, nhan: 'Y' }, { ma: 2, nhan: 'TBY' }, { ma: 3, nhan: 'TB-' }, { ma: 4, nhan: 'TB' },
  { ma: 5, nhan: 'TB+' }, { ma: 6, nhan: 'K' }, { ma: 7, nhan: 'BC' }, { ma: 8, nhan: 'CN' },
];
const TRINH_DO_THAP_NHAT = 1;
const TRINH_DO_CAO_NHAT = 8;

function laTrinhDoHopLe(ma) {
  return Number.isInteger(ma) && ma >= TRINH_DO_THAP_NHAT && ma <= TRINH_DO_CAO_NHAT;
}

function nhanTrinhDo(ma) {
  const muc = TRINH_DO.find((m) => m.ma === ma);
  return muc ? muc.nhan : null;
}

// SK-07: hai mã 1–8 và TrinhDoTu ≤ TrinhDoDen.
function kiemTraKhoangTrinhDo(trinhDoTu, trinhDoDen) {
  if (!laTrinhDoHopLe(trinhDoTu) || !laTrinhDoHopLe(trinhDoDen)) {
    throw AppError.duLieuKhongHopLe('Trình độ phải từ 1 đến 8', { truong: 'trinhDo' });
  }
  if (trinhDoTu > trinhDoDen) {
    throw AppError.duLieuKhongHopLe('Trình độ bắt đầu không được cao hơn trình độ kết thúc', { truong: 'trinhDo' });
  }
}

// Dòng ghi chú dưới bộ chọn 8 ô: "Mọi trình độ" / "Chỉ trình độ TB" / "Từ TB- đến K".
function moTaKhoangTrinhDo(trinhDoTu, trinhDoDen) {
  kiemTraKhoangTrinhDo(trinhDoTu, trinhDoDen);
  if (trinhDoTu === TRINH_DO_THAP_NHAT && trinhDoDen === TRINH_DO_CAO_NHAT) return 'Mọi trình độ';
  if (trinhDoTu === trinhDoDen) return `Chỉ trình độ ${nhanTrinhDo(trinhDoTu)}`;
  return `Từ ${nhanTrinhDo(trinhDoTu)} đến ${nhanTrinhDo(trinhDoDen)}`;
}

// KH-07: khách khai trình độ ngoài khoảng → chỉ CẢNH BÁO, không chặn. Không khai (null) = không cảnh báo.
function trinhDoNgoaiKhoang(trinhDoTu, trinhDoDen, trinhDoKhai) {
  if (trinhDoKhai === null || trinhDoKhai === undefined) return false;
  if (!laTrinhDoHopLe(trinhDoKhai)) {
    throw AppError.duLieuKhongHopLe('Trình độ phải từ 1 đến 8', { truong: 'trinhDoKhai' });
  }
  return trinhDoKhai < trinhDoTu || trinhDoKhai > trinhDoDen;
}

// 'YYYY-MM-DD' + 'HH:MM[:SS]' → Date (thời điểm tuyệt đối theo giờ VN).
function thoiDiemVN(ngay, gio) {
  if (!laNgayHopLe(ngay) || !/^\d{2}:\d{2}(:\d{2})?$/.test(String(gio))) {
    throw AppError.duLieuKhongHopLe('Ngày hoặc giờ không hợp lệ');
  }
  const gioDayDu = String(gio).length === 5 ? `${gio}:00` : String(gio);
  const thoiDiem = new Date(`${ngay}T${gioDayDu}${GIO_VN}`);
  if (Number.isNaN(thoiDiem.getTime())) throw AppError.duLieuKhongHopLe('Ngày hoặc giờ không hợp lệ');
  return thoiDiem;
}

// Hạn đăng ký nhận Date hoặc chuỗi 'YYYY-MM-DD HH:MM' / 'YYYY-MM-DDTHH:MM' (giờ VN).
function chuanHoaHanDangKy(hanDangKy) {
  if (hanDangKy instanceof Date) {
    if (Number.isNaN(hanDangKy.getTime())) throw AppError.duLieuKhongHopLe('Hạn đăng ký không hợp lệ', { truong: 'hanDangKy' });
    return hanDangKy;
  }
  const khop = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(String(hanDangKy ?? ''));
  if (!khop) throw AppError.duLieuKhongHopLe('Hạn đăng ký phải có dạng YYYY-MM-DD HH:MM', { truong: 'hanDangKy' });
  return thoiDiemVN(khop[1], `${khop[2]}${khop[3] ?? ''}`);
}

// Date → 'YYYY-MM-DD HH:MM:SS' theo giờ VN, để ghi cột DATETIME (pool đã đặt timezone '+07:00').
function dinhDangGioVN(thoiDiem) {
  return new Date(thoiDiem.getTime() + 7 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
}

// SK-03 + SK-04: ngày ≥ hôm nay, bắt đầu ở tương lai, kết thúc > bắt đầu, bội 30', trong giờ mở–đóng cửa;
// hạn đăng ký < giờ bắt đầu và cách giờ bắt đầu ít nhất `soPhutBatBuocTruoc` (event_min_register_lead_minutes).
// Trả { batDau, ketThuc, hanDangKy } (Date) để service dùng tiếp.
function kiemTraThoiGianSuKien({
  ngay, gioBatDau, gioKetThuc, hanDangKy, gioMoCua, gioDongCua, bayGio, soPhutBatBuocTruoc = 60,
}) {
  const batDau = thoiDiemVN(ngay, gioBatDau);
  const ketThuc = thoiDiemVN(ngay, gioKetThuc);
  const phutBatDau = doiGioRaPhut(gioBatDau);
  const phutKetThuc = doiGioRaPhut(gioKetThuc);

  if (phutBatDau % BUOC_PHUT !== 0 || phutKetThuc % BUOC_PHUT !== 0) {
    throw AppError.duLieuKhongHopLe(`Giờ bắt đầu và kết thúc phải là bội số của ${BUOC_PHUT} phút`, { truong: 'gio' });
  }
  if (phutKetThuc <= phutBatDau) {
    throw AppError.duLieuKhongHopLe('Giờ kết thúc phải sau giờ bắt đầu', { truong: 'gioKetThuc' });
  }
  if (phutBatDau < doiGioRaPhut(gioMoCua) || phutKetThuc > doiGioRaPhut(gioDongCua)) {
    throw AppError.duLieuKhongHopLe(
      `Sự kiện phải nằm trong giờ mở cửa của cơ sở (${String(gioMoCua).slice(0, 5)}-${String(gioDongCua).slice(0, 5)})`,
      { truong: 'gio' });
  }
  if (batDau.getTime() <= bayGio.getTime()) {
    throw AppError.duLieuKhongHopLe('Sự kiện phải bắt đầu trong tương lai', { truong: 'ngay' });
  }

  const han = chuanHoaHanDangKy(hanDangKy);
  if (han.getTime() > batDau.getTime() - soPhutBatBuocTruoc * 60000) {
    throw AppError.duLieuKhongHopLe(
      `Hạn đăng ký phải trước giờ bắt đầu ít nhất ${soPhutBatBuocTruoc} phút`, { truong: 'hanDangKy' });
  }
  return { batDau, ketThuc, hanDangKy: han };
}

// SK-05: số lượng tối đa nguyên ≥ 1.
function kiemTraSoLuongToiDa(soLuong, truong = 'soLuongToiDa') {
  if (!Number.isInteger(soLuong) || soLuong < 1) {
    throw AppError.duLieuKhongHopLe('Số lượng tối đa phải là số nguyên từ 1 trở lên', { truong });
  }
}

// SK-06: phí 0 (miễn phí) hoặc số nguyên > 0, không vượt trần (event_max_fee).
function kiemTraPhi(phi, phiToiDa = PHI_TOI_DA_MAC_DINH) {
  if (!Number.isInteger(phi) || phi < 0) {
    throw AppError.duLieuKhongHopLe('Phí phải là số nguyên không âm (0 = miễn phí)', { truong: 'phi' });
  }
  if (phi > phiToiDa) {
    throw AppError.duLieuKhongHopLe(`Phí tối đa ${phiToiDa.toLocaleString('vi-VN')}đ`, { truong: 'phi' });
  }
}

// Trạng thái SuKien (rules §2). Bảng chuyển: ai → những trạng thái được đi tới.
const CHUYEN_SU_KIEN = {
  open: ['closed', 'finished', 'cancelled'],
  closed: ['open', 'finished', 'cancelled'],
  finished: [],
  cancelled: [],
};

// Trạng thái DangKySuKien. `cancelled` → `pending|accepted` = đăng ký lại dùng lại dòng cũ (KH-04);
// `rejected` là cuối: chủ sân đã từ chối thì khách không tự đăng ký lại.
const CHUYEN_DANG_KY = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['cancelled'],
  cancelled: ['pending', 'accepted'],
  rejected: [],
};

function coTheChuyen(bang, tu, den) {
  return Array.isArray(bang[tu]) && bang[tu].includes(den);
}

// Kiểm chuyển trạng thái sự kiện. Riêng closed → open (mở lại): chỉ khi chưa quá hạn đăng ký và chưa bắt đầu.
// ngữ cảnh: { hanDangKy: Date, batDau: Date, bayGio: Date } (chỉ cần khi mở lại).
function kiemTraChuyenTrangThaiSuKien(tu, den, nguCanh = {}) {
  if (!coTheChuyen(CHUYEN_SU_KIEN, tu, den)) {
    throw AppError.biTrung(`Không thể chuyển sự kiện từ "${tu}" sang "${den}"`, 'INVALID_STATE');
  }
  if (tu === 'closed' && den === 'open') {
    const { hanDangKy, batDau, bayGio } = nguCanh;
    if (bayGio.getTime() >= batDau.getTime()) {
      throw AppError.biTrung('Sự kiện đã bắt đầu, không thể mở lại', 'INVALID_STATE');
    }
    if (bayGio.getTime() > hanDangKy.getTime()) {
      throw AppError.biTrung('Đã quá hạn đăng ký, hãy gia hạn trước khi mở lại', 'INVALID_STATE');
    }
  }
}

function kiemTraChuyenTrangThaiDangKy(tu, den) {
  if (!coTheChuyen(CHUYEN_DANG_KY, tu, den)) {
    throw AppError.biTrung(`Không thể chuyển đăng ký từ "${tu}" sang "${den}"`, 'INVALID_STATE');
  }
}

// Còn chỗ không. soToiDa null (giải đấu chưa chọn hạng mục) = không giới hạn ở cấp này.
// Chỉ đăng ký `accepted` chiếm chỗ (pending thì không) → soDaNhan = số accepted.
function conCho(soDaNhan, soToiDa) {
  if (soToiDa === null || soToiDa === undefined) return true;
  return soDaNhan < soToiDa;
}

// KH-02: có nhận đăng ký mới không (khách). Không ném lỗi, trả { mo, lyDo } để service chọn mã lỗi:
// lyDo ∈ 'an' | 'khong_mo' | 'qua_han' | 'da_bat_dau' | 'co_so_khoa' | null.
// su kien: { trangThai, biAn, hanDangKy: Date, batDau: Date, coSoActive: boolean }
function kiemTraMoDangKy(suKien, bayGio) {
  if (suKien.biAn) return { mo: false, lyDo: 'an' };
  if (suKien.coSoActive === false) return { mo: false, lyDo: 'co_so_khoa' };
  if (suKien.trangThai !== 'open') return { mo: false, lyDo: 'khong_mo' };
  if (bayGio.getTime() >= suKien.batDau.getTime()) return { mo: false, lyDo: 'da_bat_dau' };
  if (bayGio.getTime() > suKien.hanDangKy.getTime()) return { mo: false, lyDo: 'qua_han' };
  return { mo: true, lyDo: null };
}

// Trạng thái HIỂN THỊ cho khách/chủ sân: "Đủ chỗ" là tính ra, không lưu (rules §2).
// vào: { trangThai, hanDangKy: Date, soDaNhan, soToiDa } → { ma, nhan }
const NHAN_SU_KIEN = {
  open: 'Đang nhận đăng ký',
  full: 'Đủ chỗ',
  registration_over: 'Hết hạn đăng ký',
  closed: 'Đã đóng đăng ký',
  finished: 'Đã kết thúc',
  cancelled: 'Đã hủy',
};

function tinhTrangThaiHienThiSuKien({ trangThai, hanDangKy, soDaNhan, soToiDa }, bayGio) {
  let ma = trangThai;
  if (trangThai === 'open') {
    if (hanDangKy && bayGio.getTime() > hanDangKy.getTime()) ma = 'registration_over';
    else if (!conCho(soDaNhan, soToiDa)) ma = 'full';
  }
  return { ma, nhan: NHAN_SU_KIEN[ma] ?? NHAN_SU_KIEN.cancelled };
}

// Hạng mục giải đấu giới hạn giới tính qua tên ("Đơn nam", "Đôi nữ"...). Tên có cả nam lẫn nữ
// ("Đôi nam nữ", "Hỗn hợp") hoặc không nhắc giới tính → không giới hạn (null).
function gioiTinhYeuCauCuaHangMuc(tenHangMuc) {
  const ten = String(tenHangMuc || '').toLowerCase().replace(/đ/g, 'd')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(hon hop|mixed)\b/.test(ten)) return null;
  const laNam = /\bnam\b/.test(ten);
  const laNu = /\bnu\b/.test(ten);
  if (laNam === laNu) return null;
  return laNam ? 'male' : 'female';
}

// Lý do hệ thống ghi khi chủ sân quên duyệt chứng từ phí quá hạn (khách được hoàn 100%).
const LY_DO_QUA_HAN_DUYET = 'Chu san qua han duyet phi su kien';

module.exports = {
  LY_DO_QUA_HAN_DUYET,
  BUOC_PHUT, PHI_TOI_DA_MAC_DINH, TRINH_DO, CHUYEN_SU_KIEN, CHUYEN_DANG_KY, NHAN_SU_KIEN,
  laTrinhDoHopLe, nhanTrinhDo, kiemTraKhoangTrinhDo, moTaKhoangTrinhDo, trinhDoNgoaiKhoang,
  thoiDiemVN, dinhDangGioVN, chuanHoaHanDangKy, kiemTraThoiGianSuKien, kiemTraSoLuongToiDa, kiemTraPhi,
  kiemTraChuyenTrangThaiSuKien, kiemTraChuyenTrangThaiDangKy, conCho, kiemTraMoDangKy,
  tinhTrangThaiHienThiSuKien, gioiTinhYeuCauCuaHangMuc,
};
