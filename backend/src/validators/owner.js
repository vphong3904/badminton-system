const { z } = require('zod');

const gioPhut = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM');
const maSo = z.coerce.number().int().positive();
const SO_PHUT_TRE_CHO_PHEP = [15, 20, 30];

const quyTac = require('./quyTac');
const { laLinkGoogleMaps } = require('../utils/toaDoBanDo');

const coSo = z.object({
  tenCoSo: z.string().trim().min(2).max(150),
  diaChi: z.string().trim().min(5).max(255),
  tinhThanh: z.string().trim().min(2).max(80),
  quanHuyen: z.string().trim().min(2).max(80),
  soDienThoai: quyTac.soDienThoaiLienHe,
  // Link Google Maps (kể cả link rút gọn maps.app.goo.gl). Backend tự đọc toạ độ từ link này
  // để app khách tính khoảng cách "sân gần tôi" — chủ sân không nhập vĩ độ/kinh độ.
  linkBanDo: z.string().trim().url().max(500)
    .refine(laLinkGoogleMaps, 'Vui lòng dán link Google Maps (vd https://maps.app.goo.gl/...)'),
  moTa: z.string().max(2000).optional(),
  gioMoCua: gioPhut,
  gioDongCua: gioPhut,
  soPhutDatToiThieu: z.number().int().refine((giaTri) => giaTri % 30 === 0 && giaTri >= 30, 'Phải là bội số của 30 phút'),
  // Giờ trễ tối đa (Task 1.1). Không gửi thì giữ giá trị hiện có (cơ sở mới: mặc định 15 ở DB).
  soPhutTreToiDa: z.number().int().refine((giaTri) => SO_PHUT_TRE_CHO_PHEP.includes(giaTri), 'Chỉ được chọn 15, 20 hoặc 30 phút').optional(),
}).refine((duLieu) => duLieu.gioMoCua < duLieu.gioDongCua, {
  message: 'Giờ đóng cửa phải sau giờ mở cửa',
  path: ['gioDongCua'],
});

const giaMoiGio = z.number().int().min(0).max(10_000_000);
// Giá riêng cho từng thứ: thu 1 = Thứ 2 … 7 = Chủ nhật.
const giaMotThu = z.object({
  thu: z.number().int().min(1).max(7),
  giaKhachVangLai: giaMoiGio,
  giaKhachCoDinh: giaMoiGio,
});
// Một khung giờ: gửi `giaTheoThu` (7 thứ riêng biệt) HOẶC 4 trường cũ (T2–T6 / T7–CN, tương thích API cũ).
const khungGia = z.object({
  gioBatDau: gioPhut,
  gioKetThuc: gioPhut,
  giaTheoThu: z.array(giaMotThu).length(7, 'Phải có đủ giá cho 7 thứ').optional(),
  giaNgayThuongKhachVangLai: giaMoiGio.optional(),
  giaNgayThuongKhachCoDinh: giaMoiGio.optional(),
  giaCuoiTuanKhachVangLai: giaMoiGio.optional(),
  giaCuoiTuanKhachCoDinh: giaMoiGio.optional(),
}).superRefine((khung, ctx) => {
  if (khung.giaTheoThu) {
    const cacThu = new Set(khung.giaTheoThu.map((g) => g.thu));
    if (cacThu.size !== 7) ctx.addIssue({ code: 'custom', path: ['giaTheoThu'], message: 'Mỗi thứ (1–7) chỉ xuất hiện một lần' });
    return;
  }
  const cu = [khung.giaNgayThuongKhachVangLai, khung.giaNgayThuongKhachCoDinh,
    khung.giaCuoiTuanKhachVangLai, khung.giaCuoiTuanKhachCoDinh];
  if (cu.some((g) => g === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['giaTheoThu'], message: 'Cần giaTheoThu (7 thứ) hoặc đủ 4 trường giá T2–T6 / T7–CN' });
  }
});

