const { z } = require('zod');

exports.maDatSan = {
  params: z.object({ maDatSan: z.coerce.number().int().positive() }),
};
