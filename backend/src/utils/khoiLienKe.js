// Gộp các mục chọn (sân + ngày + khoảng giờ) thành các CỤM liền kề, và tìm cụm ngắn hơn mức tối thiểu.
// Hàm thuần: không đọc DB, không đọc giờ máy, không sửa đầu vào.
// Đặc tả: docs/agent/DAT_NHIEU_SAN_NHIEU_KHUNG_GIO.md mục 3. Dùng ở đặt nhiều sân (2.3) và hủy một phần (6.4).
const AppError = require('./AppError');
const { doiGioRaPhut, doiPhutRaGio } = require('./time');

// Giờ HH:MM theo mốc 30 phút (như validators/customer.js); nhận thêm HH:MM:00 vì cột TIME của DB trả dạng đó.
const MAU_GIO = /^([01]\d|2[0-3]):(00|30)(:00)?$/;
const MAU_NGAY = /^\d{4}-\d{2}-\d{2}$/;

const ngayHopLe = (ngay) => {
  if (typeof ngay !== 'string' || !MAU_NGAY.test(ngay)) return false;
  const ngayDate = new Date(`${ngay}T00:00:00Z`);
  return !Number.isNaN(ngayDate.getTime()) && ngayDate.toISOString().slice(0, 10) === ngay;
};
const gioHopLe = (gio) => typeof gio === 'string' && MAU_GIO.test(gio);

// Trả danh sách lỗi theo dạng chiTiet của API: [{ truong, thongBao }]. Gom đủ mọi lỗi để khách sửa một lượt.
function timLoiDauVao(cacMuc) {
  const cacLoi = [];
  cacMuc.forEach((muc, chiSo) => {
    const them = (truong, thongBao) => cacLoi.push({ truong: `cacMuc[${chiSo}].${truong}`, thongBao });
    if (muc === null || typeof muc !== 'object') {
      cacLoi.push({ truong: `cacMuc[${chiSo}]`, thongBao: 'Mục chọn không hợp lệ.' });
      return;
    }
    if (!Number.isInteger(muc.maSan) || muc.maSan <= 0) them('maSan', 'Mã sân không hợp lệ.');
    if (!ngayHopLe(muc.ngay)) them('ngay', 'Ngày phải dạng YYYY-MM-DD và có thật.');
    const batDauDung = gioHopLe(muc.gioBatDau);
    const ketThucDung = gioHopLe(muc.gioKetThuc);
    if (!batDauDung) them('gioBatDau', 'Giờ phải dạng HH:MM theo mốc 30 phút (HH:00 hoặc HH:30).');
    if (!ketThucDung) them('gioKetThuc', 'Giờ phải dạng HH:MM theo mốc 30 phút (HH:00 hoặc HH:30).');
    if (batDauDung && ketThucDung && doiGioRaPhut(muc.gioKetThuc) <= doiGioRaPhut(muc.gioBatDau)) {
      them('gioKetThuc', 'Giờ kết thúc phải sau giờ bắt đầu.');
    }
  });
  return cacLoi;
}

// cacMuc: [{ maSan, ngay: 'YYYY-MM-DD', gioBatDau: 'HH:MM', gioKetThuc: 'HH:MM' }]
// soPhutToiThieu: CoSo.SoPhutDatToiThieu (phút).
// Trả { cacCum, cacCumNgan }:
//   cacCum     : [{ maSan, ngay, gioBatDau, gioKetThuc, soPhut }] sắp theo (ngay, gioBatDau, maSan)
//   cacCumNgan : các cụm có soPhut < soPhutToiThieu, mỗi cụm kèm soPhutToiThieu
// Quy tắc: chỉ gộp cùng sân + cùng ngày; khoảng chạm nhau (kết thúc = bắt đầu) hoặc chồng/trùng nhau thì gộp.
// Đầu vào sai định dạng/giờ → AppError 400 (không kiểm giờ mở cửa, quá khứ, trùng lịch: việc của service).
function gopKhoiLienKe(cacMuc, soPhutToiThieu) {
  if (!Array.isArray(cacMuc)) throw new TypeError('cacMuc phải là mảng');
  if (typeof soPhutToiThieu !== 'number' || !Number.isFinite(soPhutToiThieu) || soPhutToiThieu <= 0) {
    throw new TypeError('soPhutToiThieu phải là số phút dương');
  }
  const cacLoi = timLoiDauVao(cacMuc);
  if (cacLoi.length > 0) throw AppError.duLieuKhongHopLe('Khung giờ đã chọn không hợp lệ.', cacLoi);

  const cacNhom = new Map(); // khóa "maSan|ngay" → các khoảng phút
  for (const muc of cacMuc) {
    const khoa = `${muc.maSan}|${muc.ngay}`;
    if (!cacNhom.has(khoa)) cacNhom.set(khoa, { maSan: muc.maSan, ngay: muc.ngay, cacKhoang: [] });
    cacNhom.get(khoa).cacKhoang.push({ batDau: doiGioRaPhut(muc.gioBatDau), ketThuc: doiGioRaPhut(muc.gioKetThuc) });
  }

  const cacCum = [];
  for (const { maSan, ngay, cacKhoang } of cacNhom.values()) {
    cacKhoang.sort((a, b) => a.batDau - b.batDau || a.ketThuc - b.ketThuc);
    let hienTai = { ...cacKhoang[0] };
    const dongCum = () => cacCum.push({
      maSan,
      ngay,
      gioBatDau: doiPhutRaGio(hienTai.batDau),
      gioKetThuc: doiPhutRaGio(hienTai.ketThuc),
      soPhut: hienTai.ketThuc - hienTai.batDau,
    });
    for (const khoang of cacKhoang.slice(1)) {
      if (khoang.batDau <= hienTai.ketThuc) {
        hienTai.ketThuc = Math.max(hienTai.ketThuc, khoang.ketThuc);
      } else {
        dongCum();
        hienTai = { ...khoang };
      }
    }
    dongCum();
  }

  // Thứ tự xác định: cụm đầu nhóm (đơn con đầu) luôn là cụm sớm nhất, hòa thì sân nhỏ nhất.
  cacCum.sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0)
    || doiGioRaPhut(a.gioBatDau) - doiGioRaPhut(b.gioBatDau)
    || a.maSan - b.maSan);

  const cacCumNgan = cacCum.filter((cum) => cum.soPhut < soPhutToiThieu).map((cum) => ({ ...cum, soPhutToiThieu }));
  return { cacCum, cacCumNgan };
}

module.exports = { gopKhoiLienKe };
