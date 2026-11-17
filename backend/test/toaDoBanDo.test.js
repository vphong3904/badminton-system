const test = require('node:test');
const assert = require('node:assert/strict');
const { layToaDoTuLink, docToaDoTrongLink, laLinkGoogleMaps } = require('../src/utils/toaDoBanDo');

test('Đọc toạ độ từ link đầy đủ: ưu tiên ghim !3d!4d hơn tâm bản đồ @', () => {
  const link = 'https://www.google.com/maps/place/Cau+Long/@10.8015,106.6401,17z/data=!4m6!3m5!1s0x0:0x1!8m2!3d10.8012!4d106.6399';
  assert.deepEqual(docToaDoTrongLink(link), { viDo: 10.8012, kinhDo: 106.6399 });
});

test('Đọc toạ độ từ @lat,lng và từ ?q= / ?ll= (kể cả %2C)', () => {
  assert.deepEqual(docToaDoTrongLink('https://www.google.com/maps/@10.80,106.63,15z'), { viDo: 10.8, kinhDo: 106.63 });
  assert.deepEqual(docToaDoTrongLink('https://maps.google.com/?q=10.8012,106.6399'), { viDo: 10.8012, kinhDo: 106.6399 });
  assert.deepEqual(docToaDoTrongLink('https://www.google.com/maps?ll=10.8%2C106.6'), { viDo: 10.8, kinhDo: 106.6 });
});

test('Link chỉ có tên địa điểm, rỗng hoặc toạ độ sai -> null', () => {
  assert.equal(docToaDoTrongLink('https://www.google.com/maps/place/San+Cau+Long'), null);
  assert.equal(docToaDoTrongLink(''), null);
  assert.equal(docToaDoTrongLink(undefined), null);
  assert.equal(docToaDoTrongLink('https://maps.google.com/?q=0,0'), null);
  assert.equal(docToaDoTrongLink('https://maps.google.com/?q=95.5,106.6'), null);
});

test('Link rút gọn maps.app.goo.gl: theo redirect lấy link đầy đủ', async () => {
  const cacLanGoi = [];
  const fetchGia = async (url) => {
    cacLanGoi.push(url);
    if (url.startsWith('https://maps.app.goo.gl/')) {
      return { status: 302, headers: new Map([['location', 'https://www.google.com/maps/place/X/@10.85,106.77,17z/data=!3d10.8506!4d106.7719']]) };
    }
    return { status: 200, headers: new Map() };
  };
  const ketQua = await layToaDoTuLink('https://maps.app.goo.gl/AbCdEf123', { fetchFn: fetchGia });
  assert.deepEqual(ketQua, { viDo: 10.8506, kinhDo: 106.7719 });
  assert.equal(cacLanGoi.length, 1);
});

test('Link rút gọn qua trang đồng ý cookie: lấy link gốc trong tham số continue', async () => {
  const fetchGia = async (url) => {
    if (url.startsWith('https://maps.app.goo.gl/')) {
      return { status: 302, headers: new Map([['location', 'https://consent.google.com/ml?continue=' + encodeURIComponent('https://www.google.com/maps/@10.9,106.7,17z')]]) };
    }
    return { status: 200, headers: new Map() };
  };
  assert.deepEqual(await layToaDoTuLink('https://maps.app.goo.gl/zzz', { fetchFn: fetchGia }), { viDo: 10.9, kinhDo: 106.7 });
});

test('Không bao giờ gọi mạng tới host ngoài Google (chống SSRF) và lỗi mạng -> null', async () => {
  let daGoi = false;
  const fetchGia = async () => { daGoi = true; throw new Error('mang loi'); };
  assert.equal(await layToaDoTuLink('https://evil.example.com/maps/abc', { fetchFn: fetchGia }), null);
  assert.equal(daGoi, false);
  const chuyenHuongRa = async () => ({ status: 302, headers: new Map([['location', 'http://169.254.169.254/latest']]) });
  assert.equal(await layToaDoTuLink('https://maps.app.goo.gl/abc', { fetchFn: chuyenHuongRa }), null);
  assert.equal(await layToaDoTuLink('https://maps.app.goo.gl/abc', { fetchFn: fetchGia }), null);
});

test('laLinkGoogleMaps: chỉ nhận link Google Maps', () => {
  assert.equal(laLinkGoogleMaps('https://maps.app.goo.gl/abc'), true);
  assert.equal(laLinkGoogleMaps('https://www.google.com/maps/place/X'), true);
  assert.equal(laLinkGoogleMaps('https://maps.google.com/?q=10.8,106.6'), true);
  assert.equal(laLinkGoogleMaps('https://www.google.com/search?q=san'), false);
  assert.equal(laLinkGoogleMaps('https://facebook.com/sancaulong'), false);
  assert.equal(laLinkGoogleMaps('khong phai url'), false);
});
