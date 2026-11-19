const { z } = require('zod');

const maSo = z.coerce.number().int().positive();
const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((giaTri) => {
    const ngayDate = new Date(`${giaTri}T00:00:00Z`);
    return !Number.isNaN(ngayDate.getTime()) && ngayDate.toISOString().slice(0, 10) === giaTri;
  });

exports.maNguoiDung = { params: z.object({ maNguoiDung: maSo }) };
exports.duyetChuSan = {
  params: z.object({ maNguoiDung: maSo }),
  body: z.object({
    trangThai: z.enum(['approved', 'rejected']),
    lyDoTuChoi: z.string().trim().min(3).max(255).optional(),
  }).refine((duLieu) => duLieu.trangThai !== 'rejected' || !!duLieu.lyDoTuChoi, {
    message: 'Cần nêu lý do khi từ chối hồ sơ',
    path: ['lyDoTuChoi'],
  }),
};
exports.maDatSan = { params: z.object({ maDatSan: maSo }) };
exports.tuChoiThanhToan = {
  params: z.object({ maDatSan: maSo }),
  body: z.object({
    lyDo: z.string().trim().min(2, 'Vui lòng nhập lý do từ chối.').max(255, 'Lý do tối đa 255 ký tự.'),
  }),
};
exports.maThanhToan = { params: z.object({ maThanhToan: maSo }) };
exports.hoanTien = {
  params: z.object({ maThanhToan: maSo }),
  body: z.object({ maGiaoDichHoan: z.string().trim().min(3).max(100) }),
};
const lyDoTuyChon = z.object({ lyDo: z.string().trim().min(2).max(255).optional() }).default({});
exports.dongXoaSan = { params: z.object({ maSan: maSo }), body: lyDoTuyChon };
exports.dongXoaCoSo = { params: z.object({ maCoSo: maSo }), body: lyDoTuyChon };
exports.maSan = { params: z.object({ maSan: maSo }) };
exports.maCoSo = { params: z.object({ maCoSo: maSo }) };
exports.danhSachNhatKy = {
  query: z.object({
    tuNgay: ngay.optional(),
    denNgay: ngay.optional(),
    gioiHan: z.coerce.number().int().min(1).max(100).default(50),
  }),
};

exports.danhSachKhieuNai = {
  query: z.object({
    trangThai: z.enum(['pending', 'upheld', 'rejected', 'all']).default('pending'),
    gioiHan: z.coerce.number().int().min(1).max(100).default(50),
  }),
};
exports.xuLyKhieuNai = {
  params: z.object({ maKhieuNai: maSo }),
  body: z.object({
    quyetDinh: z.enum(['upheld', 'rejected']),
    ghiChu: z.string().trim().min(3, 'Ghi chú tối thiểu 3 ký tự.').max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
  }).refine((duLieu) => duLieu.quyetDinh !== 'rejected' || !!duLieu.ghiChu, {
    message: 'Cần nêu lý do khi bác bỏ khiếu nại',
    path: ['ghiChu'],
  }),
};

// Quản lý đánh giá: xem toàn bộ, ẩn/hiện đánh giá vi phạm.
exports.danhSachDanhGia = {
  query: z.object({
    trangThai: z.enum(['hien', 'an', 'all'], { error: 'trangThai chỉ nhận hien, an hoặc all.' }).default('all'),
    maCoSo: maSo.optional(),
    soSao: z.coerce.number({ error: 'Số sao phải từ 1 đến 5.' })
      .int('Số sao phải từ 1 đến 5.').min(1, 'Số sao phải từ 1 đến 5.').max(5, 'Số sao phải từ 1 đến 5.').optional(),
    trang: z.coerce.number({ error: 'Trang phải là số nguyên từ 1.' })
      .int('Trang phải là số nguyên từ 1.').min(1, 'Trang phải là số nguyên từ 1.').default(1),
    soLuong: z.coerce.number({ error: 'Số lượng phải từ 1 đến 50.' })
      .int('Số lượng phải từ 1 đến 50.')
      .min(1, 'Số lượng phải từ 1 đến 50.').max(50, 'Số lượng phải từ 1 đến 50.').default(20),
  }),
};
exports.anHienDanhGia = {
  params: z.object({ maDanhGia: maSo }),
  body: z.object({
    an: z.boolean({ error: 'Trường an phải là true hoặc false.' }),
    lyDo: z.string({ error: 'Lý do không hợp lệ.' }).trim()
      .min(3, 'Lý do tối thiểu 3 ký tự.').max(255, 'Lý do tối đa 255 ký tự.').optional(),
  }).refine((duLieu) => duLieu.an !== true || !!duLieu.lyDo, {
    message: 'Cần nêu lý do khi ẩn đánh giá',
    path: ['lyDo'],
  }),
};

// Quản lý tài khoản khách / chủ sân: danh sách, khóa (bắt buộc lý do) và mở khóa.
exports.danhSachNguoiDung = {
  query: z.object({
    vaiTro: z.enum(['customer', 'owner'], { error: 'vaiTro chỉ nhận customer hoặc owner.' }),
    trangThai: z.enum(['active', 'locked', 'all'], { error: 'trangThai chỉ nhận active, locked hoặc all.' }).default('all'),
    tuKhoa: z.string().trim().max(100).optional(),
    trang: z.coerce.number({ error: 'Trang phải là số nguyên từ 1.' })
      .int('Trang phải là số nguyên từ 1.').min(1, 'Trang phải là số nguyên từ 1.').default(1),
    soLuong: z.coerce.number({ error: 'Số lượng phải từ 1 đến 50.' })
      .int('Số lượng phải từ 1 đến 50.')
      .min(1, 'Số lượng phải từ 1 đến 50.').max(50, 'Số lượng phải từ 1 đến 50.').default(20),
  }),
};
exports.khoaTaiKhoan = {
  params: z.object({ maNguoiDung: maSo }),
  body: z.object({
    lyDo: z.string({ error: 'Vui lòng nhập lý do khóa.' }).trim()
      .min(3, 'Lý do tối thiểu 3 ký tự.').max(255, 'Lý do tối đa 255 ký tự.'),
  }),
};

// Danh sách cơ sở kèm số đánh giá (chọn cơ sở để quản lý đánh giá).
exports.danhSachCoSo = {
  query: z.object({ tuKhoa: z.string().trim().max(100).optional() }),
};
