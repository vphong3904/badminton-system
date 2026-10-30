const AppError = require('./AppError');

/** "HH:MM" -> số phút */
const toMin = (t) => { const [h, m] = String(t).split(':'); return Number(h) * 60 + Number(m); };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Kiểm tra các khung giá: end > start, nằm trong giờ mở cửa, không chồng nhau. */
function validatePriceSlots(slots, openTime, closeTime) {
  const o = toMin(openTime), c = toMin(closeTime);
  const sorted = [...slots].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  let prevEnd = -1;
  for (const s of sorted) {
    const st = toMin(s.start_time), en = toMin(s.end_time);
    if (en <= st) throw AppError.badRequest(`Khung giờ ${s.start_time}-${s.end_time} không hợp lệ`);
    if (st < o || en > c) throw AppError.badRequest(`Khung giờ ${s.start_time}-${s.end_time} nằm ngoài giờ mở cửa ${openTime}-${closeTime}`);
    if (st < prevEnd) throw AppError.badRequest('Các khung giờ giá bị chồng nhau');
    prevEnd = en;
  }
}
module.exports = { toMin, toHHMM, validatePriceSlots };
