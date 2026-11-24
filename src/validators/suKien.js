const { z } = require('zod');

const maSo = z.coerce.number().int().positive('Mã không hợp lệ');
const quyTac = require('./quyTac');
const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải dạng YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Ngày không hợp lệ');
const gio = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM')
  .refine((v) => /:(00|30)$/.test(v), 'Giờ phải theo mốc 30 phút (HH:00 hoặc HH:30)');
const thoiDiem = z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Thời điểm phải dạng YYYY-MM-DD HH:MM[:SS]');
const trinhDo = z.coerce.number().int().min(1).max(8);
const hangMuc = z.object({
  tenHangMuc: z.string().trim().min(1, 'Vui lòng nhập tên hạng mục').max(100),
  laDoi: z.boolean().optional().default(false),
  soLuongToiDa: z.coerce.number().int().min(1).max(10000),
});
const hangMucSua = z.object({
  maHangMuc: maSo,
  tenHangMuc: z.string().trim().min(1).max(100).optional(),
  soLuongToiDa: z.coerce.number().int().min(1).max(10000).optional(),
});
const lyDo = z.string().trim().min(1, 'Vui lòng nhập lý do').max(255, 'Lý do tối đa 255 ký tự');
const phanTrang = {
  trang: z.coerce.number().int().min(1).default(1),
  soLuong: z.coerce.number().int().min(1).max(50).default(20),
};

const taoBody = z.object({
  maCoSo: maSo,
  loai: z.enum(['social', 'tournament']),
  tieuDe: z.string().trim().min(2).max(150),
  moTa: z.string().max(2000).optional(),
  dieuLe: z.string().max(5000).optional(),
  ngay,
  gioBatDau: gio,
  gioKetThuc: gio,
  hanDangKy: thoiDiem,
  cacMaSan: z.array(maSo).min(1).max(30),
  soLuongToiDa: z.coerce.number().int().min(1).max(10000).optional(),
  hangMuc: z.array(hangMuc).max(30).optional(),
  trinhDoTu: trinhDo.default(1),
  trinhDoDen: trinhDo.default(8),
  cheDoDuyet: z.enum(['auto', 'manual']).default('auto'),
  phi: z.coerce.number().int().min(0).max(10000000).default(0),
  ghiChuPhi: z.string().max(255).optional(),
}).superRefine((d, ctx) => {
  if (d.gioKetThuc <= d.gioBatDau) ctx.addIssue({ code: 'custom', path: ['gioKetThuc'], message: 'Giờ kết thúc phải sau giờ bắt đầu' });
  if (d.trinhDoTu > d.trinhDoDen) ctx.addIssue({ code: 'custom', path: ['trinhDoDen'], message: 'Trình độ đến phải lớn hơn hoặc bằng trình độ từ' });
  if (d.loai === 'social' && (d.hangMuc?.length || !d.soLuongToiDa)) {
    ctx.addIssue({ code: 'custom', path: ['soLuongToiDa'], message: 'Sự kiện Giao lưu cần số lượng tối đa và không có hạng mục' });
  }
  if (d.loai === 'tournament' && (!d.hangMuc?.length || d.soLuongToiDa !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['hangMuc'], message: 'Giải đấu cần ít nhất một hạng mục và không dùng số lượng tối đa chung' });
  }
});

const suaBody = z.object({
  tieuDe: z.string().trim().min(2).max(150).optional(),
  moTa: z.string().max(2000).nullable().optional(),
  dieuLe: z.string().max(5000).nullable().optional(),
  ngay: ngay.optional(), gioBatDau: gio.optional(), gioKetThuc: gio.optional(),
  hanDangKy: thoiDiem.optional(), cacMaSan: z.array(maSo).min(1).max(30).optional(),
  soLuongToiDa: z.coerce.number().int().min(1).max(10000).optional(),
  trinhDoTu: trinhDo.optional(), trinhDoDen: trinhDo.optional(),
  cheDoDuyet: z.enum(['auto', 'manual']).optional(),
  phi: z.coerce.number().int().min(0).max(10000000).optional(),
  ghiChuPhi: z.string().max(255).nullable().optional(),
  lyDoThayDoi: z.string().trim().max(255).optional(),
  themHangMuc: z.array(hangMuc).max(30).optional(),
  suaHangMuc: z.array(hangMucSua).max(30).optional(),
  xoaHangMuc: z.array(maSo).max(30).optional(),
}).refine((d) => Object.keys(d).length > 0, 'Vui lòng nhập ít nhất một thông tin cần sửa')
  .superRefine((d, ctx) => {
    if (d.gioBatDau && d.gioKetThuc && d.gioKetThuc <= d.gioBatDau) {
      ctx.addIssue({ code: 'custom', path: ['gioKetThuc'], message: 'Giờ kết thúc phải sau giờ bắt đầu' });
    }
    if (d.trinhDoTu !== undefined && d.trinhDoDen !== undefined && d.trinhDoTu > d.trinhDoDen) {
      ctx.addIssue({ code: 'custom', path: ['trinhDoDen'], message: 'Trình độ đến phải lớn hơn hoặc bằng trình độ từ' });
    }
  });

