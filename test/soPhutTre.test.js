// Task 1.1: CoSo.SoPhutTreToiDa — validator 15/20/30 + schema/migration đồng bộ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const kiemTraChuSan = require('../src/validators/owner');

const doc = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const schema = doc('db_sancaulong.sql');
const migration = doc('scripts', 'migration-t1-so-phut-tre.sql');

const duLieuCoSo = {
  tenCoSo: 'San Cau Long', diaChi: '123 Duong ABC', tinhThanh: 'Ha Noi', quanHuyen: 'Cau Giay',
  soDienThoai: '0901234567', linkBanDo: 'https://maps.app.goo.gl/AbCdEf123',
  gioMoCua: '06:00', gioDongCua: '22:00', soPhutDatToiThieu: 60,
};
const kiemTra = (them) => kiemTraChuSan.coSo.body.safeParse({ ...duLieuCoSo, ...them });

test('Validator chấp nhận 15, 20, 30 phút', () => {
  for (const soPhut of [15, 20, 30]) {
    const ketQua = kiemTra({ soPhutTreToiDa: soPhut });
    assert.equal(ketQua.success, true, `phải nhận ${soPhut}`);
    assert.equal(ketQua.data.soPhutTreToiDa, soPhut);
  }
});

test('Validator từ chối giá trị khác 15/20/30', () => {
  for (const sai of [0, 10, 16, 25, 45, 60, -15, 15.5, '15', null]) {
    assert.equal(kiemTra({ soPhutTreToiDa: sai }).success, false, `phải từ chối ${JSON.stringify(sai)}`);
  }
});

test('Không gửi soPhutTreToiDa vẫn hợp lệ (giữ nguyên giá trị cũ / mặc định 15 ở DB)', () => {
  const ketQua = kiemTra({});
  assert.equal(ketQua.success, true);
  assert.equal(ketQua.data.soPhutTreToiDa, undefined);
});

test('Cùng validator cho PUT /chu-san/co-so/:maCoSo', () => {
  const body = { ...duLieuCoSo, soPhutTreToiDa: 25 };
  assert.equal(kiemTraChuSan.capNhatCoSoTheoMa.body.safeParse(body).success, false);
  assert.equal(kiemTraChuSan.capNhatCoSoTheoMa.body.safeParse({ ...body, soPhutTreToiDa: 20 }).success, true);
});

test('Schema: CoSo.SoPhutTreToiDa mặc định 15 + CHECK 15/20/30', () => {
  const bang = schema.match(/CREATE TABLE CoSo \(([\s\S]*?)\) ENGINE/)[1];
  assert.match(bang, /SoPhutTreToiDa\s+SMALLINT UNSIGNED NOT NULL DEFAULT 15/);
  assert.match(bang, /CONSTRAINT CHK_CoSo_SoPhutTre CHECK \(SoPhutTreToiDa IN \(15, 20, 30\)\)/);
});

test('Migration: thêm cột + CHECK giống schema, chạy lại an toàn', () => {
  assert.match(migration, /ADD COLUMN SoPhutTreToiDa SMALLINT UNSIGNED NOT NULL DEFAULT 15/);
  assert.match(migration, /ADD CONSTRAINT CHK_CoSo_SoPhutTre CHECK \(SoPhutTreToiDa IN \(15, 20, 30\)\)/);
  assert.match(migration, /INFORMATION_SCHEMA\.COLUMNS[\s\S]*COLUMN_NAME = 'SoPhutTreToiDa'/);
  assert.match(migration, /INFORMATION_SCHEMA\.TABLE_CONSTRAINTS[\s\S]*CONSTRAINT_NAME = 'CHK_CoSo_SoPhutTre'/);
});
