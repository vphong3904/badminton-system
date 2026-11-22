// Lấy toạ độ (vĩ độ, kinh độ) từ link Google Maps mà chủ sân dán vào.
// Chủ sân KHÔNG nhập toạ độ: backend tự đọc ra khi lưu cơ sở -> CoSo.ViDo / CoSo.KinhDo.
// App khách dùng toạ độ này + GPS điện thoại để tính khoảng cách "sân gần tôi" (Haversine).
//
// Hỗ trợ:
//   - https://www.google.com/maps/place/Ten/@10.80,106.63,17z/data=!3d10.8012!4d106.6399   (link đầy đủ)
//   - https://www.google.com/maps?q=10.80,106.63  /  ?query= / ?ll= / ?destination=
//   - https://maps.app.goo.gl/xxxx, https://goo.gl/maps/xxxx   (link rút gọn: server theo redirect để lấy link đầy đủ)
// Không đọc được (link chỉ có tên địa điểm, không có toạ độ, hết thời gian...) -> trả null, cơ sở vẫn lưu được.

const MAX_CHUYEN_HUONG = 5;
const THOI_GIAN_CHO_MS = 5000;

const HOST_DAY_DU = /^(www\.)?google\.[a-z.]+$|^maps\.google\.[a-z.]+$/i;
const HOST_RUT_GON = /^(maps\.app\.goo\.gl|goo\.gl)$/i;

const SO = '(-?\\d{1,3}(?:\\.\\d+)?)';
// Thứ tự ưu tiên: !3d..!4d.. là ghim của địa điểm (chính xác nhất), @lat,lng là tâm khung nhìn bản đồ.
const MAU_TOA_DO = [
  new RegExp(`!3d${SO}!4d${SO}`),
  new RegExp(`@${SO},${SO}`),
  new RegExp(`[?&](?:q|query|ll|destination|center)=${SO}(?:,|%2C)\\s*${SO}`, 'i'),
];

function hopLe(viDo, kinhDo) {
  return Number.isFinite(viDo) && Number.isFinite(kinhDo)
    && viDo >= -90 && viDo <= 90 && kinhDo >= -180 && kinhDo <= 180
    && !(viDo === 0 && kinhDo === 0);
}

// Đọc toạ độ có sẵn trong chuỗi link (không gọi mạng).
function docToaDoTrongLink(link) {
  if (typeof link !== 'string') return null;
  let chuoi = link;
  try { chuoi = decodeURIComponent(link); } catch { /* giữ nguyên chuỗi gốc */ }
  for (const mau of MAU_TOA_DO) {
    const ketQua = mau.exec(chuoi);
    if (!ketQua) continue;
    const viDo = Number(ketQua[1]);
    const kinhDo = Number(ketQua[2]);
    if (hopLe(viDo, kinhDo)) return { viDo, kinhDo };
  }
  return null;
}

function layUrl(link) {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch { return null; }
}

function laLinkGoogleMaps(link) {
  const url = layUrl(link);
  if (!url) return false;
  if (HOST_RUT_GON.test(url.hostname)) return true;
  if (/^maps\.google\./i.test(url.hostname)) return true;
  return HOST_DAY_DU.test(url.hostname) && url.pathname.startsWith('/maps');
}

// Theo redirect của link rút gọn để lấy link đầy đủ. Chỉ đi tới host của Google (chống SSRF).
async function giaiLinkRutGon(link, fetchFn) {
  let hienTai = link;
  for (let lan = 0; lan < MAX_CHUYEN_HUONG; lan += 1) {
    const url = layUrl(hienTai);
    if (!url || !(HOST_RUT_GON.test(url.hostname) || HOST_DAY_DU.test(url.hostname)
      || /^consent\.google\./i.test(url.hostname))) return null;

    const sanCoToaDo = docToaDoTrongLink(hienTai);
    if (sanCoToaDo) return hienTai;

    const dieuKhien = new AbortController();
    const hen = setTimeout(() => dieuKhien.abort(), THOI_GIAN_CHO_MS);
    let phanHoi;
    try {
      phanHoi = await fetchFn(url.toString(), { redirect: 'manual', signal: dieuKhien.signal, method: 'GET' });
    } catch { return null; } finally { clearTimeout(hen); }

    const diaChiMoi = phanHoi.headers.get('location');
    if (!diaChiMoi || phanHoi.status < 300 || phanHoi.status > 399) return hienTai;
    hienTai = new URL(diaChiMoi, url).toString();

    // Trang đồng ý cookie của Google gói link gốc trong tham số continue.
    const tiepTuc = layUrl(hienTai)?.searchParams.get('continue');
    if (tiepTuc) hienTai = tiepTuc;
  }
  return hienTai;
}

/**
 * Trả về { viDo, kinhDo } hoặc null.
 * @param {string} link link Google Maps chủ sân dán vào
 * @param {{ fetchFn?: Function }} [tuyChon] fetchFn để test
 */
async function layToaDoTuLink(link, { fetchFn = globalThis.fetch } = {}) {
  const truocTien = docToaDoTrongLink(link);
  if (truocTien) return truocTien;

  const url = layUrl(link);
  if (!url || !HOST_RUT_GON.test(url.hostname) || typeof fetchFn !== 'function') return null;
  const linkDayDu = await giaiLinkRutGon(link, fetchFn);
  return linkDayDu ? docToaDoTrongLink(linkDayDu) : null;
}

module.exports = { layToaDoTuLink, docToaDoTrongLink, laLinkGoogleMaps };
