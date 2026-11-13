const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.BANK_CODE = 'VIB';
process.env.BANK_ACCOUNT_NUMBER = 'BLC2603003960';
process.env.BANK_ACCOUNT_NAME = 'TRINH THI NGOC LAN';

// Trạng thái giả lập 1 đơn: khách gửi ảnh → chủ sân xác nhận/từ chối.
const db = {
  thanhToan: 'pending',
  donDatSan: 'pending_payment',
  conHan: true,
  anh: null,
  lyDo: null,
  hetHanDuocKeoDai: false,
  chuSanXacNhan: null,
};
const cacTruyVan = [];
const ketNoiGia = {
  async query(sql, thamSo = []) {
    cacTruyVan.push({ sql, thamSo });
    if (/FROM DatSan d JOIN ThanhToan t/.test(sql)) {
      return [[{
        maThanhToan: 4, soTien: 75000, trangThai: db.thanhToan, noiDungChuyenKhoan: 'BK261112ABC123',
        maDatSan: 8, maLichCoDinh: null, maKhachHang: 7, trangThaiDatSan: db.donDatSan,
        hetHanGiuCho: '2026-11-12 12:00:00',
      }]];
    }
    if (/FROM DatSan d JOIN San s/.test(sql)) {
      return [[{
        maThanhToan: 4, maDatSanThanhToan: 8, trangThai: db.thanhToan, anhChuyenKhoan: db.anh,
        maDatSan: 8, maLichCoDinh: null, trangThaiDatSan: db.donDatSan,
      }]];
    }
    if (/SELECT \? > NOW\(\)/.test(sql)) return [[{ conHan: db.conHan ? 1 : 0 }]];
    if (/SELECT AnhChuyenKhoan AS anh/.test(sql)) return [[{ anh: db.anh }]];
    if (/SELECT GiaTri AS giaTri/.test(sql)) return [[{ giaTri: '60' }]];
    if (/SELECT TrangThai AS trangThai FROM DatSan/.test(sql)) return [[{ trangThai: db.donDatSan }]];
    if (/UPDATE ThanhToan SET TrangThai='confirming'/.test(sql)) {
      db.thanhToan = 'confirming'; db.anh = thamSo[0]; db.lyDo = null;
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE ThanhToan SET TrangThai='success'/.test(sql)) {
      db.thanhToan = 'success'; db.chuSanXacNhan = thamSo[0]; db.vaiTro = thamSo[1];
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE ThanhToan SET TrangThai='pending'/.test(sql)) {
      db.thanhToan = 'pending'; db.lyDo = thamSo[0]; db.anh = null;
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE ThanhToan SET TrangThai='late_payment'/.test(sql)) {
      db.thanhToan = 'late_payment';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE ThanhToan SET TrangThai='expired'/.test(sql)) {
      db.thanhToan = 'expired';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE DatSan SET TrangThai='confirmed'/.test(sql)) {
      db.donDatSan = 'confirmed';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE DatSan SET TrangThai='expired'/.test(sql)) {
      db.donDatSan = 'expired';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE DatSan SET HetHanGiuCho=DATE_ADD/.test(sql)) {
      db.hetHanDuocKeoDai = true;
      return [{ affectedRows: 1 }];
    }
    if (/INSERT INTO NhatKyHeThong/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Chưa giả lập truy vấn: ${sql}`);
  },
};
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: ketNoiGia, thucHienGiaoDich: async (ham) => ham(ketNoiGia) },
};

const dichVu = require('../src/services/paymentService');
const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'anh-ck-'));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function taoTep(noiDung, ten) {
  const duongDan = path.join(thuMuc, ten);
  fs.writeFileSync(duongDan, noiDung);
  return { path: duongDan, filename: ten };
}
function datLai() {
  Object.assign(db, {
    thanhToan: 'pending', donDatSan: 'pending_payment', conHan: true, anh: null, lyDo: null,
    hetHanDuocKeoDai: false, chuSanXacNhan: null,
  });
}

test('Khách gửi ảnh: thanh toán → confirming (đợi xác nhận), kéo dài giữ chỗ, đơn chưa confirmed', async () => {
  datLai();
  const ketQua = await dichVu.guiAnhChuyenKhoan(7, 8, taoTep(PNG, 'a1.png'));
  assert.equal(ketQua.trangThaiThanhToan, 'confirming');
  assert.equal(ketQua.anhChuyenKhoanUrl, '/tep-tai-len/a1.png');
  assert.equal(db.thanhToan, 'confirming');
  assert.equal(db.donDatSan, 'pending_payment');
  assert.equal(db.hetHanDuocKeoDai, true);
});

test('Gửi ảnh: thiếu file → 400', async () => {
  datLai();
  await assert.rejects(dichVu.guiAnhChuyenKhoan(7, 8, undefined), { maTrangThai: 400 });
});

test('Gửi ảnh: file không phải ảnh thật (đổi đuôi) → 400 và xoá file', async () => {
  datLai();
  const tep = taoTep(Buffer.from('<?php echo 1; ?>'), 'gia.png');
  await assert.rejects(dichVu.guiAnhChuyenKhoan(7, 8, tep), { maTrangThai: 400 });
  assert.equal(fs.existsSync(tep.path), false);
  assert.equal(db.thanhToan, 'pending');
});

test('Gửi ảnh: đơn hết hạn giữ chỗ → 409, đơn expired, xoá file', async () => {
  datLai();
  db.conHan = false;
  const tep = taoTep(PNG, 'a2.png');
  await assert.rejects(dichVu.guiAnhChuyenKhoan(7, 8, tep), { maTrangThai: 409 });
  assert.equal(db.donDatSan, 'expired');
  assert.equal(db.thanhToan, 'expired');
  assert.equal(fs.existsSync(tep.path), false);
});

test('Gửi ảnh: đơn đã được xác nhận → 409', async () => {
  datLai();
  db.thanhToan = 'success';
  db.donDatSan = 'confirmed';
  await assert.rejects(dichVu.guiAnhChuyenKhoan(7, 8, taoTep(PNG, 'a3.png')), { maTrangThai: 409 });
});

test('Chủ sân xác nhận: thanh toán success và đơn confirmed', async () => {
  datLai();
  db.thanhToan = 'confirming';
  const ketQua = await dichVu.xacNhanThanhToan(3, 8);
  assert.equal(ketQua.trangThaiThanhToan, 'success');
  assert.equal(ketQua.trangThaiDatSan, 'confirmed');
  assert.equal(db.donDatSan, 'confirmed');
  assert.equal(db.chuSanXacNhan, 3);
});

test('Chủ sân xác nhận khi khách chưa gửi ảnh → 409; xác nhận lần 2 → 409', async () => {
  datLai();
  await assert.rejects(dichVu.xacNhanThanhToan(3, 8), { maTrangThai: 409, message: /chưa gửi ảnh/ });
  db.thanhToan = 'confirming';
  await dichVu.xacNhanThanhToan(3, 8);
  db.donDatSan = 'pending_payment';
  await assert.rejects(dichVu.xacNhanThanhToan(3, 8), { maTrangThai: 409, message: /xác nhận trước đó/ });
});

test('Chủ sân xác nhận khi đơn đã hết hạn/huỷ → 409 và không đổi trạng thái', async () => {
  datLai();
  db.thanhToan = 'confirming';
  db.donDatSan = 'expired';
  await assert.rejects(dichVu.xacNhanThanhToan(3, 8), { maTrangThai: 409 });
  assert.equal(db.thanhToan, 'confirming');
});

test('Chủ sân từ chối: quay về pending kèm lý do, khách gửi lại được', async () => {
  datLai();
  db.thanhToan = 'confirming';
  db.anh = '/tep-tai-len/x.png';
  const ketQua = await dichVu.tuChoiThanhToan(3, 8, 'Chưa thấy tiền về');
  assert.equal(ketQua.trangThaiThanhToan, 'pending');
  assert.equal(db.lyDo, 'Chưa thấy tiền về');
  assert.equal(db.anh, null);
  assert.equal(db.donDatSan, 'pending_payment');
  const lai = await dichVu.guiAnhChuyenKhoan(7, 8, taoTep(PNG, 'a4.png'));
  assert.equal(lai.trangThaiThanhToan, 'confirming');
  assert.equal(db.lyDo, null);
});

test('QR VietQR dùng đúng tài khoản cấu hình, không còn SePay', () => {
  const { taoAnhQrUrl } = require('../src/utils/vietqr');
  const url = new URL(taoAnhQrUrl('BK261112ABC123', 75000));
  assert.equal(url.hostname, 'img.vietqr.io');
  assert.equal(url.pathname, '/image/VIB-BLC2603003960-compact2.png');
  assert.equal(url.searchParams.get('amount'), '75000');
  assert.equal(url.searchParams.get('addInfo'), 'BK261112ABC123');
  assert.equal(url.searchParams.get('accountName'), 'TRINH THI NGOC LAN');
});

test('Admin cũng duyệt được: xác nhận ghi vai trò admin + nhật ký; từ chối cũng ghi nhật ký', async () => {
  datLai();
  db.thanhToan = 'confirming';
  cacTruyVan.length = 0;
  const ketQua = await dichVu.xacNhanThanhToan(1, 8, 'admin');
  assert.equal(ketQua.nguoiXacNhan, 'admin');
  assert.equal(db.thanhToan, 'success');
  assert.equal(db.vaiTro, 'admin');
  const truyVanDuyet = cacTruyVan.find((q) => /FROM DatSan d JOIN San s/.test(q.sql));
  assert.doesNotMatch(truyVanDuyet.sql, /cs\.MaChuSan=\?/); // admin không bị giới hạn theo cơ sở
  assert.ok(cacTruyVan.some((q) => /INSERT INTO NhatKyHeThong/.test(q.sql) && q.thamSo[1] === 'xac_nhan_thanh_toan'));

  datLai();
  db.thanhToan = 'confirming';
  cacTruyVan.length = 0;
  await dichVu.tuChoiThanhToan(1, 8, 'Sai số tiền', 'admin');
  assert.ok(cacTruyVan.some((q) => /INSERT INTO NhatKyHeThong/.test(q.sql) && q.thamSo[1] === 'tu_choi_thanh_toan'));
});

test('Chủ sân duyệt: truy vấn bị giới hạn theo cơ sở của chủ sân, không ghi nhật ký admin', async () => {
  datLai();
  db.thanhToan = 'confirming';
  cacTruyVan.length = 0;
  await dichVu.xacNhanThanhToan(3, 8);
  const truyVanDuyet = cacTruyVan.find((q) => /FROM DatSan d JOIN San s/.test(q.sql));
  assert.match(truyVanDuyet.sql, /cs\.MaChuSan=\?/);
  assert.equal(cacTruyVan.some((q) => /NhatKyHeThong/.test(q.sql)), false);
});
