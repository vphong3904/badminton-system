const { z } = require('zod');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải dạng HH:MM');
const id = z.coerce.number().int().positive();

const venue = z.object({
  name: z.string().trim().min(2).max(150),
  address: z.string().trim().min(5).max(255),
  province_id: z.number().int().positive(),
  district_id: z.number().int().positive().optional(),
  phone: z.string().trim().regex(/^(0|\+84)\d{9,10}$/),
  zalo: z.string().trim().max(30).optional(),
  map_url: z.string().url().max(500),
  description: z.string().max(2000).optional(),
  court_count: z.number().int().min(1).max(50),
  open_time: hhmm,
  close_time: hhmm,
  min_booking_minutes: z.number().int().refine((v) => v % 30 === 0 && v >= 30, 'Phải là bội số của 30 phút'),
}).refine((v) => v.open_time < v.close_time, { message: 'Giờ đóng cửa phải sau giờ mở cửa', path: ['close_time'] });

const priceSlot = z.object({
  start_time: hhmm, end_time: hhmm,
  fixed_price: z.number().int().min(0).max(10_000_000),
  walkin_price: z.number().int().min(0).max(10_000_000),
});

exports.venue = { body: venue };
exports.prices = { body: z.object({ slots: z.array(priceSlot).min(1).max(24) }) };
exports.bank = {
  body: z.object({
    bank_name: z.string().trim().min(2).max(100),
    bank_account_no: z.string().trim().regex(/^\d{6,20}$/, 'Số tài khoản không hợp lệ'),
    bank_account_name: z.string().trim().min(2).max(100),
  }),
};
exports.court = { body: z.object({ name: z.string().trim().min(1).max(50), status: z.enum(['active', 'inactive']).optional() }) };
exports.courtId = { params: z.object({ id }) };
exports.courtUpdate = { params: z.object({ id }), body: z.object({ name: z.string().trim().min(1).max(50).optional(), status: z.enum(['active', 'inactive']).optional() }) };
exports.block = {
  body: z.object({
    court_id: z.number().int().positive(),
    start_at: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Dạng YYYY-MM-DD HH:MM'),
    end_at: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/, 'Dạng YYYY-MM-DD HH:MM'),
    reason: z.string().max(255).optional(),
  }).refine((b) => b.start_at < b.end_at, { message: 'Thời gian kết thúc phải sau bắt đầu', path: ['end_at'] }),
};
exports.blockList = { query: z.object({ court_id: id.optional(), from: z.string().optional(), to: z.string().optional() }) };
exports.blockId = { params: z.object({ id }) };