exports.maSuKien = { params: z.object({ maSuKien: maSo }) };
exports.maDangKy = { params: z.object({ maDangKy: maSo }) };
exports.taoSuKien = { body: taoBody };
exports.suaSuKien = { params: z.object({ maSuKien: maSo }), body: suaBody };
exports.dongMoSuKien = { params: z.object({ maSuKien: maSo }) };
exports.huySuKien = { params: z.object({ maSuKien: maSo }), body: z.object({ lyDo }) };
exports.danhSachChu = { query: z.object({ trangThai: z.enum(['open', 'closed', 'finished', 'cancelled']).optional(), ...phanTrang }) };
exports.danhSachDangKy = {
  params: z.object({ maSuKien: maSo }),
  query: z.object({ trangThai: z.enum(['pending', 'accepted', 'cancelled', 'rejected']).optional(), maHangMuc: maSo.optional(), ...phanTrang }),
};
exports.tuChoiDangKy = { params: z.object({ maDangKy: maSo }), body: z.object({ lyDo: z.string().trim().max(255).optional() }).default({}) };
exports.loaiDangKy = { params: z.object({ maDangKy: maSo }), body: z.object({ lyDo }) };
exports.lyDoThanhToan = { params: z.object({ maDangKy: maSo }), body: z.object({ lyDo }) };
exports.danhSachKhach = {
  query: z.object({
    khuVuc: z.string().trim().min(2).max(120).optional(), maCoSo: maSo.optional(), ngay: ngay.optional(),
    loai: z.enum(['social', 'tournament']).optional(), trinhDo: trinhDo.optional(),
    phi: z.enum(['free', 'paid']).optional(), conCho: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    ...phanTrang,
  }),
};
exports.chiTietKhach = { params: z.object({ maSuKien: maSo }) };
exports.dangKyKhach = {
  params: z.object({ maSuKien: maSo }),
  body: z.object({
    maHangMuc: maSo.optional(), trinhDoKhai: trinhDo.optional(),
    tenDongDoi: z.string().trim().min(1).max(100).optional(),
    sdtDongDoi: quyTac.soDienThoaiDiDong.optional(),
  }),
};
exports.rutDangKy = { params: z.object({ maDangKy: maSo }) };
// Hủy đăng ký: có tiền hoàn thì body PHẢI có taiKhoanHoan (BE kiểm tra lại theo số tiền hoàn thật).
exports.huyDangKy = {
  params: z.object({ maDangKy: maSo }),
  body: z.object({
    taiKhoanHoan: z.object({
      maNganHang: z.string({ error: 'Vui lòng chọn ngân hàng.' }).trim().min(2, 'Vui lòng chọn ngân hàng.').max(20),
      soTaiKhoan: z.string({ error: 'Số tài khoản chỉ gồm 6–30 chữ số.' })
        .transform((giaTri) => giaTri.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(/^\d{6,30}$/, 'Số tài khoản chỉ gồm 6–30 chữ số.')),
      chuTaiKhoan: z.string({ error: 'Vui lòng nhập tên chủ tài khoản.' }).trim()
        .min(2, 'Vui lòng nhập tên chủ tài khoản.').max(100, 'Tên chủ tài khoản tối đa 100 ký tự.'),
    }).optional(),
  }).default({}),
};
exports.dangKyCuaToi = {
  query: z.object({ trangThai: z.enum(['pending', 'accepted', 'cancelled', 'rejected']).optional(), ...phanTrang }),
};
exports.thoiDiemChuyen = {
  params: z.object({ maDangKy: maSo }),
  body: z.object({ thoiDiemChuyen: z.string().trim().max(40).optional() }).default({}),
};