exports.coSo = { body: coSo };
const maCoSoTrongDuongDan = z.object({ maCoSo: maSo });
exports.maCoSo = { params: maCoSoTrongDuongDan };
exports.anhCoSo = { params: z.object({ maCoSo: maSo, maAnh: maSo }) };
exports.capNhatCoSoTheoMa = { params: maCoSoTrongDuongDan, body: coSo };
// Thêm MỘT khung giá tuỳ chỉnh vào cơ sở (trang quản lý bảng giá → nút "Thêm bảng giá").
exports.themKhungGia = { params: maCoSoTrongDuongDan, body: khungGia };
exports.bangGiaTheoMa = {
  params: maCoSoTrongDuongDan,
  body: z.object({ khungGias: z.array(khungGia).min(1).max(24) }),
};
exports.danhSachSan = { query: z.object({ maCoSo: maSo.optional() }) };
exports.bangGia = { body: z.object({ khungGias: z.array(khungGia).min(1).max(24) }) };
exports.nganHang = {
  body: z.object({
    tenNganHang: z.string().trim().min(2).max(100),
    maNganHang: z.string().trim().min(2).max(20),
    soTaiKhoan: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản không hợp lệ'),
    chuTaiKhoan: z.string().trim().min(2).max(100),
  }),
};
// Đổi tài khoản nhận tiền (mọi trạng thái hồ sơ): chỉ cần mã ngân hàng, BE tự lấy tên.
exports.doiNganHang = {
  body: z.object({
    maNganHang: z.string().trim().min(2).max(20)
      .refine((ma) => !!require('../utils/nganHang').timNganHang(ma), 'Ngân hàng không hợp lệ.'),
    soTaiKhoan: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản phải gồm 6–20 chữ số.'),
    chuTaiKhoan: z.string().trim().min(2).max(100),
  }),
};
const lyDoTuyChon = z.object({ lyDo: z.string().trim().min(2).max(255).optional() }).default({});
exports.dongXoaSan = { params: z.object({ maSan: maSo }), body: lyDoTuyChon };
exports.dongXoaCoSo = { params: maCoSoTrongDuongDan, body: lyDoTuyChon };
exports.doanhNghiep = {
  body: z.object({ tenDoanhNghiep: z.string().trim().min(2, 'Tên doanh nghiệp tối thiểu 2 ký tự.').max(150, 'Tên doanh nghiệp tối đa 150 ký tự.') }),
};
// Sân mới luôn tạo ở trạng thái chưa hoạt động; không nhận trangThai khi tạo (chủ sân bật bằng PATCH /san/:maSan/mo).
exports.san = {
  body: z.object({
    maCoSo: maSo.optional(),
    tenSan: z.string().trim().min(1).max(50),
  }),
};
exports.maSan = { params: z.object({ maSan: maSo }) };
exports.capNhatSan = {
  params: z.object({ maSan: maSo }),
  body: z.object({
    tenSan: z.string().trim().min(1).max(50).optional(),
    trangThai: z.enum(['active', 'maintenance']).optional(),
  }),
};
const thoiGianKhoa = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Dạng YYYY-MM-DD HH:MM');
const ngayKhoa = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dạng YYYY-MM-DD');
// Hai dạng body (Task 1.3): cũ = thoiGianBatDau/thoiGianKetThuc cùng 1 ngày; mới = tuNgay[/denNgay] + gioBatDau/gioKetThuc.
// Không gửi lẫn hai dạng. Kiểm ngày thật + tối đa 90 ngày nằm ở utils/khoaSan.js (trả 422).
exports.khoaSan = {
  body: z.object({
    maSan: z.number().int().positive(),
    thoiGianBatDau: thoiGianKhoa.optional(),
    thoiGianKetThuc: thoiGianKhoa.optional(),
    tuNgay: ngayKhoa.optional(),
    denNgay: ngayKhoa.optional(),
    gioBatDau: gioPhut.optional(),
    gioKetThuc: gioPhut.optional(),
    lyDo: z.string().max(255).optional(),
  }).superRefine((duLieu, ngCanh) => {
    const dangCu = duLieu.thoiGianBatDau !== undefined || duLieu.thoiGianKetThuc !== undefined;
    const dangMoi = duLieu.tuNgay !== undefined || duLieu.denNgay !== undefined
      || duLieu.gioBatDau !== undefined || duLieu.gioKetThuc !== undefined;
    const loi = (path, message) => ngCanh.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (dangCu && dangMoi) return loi('tuNgay', 'Chỉ dùng một dạng: thoiGianBatDau/KetThuc hoặc tuNgay/denNgay + gioBatDau/gioKetThuc');
    if (dangCu) {
      if (!duLieu.thoiGianBatDau) return loi('thoiGianBatDau', 'Thiếu thời gian bắt đầu');
      if (!duLieu.thoiGianKetThuc) return loi('thoiGianKetThuc', 'Thiếu thời gian kết thúc');
      if (duLieu.thoiGianBatDau >= duLieu.thoiGianKetThuc) return loi('thoiGianKetThuc', 'Thời gian kết thúc phải sau bắt đầu');
      return undefined;
    }
    if (!dangMoi) return loi('tuNgay', 'Cần tuNgay + gioBatDau + gioKetThuc (hoặc thoiGianBatDau + thoiGianKetThuc)');
    if (!duLieu.tuNgay) return loi('tuNgay', 'Thiếu ngày bắt đầu');
    if (!duLieu.gioBatDau) return loi('gioBatDau', 'Thiếu giờ bắt đầu');
    if (!duLieu.gioKetThuc) return loi('gioKetThuc', 'Thiếu giờ kết thúc');
    if (duLieu.gioBatDau >= duLieu.gioKetThuc) return loi('gioKetThuc', 'Giờ kết thúc phải sau giờ bắt đầu');
    if (duLieu.denNgay && duLieu.denNgay < duLieu.tuNgay) return loi('denNgay', 'Ngày kết thúc phải từ ngày bắt đầu trở đi');
    return undefined;
  }),
};
exports.danhSachKhoaSan = {
  query: z.object({
    maSan: maSo.optional(),
    tuNgay: z.string().optional(),
    denNgay: z.string().optional(),
  }),
};
exports.maKhoaSan = { params: z.object({ maKhoa: maSo }) };

