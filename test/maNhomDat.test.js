// Task 2.1: DatSan.MaNhomDat — kiểm tra file SQL (không cần MySQL): migration chạy lại được nhiều lần,
// backfill = MaDatSan cho dòng cũ, schema mới + seed khớp migration.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const doc = (...phan) => fs.readFileSync(path.join(__dirname, '..', ...phan), 'utf8');
const migration = doc('scripts', 'migration-t2-ma-nhom-dat.sql');
const schema = doc('db_sancaulong.sql');

// Chỉ giữ lệnh SQL, bỏ dòng chú thích.
const lenh = (noiDung) => noiDung.split('\n').filter((dong) => !dong.trim().startsWith('--')).join('\n');

test('Migration chỉ thêm cột MaNhomDat khi chưa có (chạy lại an toàn)', () => {
  const sql = lenh(migration);
  assert.match(sql, /INFORMATION_SCHEMA\.COLUMNS[\s\S]*TABLE_NAME = 'DatSan' AND COLUMN_NAME = 'MaNhomDat'/);
  assert.match(sql, /IF\(@co = 0,\s*'ALTER TABLE DatSan ADD COLUMN MaNhomDat INT UNSIGNED NULL/);
});

test('Migration backfill MaNhomDat = MaDatSan chỉ cho dòng còn NULL', () => {
  assert.match(lenh(migration), /UPDATE DatSan SET MaNhomDat = MaDatSan WHERE MaNhomDat IS NULL;/);
});

test('Migration thêm index IDX_DatSan_NhomDat khi chưa có, sau bước backfill', () => {
  const sql = lenh(migration);
  assert.match(sql, /INFORMATION_SCHEMA\.STATISTICS[\s\S]*INDEX_NAME = 'IDX_DatSan_NhomDat'/);
  assert.match(sql, /ADD KEY IDX_DatSan_NhomDat \(MaNhomDat\)/);
  assert.ok(sql.indexOf('SET MaNhomDat = MaDatSan') < sql.indexOf('ADD KEY IDX_DatSan_NhomDat'));
});

test('Migration không dùng cú pháp chỉ MySQL 8 (chạy được cả MariaDB)', () => {
  assert.equal(/ADD COLUMN IF NOT EXISTS|ADD KEY IF NOT EXISTS|ALGORITHM\s*=\s*INSTANT/i.test(lenh(migration)), false);
});

test('db_sancaulong.sql: bảng DatSan có MaNhomDat (NULL được) và index, đặt sau MaLichCoDinh', () => {
  const bang = schema.slice(schema.indexOf('CREATE TABLE DatSan ('));
  const khoiBang = bang.slice(0, bang.indexOf('ENGINE=InnoDB'));
  assert.match(khoiBang, /MaNhomDat\s+INT UNSIGNED NULL/);
  assert.match(khoiBang, /KEY IDX_DatSan_NhomDat \(MaNhomDat\)/);
  assert.ok(khoiBang.indexOf('MaLichCoDinh        INT') < khoiBang.indexOf('MaNhomDat '));
});

test('db_sancaulong.sql: seed DatSan được backfill MaNhomDat = MaDatSan sau lần INSERT cuối', () => {
  const viTriInsertCuoi = schema.lastIndexOf('INSERT INTO DatSan');
  const viTriBackfill = schema.indexOf('UPDATE DatSan SET MaNhomDat = MaDatSan WHERE MaNhomDat IS NULL;');
  assert.ok(viTriBackfill > viTriInsertCuoi, 'backfill phải nằm sau mọi INSERT DatSan');
});
