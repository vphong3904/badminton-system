const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { validatePriceSlots } = require('../utils/time');

const EDITABLE = ['draft', 'rejected'];

async function getProfile(ownerId) {
  const [[p]] = await pool.query('SELECT * FROM owner_profiles WHERE user_id = ?', [ownerId]);
  return p;
}
async function getVenue(ownerId) {
  const [[v]] = await pool.query('SELECT * FROM venues WHERE owner_id = ?', [ownerId]);
  return v || null;
}
async function mustVenue(ownerId) {
  const v = await getVenue(ownerId);
  if (!v) throw AppError.badRequest('Bạn chưa khai báo thông tin sân (bước 1)');
  return v;
}
async function assertEditable(ownerId) {
  const p = await getProfile(ownerId);
  if (!EDITABLE.includes(p.approval_status)) {
    throw AppError.conflict(p.approval_status === 'pending'
      ? 'Hồ sơ đang chờ duyệt, không thể chỉnh sửa' : 'Hồ sơ đã duyệt, hãy dùng chức năng chỉnh sửa sân');
  }
}

/* ---------- Onboarding ---------- */
async function onboardingState(ownerId) {
  const profile = await getProfile(ownerId);
  const venue = await getVenue(ownerId);
  const [slots] = venue ? await pool.query('SELECT * FROM price_slots WHERE venue_id = ? ORDER BY start_time', [venue.id]) : [[]];
  return {
    approval_status: profile.approval_status,
    reject_reason: profile.reject_reason,
    submitted_at: profile.submitted_at,
    steps: { venue: !!venue, prices: slots.length > 0, bank: !!profile.bank_account_no },
    venue, price_slots: slots,
    bank: { bank_name: profile.bank_name, bank_account_no: profile.bank_account_no, bank_account_name: profile.bank_account_name },
  };
}

