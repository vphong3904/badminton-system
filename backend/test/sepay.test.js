const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.SEPAY_WEBHOOK_SECRET = 'test-secret';
process.env.SEPAY_BANK_ACCOUNT = '1234567890';

const giaoDichDaNhan = new Set();
const trangThai = {
  thanhToan: 'pending',
  donDatSan: 'pending_payment',
  conHan: true,
  trangThaiDoiSoat: null,
};
const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    if (/INSERT IGNORE INTO GiaoDichSePay/.test(cauTruyVan)) {
      if (giaoDichDaNhan.has(thamSo[0])) return [{ affectedRows: 0 }];
      giaoDichDaNhan.add(thamSo[0]);
      return [{ affectedRows: 1 }];
    }
    if (/SELECT t\.MaThanhToan AS maThanhToan/.test(cauTruyVan)) {
      return trangThai.thanhToan === 'success' || trangThai.thanhToan === 'late_payment'
        ? [[]]
        : [[{
          maThanhToan: 4,
          maDatSan: 8,
          soTien: 200000,
          trangThaiThanhToan: trangThai.thanhToan,
          noiDungChuyenKhoan: 'BK261030ABC123',
          maLichCoDinh: null,
          trangThaiDatSan: trangThai.donDatSan,
          hetHanGiuCho: '2026-10-31 12:00:00',
        }]];
    }
    if (/SELECT MaDatSan AS maDatSan/.test(cauTruyVan)) {
      return [[{ maDatSan: 8, trangThai: trangThai.donDatSan, hetHanGiuCho: '2026-10-31 12:00:00' }]];
    }
    if (/SELECT \? > NOW\(\)/.test(cauTruyVan)) return [[{ conHan: trangThai.conHan ? 1 : 0 }]];
    if (/UPDATE ThanhToan SET TrangThai='success'/.test(cauTruyVan)) {
      trangThai.thanhToan = 'success';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE ThanhToan SET TrangThai='late_payment'/.test(cauTruyVan)) {
      trangThai.thanhToan = 'late_payment';
      trangThai.trangThaiHoanTien = 'waiting_info';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE DatSan SET TrangThai='confirmed'/.test(cauTruyVan)) {
      trangThai.donDatSan = 'confirmed';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE DatSan SET TrangThai='expired'/.test(cauTruyVan)) {
      trangThai.donDatSan = 'expired';
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE GiaoDichSePay SET TrangThaiDoiSoat=/.test(cauTruyVan)) {
      trangThai.trangThaiDoiSoat = thamSo[1] ? 'updated' : null;
      return [{ affectedRows: 1 }];
    }
    if (/UPDATE GiaoDichSePay SET MaThanhToan=/.test(cauTruyVan)) return [{ affectedRows: 1 }];
    throw new Error(`Chưa giả lập truy vấn: ${cauTruyVan}`);
  },
};

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: ketNoiGia,
    thucHienGiaoDich: async (hamThucThi) => hamThucThi(ketNoiGia),
  },
};
const { xacThucChuKyHmac } = require('../src/services/paymentService');
const { xuLyWebhookSePay } = require('../src/services/paymentService');

function taoChuKy(noiDung, timestamp, secret = 'test-secret') {
  const chuKy = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${noiDung}`)
    .digest('hex');
  return `sha256=${chuKy}`;
}

test('Xác thực webhook SePay bằng HMAC trên raw body', () => {
  const thoiGian = Math.floor(Date.now() / 1000);
  const rawBody = Buffer.from('{"id":123,"transferType":"in"}');
  const headers = {
    'x-sepay-timestamp': String(thoiGian),
    'x-sepay-signature': taoChuKy(rawBody.toString(), thoiGian),
  };
  assert.equal(xacThucChuKyHmac(rawBody, headers), true);
  assert.equal(xacThucChuKyHmac(Buffer.from(`${rawBody.toString()} `), headers), false);
  assert.equal(xacThucChuKyHmac(rawBody, { ...headers, 'x-sepay-signature': 'sha256=invalid' }), false);
});

test('Từ chối webhook thiếu chữ ký hoặc timestamp quá hạn', () => {
  const thoiGian = Math.floor(Date.now() / 1000) - 301;
  const rawBody = Buffer.from('{"id":123}');
  assert.equal(xacThucChuKyHmac(rawBody, {}), false);
  assert.equal(xacThucChuKyHmac(rawBody, {
    'x-sepay-timestamp': String(thoiGian),
    'x-sepay-signature': taoChuKy(rawBody.toString(), thoiGian),
  }), false);
});

test('Webhook xác nhận đúng hóa đơn và không ghi nhận lại khi SePay retry', async () => {
  giaoDichDaNhan.clear();
  trangThai.thanhToan = 'pending';
  trangThai.donDatSan = 'pending_payment';
  trangThai.conHan = true;
  const duLieu = {
    id: 901,
    transactionDate: '2026-10-30T12:00:00Z',
    accountNumber: '1234567890',
    transferType: 'in',
    transferAmount: 200000,
    content: 'Thanh toan BK261030ABC123',
    referenceCode: 'REF-901',
  };
  const lanDau = await xuLyWebhookSePay(duLieu);
  const guiLai = await xuLyWebhookSePay(duLieu);
  assert.equal(lanDau.trangThaiDoiSoat, 'matched');
  assert.equal(guiLai.daXuLyTruoc, true);
  assert.equal(trangThai.thanhToan, 'success');
  assert.equal(trangThai.donDatSan, 'confirmed');
});

test('Webhook tiền đến sau hạn được đưa vào hàng đợi hoàn tiền', async () => {
  giaoDichDaNhan.clear();
  trangThai.thanhToan = 'pending';
  trangThai.donDatSan = 'pending_payment';
  trangThai.conHan = false;
  const ketQua = await xuLyWebhookSePay({
    id: 902,
    transactionDate: '2026-10-30T12:00:00Z',
    accountNumber: '1234567890',
    transferType: 'in',
    transferAmount: 200000,
    content: 'Thanh toan BK261030ABC123',
  });
  assert.equal(ketQua.trangThaiDoiSoat, 'late');
  assert.equal(trangThai.thanhToan, 'late_payment');
  assert.equal(trangThai.trangThaiHoanTien, 'waiting_info');
  assert.equal(trangThai.donDatSan, 'expired');
});
