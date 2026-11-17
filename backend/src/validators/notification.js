const { z } = require('zod');

const maSo = z.coerce.number().int().positive();

exports.danhSach = {
  query: z.object({
    trang: z.coerce.number().int().min(1).default(1),
    soLuong: z.coerce.number().int().min(1).max(50).default(30),
    chiChuaDoc: z.enum(['true', 'false']).default('false').transform((giaTri) => giaTri === 'true'),
  }),
};
exports.maThongBao = { params: z.object({ maThongBao: maSo }) };