// Đánh giá của các cơ sở của chủ sân: xem + phản hồi.
exports.danhSachDanhGia = {
  query: z.object({
    maCoSo: maSo.optional(),
    soSao: z.coerce.number({ error: 'Số sao phải từ 1 đến 5.' })
      .int('Số sao phải từ 1 đến 5.').min(1, 'Số sao phải từ 1 đến 5.').max(5, 'Số sao phải từ 1 đến 5.').optional(),
    sapXep: z.enum(['moi-nhat', 'sao-thap', 'sao-cao'], { error: 'sapXep chỉ nhận moi-nhat, sao-thap hoặc sao-cao.' }).optional(),
    chuaPhanHoi: z.enum(['true', 'false'], { error: 'chuaPhanHoi chỉ nhận true hoặc false.' })
      .transform((giaTri) => giaTri === 'true').optional(),
    trang: z.coerce.number({ error: 'Trang phải là số nguyên từ 1.' })
      .int('Trang phải là số nguyên từ 1.').min(1, 'Trang phải là số nguyên từ 1.').default(1),
    soLuong: z.coerce.number({ error: 'Số lượng phải từ 1 đến 50.' })
      .int('Số lượng phải từ 1 đến 50.')
      .min(1, 'Số lượng phải từ 1 đến 50.').max(50, 'Số lượng phải từ 1 đến 50.').default(20),
  }),
};
exports.phanHoiDanhGia = {
  params: z.object({ maDanhGia: maSo }),
  body: z.object({
    noiDung: z.string({ error: 'Vui lòng nhập nội dung phản hồi.' }).trim()
      .min(2, 'Phản hồi tối thiểu 2 ký tự.').max(1000, 'Phản hồi tối đa 1000 ký tự.'),
  }),
};
exports.xoaPhanHoiDanhGia = { params: z.object({ maDanhGia: maSo }) };

// Khiếu nại gửi tới chủ sân: xem danh sách + giải trình 1 lần.
exports.danhSachKhieuNai = {
  query: z.object({ trangThai: z.enum(['pending', 'upheld', 'rejected', 'all']).default('all') }),
};
exports.khangNghiKhieuNai = {
  params: z.object({ maKhieuNai: maSo }),
  body: z.object({
    noiDung: z.string({ error: 'Vui lòng nhập nội dung kháng nghị.' }).trim()
      .min(10, 'Nội dung kháng nghị tối thiểu 10 ký tự.').max(1000, 'Nội dung kháng nghị tối đa 1000 ký tự.'),
  }),
};
exports.phanHoiKhieuNai = {
  params: z.object({ maKhieuNai: maSo }),
  body: z.object({
    noiDung: z.string({ error: 'Vui lòng nhập nội dung phản hồi.' }).trim()
      .min(10, 'Nội dung phản hồi tối thiểu 10 ký tự.').max(1000, 'Nội dung phản hồi tối đa 1000 ký tự.'),
  }),
};