async function saveVenueStep(ownerId, d) {
  await assertEditable(ownerId);
  const existing = await getVenue(ownerId);
  const cols = [d.name, d.address, d.province_id, d.district_id ?? null, d.phone, d.zalo ?? null, d.map_url,
    d.description ?? null, d.court_count, d.open_time, d.close_time, d.min_booking_minutes];
  if (existing) {
    // Giờ mở cửa mới phải còn chứa các khung giá đã khai báo
    const [slots] = await pool.query('SELECT start_time, end_time, fixed_price, walkin_price FROM price_slots WHERE venue_id = ?', [existing.id]);
    validatePriceSlots(slots.map((s) => ({ ...s, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) })), d.open_time, d.close_time);
    await pool.query(
      `UPDATE venues SET name=?, address=?, province_id=?, district_id=?, phone=?, zalo=?, map_url=?, description=?,
       court_count=?, open_time=?, close_time=?, min_booking_minutes=? WHERE id=?`, [...cols, existing.id]);
  } else {
    await pool.query(
      `INSERT INTO venues (name, address, province_id, district_id, phone, zalo, map_url, description,
       court_count, open_time, close_time, min_booking_minutes, owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...cols, ownerId]);
  }
  return onboardingState(ownerId);
}

/** Thay toàn bộ bảng giá (dùng cho cả onboarding lẫn chỉnh sửa sau khi duyệt). */
async function replacePrices(ownerId, slots) {
  const v = await mustVenue(ownerId);
  validatePriceSlots(slots, v.open_time.slice(0, 5), v.close_time.slice(0, 5));
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM price_slots WHERE venue_id = ?', [v.id]);
    await conn.query('INSERT INTO price_slots (venue_id, start_time, end_time, fixed_price, walkin_price) VALUES ?',
      [slots.map((s) => [v.id, s.start_time, s.end_time, s.fixed_price, s.walkin_price])]);
  });
  const [rows] = await pool.query('SELECT * FROM price_slots WHERE venue_id = ? ORDER BY start_time', [v.id]);
  return rows;
}
async function savePricesStep(ownerId, slots) {
  await assertEditable(ownerId);
  await replacePrices(ownerId, slots);
  return onboardingState(ownerId);
}

async function saveBankStep(ownerId, b) {
  await pool.query('UPDATE owner_profiles SET bank_name=?, bank_account_no=?, bank_account_name=? WHERE user_id=?',
    [b.bank_name, b.bank_account_no, b.bank_account_name, ownerId]);
  return onboardingState(ownerId);
}

async function submitOnboarding(ownerId) {
  await assertEditable(ownerId);
  const s = await onboardingState(ownerId);
  const missing = Object.entries({ 'thông tin sân': s.steps.venue, 'bảng giá': s.steps.prices, 'tài khoản ngân hàng': s.steps.bank })
    .filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) throw AppError.badRequest(`Chưa hoàn thành: ${missing.join(', ')}`);
  await pool.query(
    `UPDATE owner_profiles SET approval_status='pending', submitted_at=NOW(), reject_reason=NULL,
     reviewed_by=NULL, reviewed_at=NULL WHERE user_id=?`, [ownerId]);
  return onboardingState(ownerId);
}

/* ---------- Sau khi được duyệt ---------- */
async function updateVenue(ownerId, d) {
  const v = await mustVenue(ownerId);
  const [slots] = await pool.query('SELECT start_time, end_time FROM price_slots WHERE venue_id = ?', [v.id]);
  validatePriceSlots(slots.map((s) => ({ start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) })), d.open_time, d.close_time);
  await pool.query(
    `UPDATE venues SET name=?, address=?, province_id=?, district_id=?, phone=?, zalo=?, map_url=?, description=?,
     court_count=?, open_time=?, close_time=?, min_booking_minutes=? WHERE id=?`,
    [d.name, d.address, d.province_id, d.district_id ?? null, d.phone, d.zalo ?? null, d.map_url, d.description ?? null,
      d.court_count, d.open_time, d.close_time, d.min_booking_minutes, v.id]);
  return getVenue(ownerId);
}

async function setVenueImage(ownerId, url) {
  const v = await mustVenue(ownerId);
  await pool.query('UPDATE venues SET image_url = ? WHERE id = ?', [url, v.id]);
  return { image_url: url };
}

async function listCourts(ownerId) {
  const v = await mustVenue(ownerId);
  const [rows] = await pool.query('SELECT * FROM courts WHERE venue_id = ? ORDER BY id', [v.id]);
  return rows;
}
async function createCourt(ownerId, d) {
  const v = await mustVenue(ownerId);
  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM courts WHERE venue_id = ?', [v.id]);
  if (n >= v.court_count) throw AppError.conflict(`Đã đủ ${v.court_count} sân đã khai báo; hãy tăng số sân trong thông tin sân`);
  try {
    const [r] = await pool.query('INSERT INTO courts (venue_id, name, status) VALUES (?,?,?)', [v.id, d.name, d.status || 'active']);
    return (await pool.query('SELECT * FROM courts WHERE id = ?', [r.insertId]))[0][0];
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') throw AppError.conflict('Tên sân đã tồn tại'); throw e; }
}
async function ownCourt(ownerId, courtId) {
  const [[c]] = await pool.query(
    'SELECT c.* FROM courts c JOIN venues v ON v.id = c.venue_id WHERE c.id = ? AND v.owner_id = ?', [courtId, ownerId]);
  if (!c) throw AppError.notFound('Không tìm thấy sân');
  return c;
}
async function updateCourt(ownerId, courtId, d) {
  const c = await ownCourt(ownerId, courtId);
  try {
    await pool.query('UPDATE courts SET name=?, status=? WHERE id=?', [d.name ?? c.name, d.status ?? c.status, c.id]);
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') throw AppError.conflict('Tên sân đã tồn tại'); throw e; }
  return ownCourt(ownerId, courtId);
}

/* ---------- Court blocks ---------- */
async function createBlock(ownerId, d) {
  await ownCourt(ownerId, d.court_id);
  const [[clash]] = await pool.query(
    `SELECT bs.id FROM booking_slots bs WHERE bs.court_id = ? AND bs.is_active = 1
     AND TIMESTAMP(bs.slot_date, bs.start_time) < ? AND TIMESTAMP(bs.slot_date, bs.end_time) > ? LIMIT 1`,
    [d.court_id, d.end_at, d.start_at]);
  if (clash) throw AppError.conflict('Khoảng giờ này đã có khách đặt, hãy hủy đơn trước khi khóa');
  const [r] = await pool.query('INSERT INTO court_blocks (court_id, start_at, end_at, reason, created_by) VALUES (?,?,?,?,?)',
    [d.court_id, d.start_at, d.end_at, d.reason ?? null, ownerId]);
  return (await pool.query('SELECT * FROM court_blocks WHERE id = ?', [r.insertId]))[0][0];
}
async function listBlocks(ownerId, q) {
  const v = await mustVenue(ownerId);
  const params = [v.id];
  let sql = `SELECT b.* FROM court_blocks b JOIN courts c ON c.id = b.court_id WHERE c.venue_id = ?`;
  if (q.court_id) { sql += ' AND b.court_id = ?'; params.push(q.court_id); }
  if (q.from) { sql += ' AND b.end_at >= ?'; params.push(q.from); }
  if (q.to) { sql += ' AND b.start_at <= ?'; params.push(q.to); }
  const [rows] = await pool.query(sql + ' ORDER BY b.start_at', params);
  return rows;
}
async function deleteBlock(ownerId, id) {
  const [r] = await pool.query(
    `DELETE b FROM court_blocks b JOIN courts c ON c.id = b.court_id JOIN venues v ON v.id = c.venue_id
     WHERE b.id = ? AND v.owner_id = ?`, [id, ownerId]);
  if (!r.affectedRows) throw AppError.notFound('Không tìm thấy khóa giờ');
}

module.exports = { onboardingState, saveVenueStep, savePricesStep, saveBankStep, submitOnboarding,
  updateVenue, replacePrices, setVenueImage, getVenue, listCourts, createCourt, updateCourt, createBlock, listBlocks, deleteBlock };
