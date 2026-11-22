// Task 0.1: db_sancaulong.sql và migration-task0-nen-tang.sql phải đồng bộ (khoá cấu hình mục D, confirm_minutes=30,
// NhatKyHeThong.DuLieuTruoc/DuLieuSau kiểu TEXT).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const schema = doc('db_sancaulong.sql');
const migration = doc('scripts', 'migration-task0-nen-tang.sql');

const KHOA_MOI = [
  'confirm_urgent_minutes', 'urgent_threshold_minutes', 'reconcile_hold_minutes', 'topup_minutes', 'overpay_refund_hours',
  'refund_deadline_hours', 'refund_grace_hours', 'owner_cancel_reply_hours', 'noshow_wait_minutes', 'checkin_open_minutes',
  'incident_admin_minutes', 'complaint_days', 'owner_response_hours', 'appeal_hours', 'strike_lock_count',
  'abuse_threshold', 'abuse_window_hours', 'reschedule_min_hours', 'reschedule_max_count', 'reschedule_range_days',
];
const giaTri = (sql, khoa) => sql.match(new RegExp(`\\('${khoa}',\\s*'([^']*)'`))?.[1];

test('Schema và migration có đủ khoá mục D, cùng giá trị', () => {
  for (const khoa of KHOA_MOI) {
    assert.ok(giaTri(schema, khoa) !== undefined, `schema thiếu ${khoa}`);
    assert.equal(giaTri(schema, khoa), giaTri(migration, khoa), `lệch giá trị ${khoa}`);
  }
});

test('confirm_minutes = 30 trong schema; migration chỉ đổi khi còn 60', () => {
  assert.equal(giaTri(schema, 'confirm_minutes'), '30');
  assert.match(migration, /SET GiaTri = '30'\s+WHERE KhoaCauHinh = 'confirm_minutes' AND GiaTri = '60'/);
});

test('NhatKyHeThong có DuLieuTruoc/DuLieuSau kiểu TEXT (tương thích MariaDB)', () => {
  const bang = schema.match(/CREATE TABLE NhatKyHeThong \(([\s\S]*?)\) ENGINE/)[1];
  assert.match(bang, /DuLieuTruoc\s+TEXT NULL/);
  assert.match(bang, /DuLieuSau\s+TEXT NULL/);
  assert.doesNotMatch(bang, /\bJSON\b\s+NULL/);
  assert.match(migration, /ADD COLUMN DuLieuTruoc TEXT NULL/);
  assert.match(migration, /ADD COLUMN DuLieuSau TEXT NULL/);
});

test('Migration idempotent: INSERT IGNORE + kiểm cột trước khi ALTER', () => {
  assert.match(migration, /INSERT IGNORE INTO CauHinhHeThong/);
  assert.match(migration, /INFORMATION_SCHEMA\.COLUMNS/);
});

test('Giá trị đã chốt ở 0.8 (DECISIONS.md) khớp schema', () => {
  const CHOT = { reconcile_hold_minutes: '30', noshow_wait_minutes: '30', incident_admin_minutes: '30', abuse_threshold: '5',
    abuse_window_hours: '24', reschedule_min_hours: '24', reschedule_max_count: '1', reschedule_range_days: '7', owner_cancel_reply_hours: '24' };
  for (const [khoa, v] of Object.entries(CHOT)) assert.equal(giaTri(schema, khoa), v, khoa);
});
