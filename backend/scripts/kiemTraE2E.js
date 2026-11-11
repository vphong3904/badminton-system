// Kịch bản kiểm thử API đầu-cuối (cần server đang chạy + DB đã nạp db_sancaulong.sql + admin đã seed).
// Dùng: API=http://localhost:3055/api ADMIN_PASSWORD=Admin12345 SEPAY_WEBHOOK_SECRET=whsec SEPAY_BANK_ACCOUNT=123456789 node scripts/kiemTraE2E.js
const crypto = require('crypto');

const API = process.env.API || 'http://localhost:3000/api';
const MAT_KHAU_ADMIN = process.env.ADMIN_PASSWORD || 'Admin12345';
const BI_MAT_WEBHOOK = process.env.SEPAY_WEBHOOK_SECRET || 'whsec';
const TAI_KHOAN_NHAN = process.env.SEPAY_BANK_ACCOUNT || '123456789';
const hau = Date.now().toString().slice(-6); // làm email/SĐT không trùng giữa các lần chạy

let soDat = 0;
let soHong = 0;
const cacLoi = [];

// Gọi API, trả { ma, du } (ma = mã HTTP, du = JSON trả về).
async function goi(phuongThuc, duongDan, { token, body } = {}) {
  const phanHoi = await fetch(API + duongDan, {
    method: phuongThuc,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let du = null;
  try { du = await phanHoi.json(); } catch { /* không phải JSON */ }
  return { ma: phanHoi.status, du };
}

// Ghi kết quả một phép kiểm tra.
function kiemTra(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { soDat += 1; console.log(`  ✔ ${ten}`); return; }
  soHong += 1; cacLoi.push(`${ten} ${chiTiet}`);
  console.log(`  ✘ ${ten} ${chiTiet}`);
}
const nhom = (ten) => console.log(`\n== ${ten}`);
const tomTat = (r) => `(HTTP ${r.ma}: ${JSON.stringify(r.du?.loi || r.du?.duLieu || r.du).slice(0, 160)})`;

function ngayTuongLai(soNgayToiThieu, thuMong) { // thuMong: 0=CN..6=T7
  const d = new Date(Date.now() + soNgayToiThieu * 86400000);
  while (d.getUTCDay() !== thuMong) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Mô phỏng SePay báo tiền về (ký HMAC như thật).
async function baoTienVe(maDon, soTien) {
  const noiDung = JSON.stringify({
    id: Number(`${hau}${Math.floor(Math.random() * 900 + 100)}`),
    transferType: 'in', transferAmount: soTien, accountNumber: TAI_KHOAN_NHAN,
    content: `Thanh toan ${maDon}`, code: maDon, referenceCode: `REF${maDon}`,
    transactionDate: new Date().toISOString(),
  });
  const thoiGian = String(Math.floor(Date.now() / 1000));
  const chuKy = crypto.createHmac('sha256', BI_MAT_WEBHOOK).update(`${thoiGian}.${noiDung}`).digest('hex');
  const phanHoi = await fetch(`${API}/webhooks/sepay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sepay-timestamp': thoiGian, 'x-sepay-signature': `sha256=${chuKy}` },
    body: noiDung,
  });
  return phanHoi.status;
}

async function chay() {
  const email = `khach${hau}@test.vn`;
  const sdt = `09${hau}0`.slice(0, 10).padEnd(10, '1');
  const matKhau = 'matkhau123';

  nhom('1. Khách: đăng ký / đăng nhập / hồ sơ');
  let r = await goi('POST', '/tai-khoan/dang-ky', { body: { tenDangNhap: sdt, matKhau, hoTen: 'Khách Thử', soDienThoai: sdt, email } });
  kiemTra('đăng ký khách thành công (201)', r.ma === 201, tomTat(r));
  const tokenKhach = r.du?.duLieu?.maTruyCap;
  r = await goi('POST', '/tai-khoan/dang-ky', { body: { tenDangNhap: `${sdt}x`, matKhau, hoTen: 'Khách Thử', soDienThoai: sdt, email } });
  kiemTra('trùng email → 409 EMAIL_EXISTS', r.ma === 409 && r.du?.loi?.maLoi === 'EMAIL_EXISTS', tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-ky', { body: { tenDangNhap: sdt, matKhau, hoTen: 'Khách Thử', soDienThoai: sdt, email: `khac${hau}@test.vn` } });
  kiemTra('trùng SĐT (tên đăng nhập) → 409 USERNAME_EXISTS', r.ma === 409 && r.du?.loi?.maLoi === 'USERNAME_EXISTS', tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-ky', { body: { tenDangNhap: 'a', matKhau: '1', hoTen: '', soDienThoai: '12', email: 'x' } });
  kiemTra('dữ liệu sai → 400 kèm chiTiet theo trường', r.ma === 400 && Array.isArray(r.du?.loi?.chiTiet), tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap', { body: { tenDangNhap: email, matKhau } });
  kiemTra('đăng nhập bằng email', r.ma === 200, tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap', { body: { tenDangNhap: sdt, matKhau } });
  kiemTra('đăng nhập bằng SĐT', r.ma === 200, tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap', { body: { tenDangNhap: email, matKhau: 'saimatkhau' } });
  kiemTra('sai mật khẩu → 401', r.ma === 401, tomTat(r));
  r = await goi('GET', '/tai-khoan/ca-nhan');
  kiemTra('không token → 401', r.ma === 401, tomTat(r));
  r = await goi('PATCH', '/tai-khoan/ca-nhan', { token: tokenKhach, body: { hoTen: 'Khách Đã Sửa' } });
  kiemTra('sửa hồ sơ một phần', r.ma === 200 && r.du?.duLieu?.hoTen === 'Khách Đã Sửa', tomTat(r));
  r = await goi('POST', '/tai-khoan/doi-mat-khau', { token: tokenKhach, body: { matKhauCu: 'sai', matKhauMoi: 'matkhaumoi1' } });
  kiemTra('đổi mật khẩu với mật khẩu cũ sai → 400', r.ma === 400, tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { tenDangNhap: email, matKhau } });
  kiemTra('khách đăng nhập cổng web → 403', r.ma === 403, tomTat(r));

  nhom('2. Chủ sân: đăng ký → chưa duyệt bị chặn');
  const emailChu = `chu${hau}@test.vn`;
  const tenChu = `chu${hau}`;
  r = await goi('POST', '/tai-khoan/dang-ky-chu-san', { body: { tenDangNhap: tenChu, matKhau, hoTen: 'Chủ Sân Thử', soDienThoai: '0988000111', email: emailChu } });
  kiemTra('đăng ký chủ sân (201), trạng thái duyệt = draft', r.ma === 201 && r.du?.duLieu?.nguoiDung?.trangThaiDuyet === 'draft', tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { tenDangNhap: tenChu, matKhau } });
  const tokenChu = r.du?.duLieu?.maTruyCap;
  kiemTra('đăng nhập web chủ sân', r.ma === 200 && !!tokenChu, tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap', { body: { tenDangNhap: tenChu, matKhau } });
  kiemTra('chủ sân đăng nhập cổng mobile → 403', r.ma === 403, tomTat(r));
  r = await goi('GET', '/chu-san/co-so', { token: tokenChu });
  kiemTra('chưa duyệt gọi /chu-san/co-so → 403', r.ma === 403, tomTat(r));
  r = await goi('GET', '/chu-san/dang-ky', { token: tokenChu });
  kiemTra('xem trạng thái đăng ký', r.ma === 200, tomTat(r));
  r = await goi('POST', '/chu-san/dang-ky/gui-duyet', { token: tokenChu });
  kiemTra('gửi duyệt khi chưa đủ bước → 400', r.ma === 400, tomTat(r));

  nhom('3. Chủ sân điền hồ sơ (đăng ký) → gửi duyệt');
  const coSo = { tenCoSo: `Sân Thử ${hau}`, diaChi: '1 Đường Thử, Phường 1', tinhThanh: 'TP. Hồ Chí Minh', quanHuyen: 'Quận 1', soDienThoai: '0988000111', linkBanDo: 'https://maps.google.com/?q=1,1', gioMoCua: '06:00', gioDongCua: '22:00', soPhutDatToiThieu: 60 };
  r = await goi('PUT', '/chu-san/dang-ky/co-so', { token: tokenChu, body: coSo });
  kiemTra('lưu thông tin cơ sở', r.ma === 200, tomTat(r));
  const khungGia = [{ gioBatDau: '06:00', gioKetThuc: '22:00', giaNgayThuongKhachVangLai: 80000, giaNgayThuongKhachCoDinh: 70000, giaCuoiTuanKhachVangLai: 100000, giaCuoiTuanKhachCoDinh: 90000 }];
  r = await goi('PUT', '/chu-san/dang-ky/bang-gia', { token: tokenChu, body: { khungGias: khungGia } });
  kiemTra('lưu bảng giá', r.ma === 200, tomTat(r));
  r = await goi('PUT', '/chu-san/dang-ky/ngan-hang', { token: tokenChu, body: { tenNganHang: 'MB Bank', maNganHang: 'MB', soTaiKhoan: '0123456789', chuTaiKhoan: 'CHU SAN THU' } });
  kiemTra('lưu ngân hàng', r.ma === 200, tomTat(r));
  r = await goi('POST', '/chu-san/dang-ky/gui-duyet', { token: tokenChu });
  kiemTra('gửi duyệt → pending', r.ma === 200 && r.du?.duLieu?.trangThaiDuyet === 'pending', tomTat(r));
  r = await goi('PUT', '/chu-san/dang-ky/co-so', { token: tokenChu, body: coSo });
  kiemTra('đang chờ duyệt thì không sửa được → 409', r.ma === 409, tomTat(r));

  nhom('4. Admin duyệt hồ sơ chủ sân');
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { tenDangNhap: 'admin', matKhau: MAT_KHAU_ADMIN } });
  const tokenAdmin = r.du?.duLieu?.maTruyCap;
  kiemTra('admin đăng nhập', r.ma === 200 && !!tokenAdmin, tomTat(r));
  r = await goi('GET', '/chu-san/co-so', { token: tokenAdmin });
  kiemTra('admin gọi API chủ sân → 403', r.ma === 403, tomTat(r));
  r = await goi('GET', '/quan-tri/chu-san/cho-duyet', { token: tokenAdmin });
  const maChu = (r.du?.duLieu || []).find((h) => h.email === emailChu)?.maNguoiDung;
  kiemTra('thấy hồ sơ trong danh sách chờ duyệt', !!maChu, tomTat(r));
  r = await goi('PATCH', `/quan-tri/chu-san/${maChu}/duyet`, { token: tokenAdmin, body: { trangThai: 'rejected' } });
  kiemTra('từ chối thiếu lý do → 400', r.ma === 400, tomTat(r));
  r = await goi('PATCH', `/quan-tri/chu-san/${maChu}/duyet`, { token: tokenAdmin, body: { trangThai: 'approved' } });
  kiemTra('duyệt hồ sơ', r.ma === 200, tomTat(r));
  r = await goi('PATCH', `/quan-tri/chu-san/${maChu}/duyet`, { token: tokenAdmin, body: { trangThai: 'approved' } });
  kiemTra('duyệt lần 2 → 409', r.ma === 409, tomTat(r));
  r = await goi('POST', '/chu-san/dang-ky/gui-duyet', { token: tokenKhach });
  kiemTra('khách gọi API chủ sân → 403', r.ma === 403, tomTat(r));

  nhom('5. Chủ sân sau duyệt: sân con, cơ sở, khoá giờ');
  r = await goi('GET', '/chu-san/co-so', { token: tokenChu });
  const maCoSo = r.du?.duLieu?.[0]?.maCoSo;
  kiemTra('GET /chu-san/co-so trả DANH SÁCH, cơ sở đầu active', r.ma === 200 && Array.isArray(r.du?.duLieu) && r.du.duLieu.length === 1 && r.du.duLieu[0].trangThai === 'active', tomTat(r));
  r = await goi('POST', '/chu-san/san', { token: tokenChu, body: { tenSan: 'Sân 1' } });
  const maSan = r.du?.duLieu?.maSan;
  kiemTra('tạo sân 1', r.ma === 201 || r.ma === 200, tomTat(r));
  r = await goi('POST', '/chu-san/san', { token: tokenChu, body: { tenSan: 'Sân 1' } });
  kiemTra('trùng tên sân → 409', r.ma === 409, tomTat(r));
  r = await goi('POST', '/chu-san/san', { token: tokenChu, body: { tenSan: 'Sân 2' } });
  kiemTra('tạo sân 2', r.ma === 201 || r.ma === 200, tomTat(r));
  r = await goi('PATCH', `/chu-san/san/${maSan}`, { token: tokenChu, body: { trangThai: 'maintenance' } });
  kiemTra('chuyển sân sang bảo trì', r.ma === 200, tomTat(r));
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: ngayTuongLai(2, 1), gioBatDau: '18:00', gioKetThuc: '19:00' } });
  kiemTra('khách đặt sân đang bảo trì → 404', r.ma === 404, tomTat(r));
  r = await goi('PATCH', `/chu-san/san/${maSan}`, { token: tokenChu, body: { trangThai: 'active' } });
  kiemTra('bật lại sân', r.ma === 200, tomTat(r));
  r = await goi('PUT', '/chu-san/co-so/bang-gia', { token: tokenChu, body: { khungGias: [{ ...khungGia[0], gioBatDau: '05:00' }] } });
  kiemTra('khung giá ngoài giờ mở cửa → 400', r.ma === 400, tomTat(r));
  r = await goi('POST', '/chu-san/co-so/anh', { token: tokenChu });
  kiemTra('upload ảnh thiếu file → 400', r.ma === 400, tomTat(r));

  nhom('5b. Chủ sân có NHIỀU cơ sở');
  r = await goi('POST', '/chu-san/co-so', { token: tokenChu, body: { ...coSo, tenCoSo: `Cơ sở hai ${hau}`, quanHuyen: 'Quận 3' } });
  const maCoSo2 = r.du?.duLieu?.maCoSo;
  kiemTra('tạo cơ sở thứ 2 (201, trạng thái hidden)', r.ma === 201 && r.du?.duLieu?.trangThai === 'hidden', tomTat(r));
  r = await goi('GET', '/chu-san/co-so', { token: tokenChu });
  kiemTra('danh sách có đủ 2 cơ sở kèm soSan', r.du?.duLieu?.length === 2 && r.du.duLieu[0].soSan === 2, tomTat(r));
  r = await goi('GET', `/chu-san/co-so/${maCoSo2}`, { token: tokenChu });
  kiemTra('xem chi tiết cơ sở theo mã', r.ma === 200 && r.du?.duLieu?.maCoSo === maCoSo2, tomTat(r));
  r = await goi('GET', '/chu-san/co-so/999999', { token: tokenChu });
  kiemTra('cơ sở không phải của mình → 404', r.ma === 404, tomTat(r));
  r = await goi('GET', '/khach/co-so/danh-sach');
  kiemTra('cơ sở 2 chưa có sân/giá nên khách chưa thấy', !(r.du?.duLieu || []).some((c) => c.maCoSo === maCoSo2), tomTat(r));
  r = await goi('POST', '/chu-san/san', { token: tokenChu, body: { maCoSo: maCoSo2, tenSan: 'Sân A' } });
  kiemTra('thêm sân vào cơ sở 2', r.ma === 201 && r.du?.duLieu?.maCoSo === maCoSo2, tomTat(r));
  r = await goi('PUT', `/chu-san/co-so/${maCoSo2}/bang-gia`, { token: tokenChu, body: { khungGias: khungGia } });
  kiemTra('đặt bảng giá cơ sở 2', r.ma === 200, tomTat(r));
  r = await goi('GET', '/khach/co-so/danh-sach');
  kiemTra('đủ sân + giá → cơ sở 2 tự hiện cho khách', (r.du?.duLieu || []).some((c) => c.maCoSo === maCoSo2), tomTat(r));
  r = await goi('PUT', `/chu-san/co-so/${maCoSo2}`, { token: tokenChu, body: { ...coSo, tenCoSo: `Cơ sở hai đổi tên ${hau}`, quanHuyen: 'Quận 3' } });
  kiemTra('sửa cơ sở 2 theo mã', r.ma === 200 && r.du?.duLieu?.tenCoSo.includes('đổi tên'), tomTat(r));
  r = await goi('GET', '/chu-san/san', { token: tokenChu });
  kiemTra('GET /chu-san/san không lọc → sân của cả 2 cơ sở (3 sân)', r.du?.duLieu?.length === 3, tomTat(r));
  r = await goi('GET', `/chu-san/san?maCoSo=${maCoSo2}`, { token: tokenChu });
  kiemTra('lọc sân theo cơ sở → 1 sân', r.du?.duLieu?.length === 1, tomTat(r));

  nhom('6. Khách thấy cơ sở mới và đặt sân');
  r = await goi('GET', '/khach/co-so/danh-sach');
  kiemTra('cơ sở mới hiện ở danh sách khách', (r.du?.duLieu || []).some((c) => c.maCoSo === maCoSo), tomTat(r));
  r = await goi('GET', `/khach/co-so/${maCoSo}`);
  kiemTra('chi tiết cơ sở có 2 sân', r.ma === 200 && r.du?.duLieu?.cacSan?.length === 2, tomTat(r));
  const ngayThuHai = ngayTuongLai(2, 1);
  const ngayThuBay = ngayTuongLai(2, 6);
  r = await goi('GET', `/khach/san/${maSan}/lich-trong?ngay=${ngayThuHai}&gioBatDau=18:00&gioKetThuc=19:00`);
  kiemTra('kiểm tra giờ trống = true', r.du?.duLieu?.conTrong === true, tomTat(r));
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: ngayThuHai, gioBatDau: '18:00', gioKetThuc: '19:00' } });
  kiemTra('đặt lẻ T2 18-19h = 80.000đ (giá ngày thường)', r.ma === 201 && r.du?.duLieu?.tongTien === 80000, tomTat(r));
  const don = r.du?.duLieu;
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: ngayThuHai, gioBatDau: '18:30', gioKetThuc: '19:30' } });
  kiemTra('đặt chồng giờ → 409', r.ma === 409, tomTat(r));
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: '2020-01-01', gioBatDau: '18:00', gioKetThuc: '19:00' } });
  kiemTra('đặt quá khứ → 400', r.ma === 400, tomTat(r));
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: ngayThuBay, gioBatDau: '18:00', gioKetThuc: '18:30' } });
  kiemTra('dưới thời lượng tối thiểu → 400', r.ma === 400, tomTat(r));
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: ngayThuBay, gioBatDau: '18:00', gioKetThuc: '19:00' } });
  kiemTra('đặt lẻ T7 = 100.000đ (giá cuối tuần)', r.ma === 201 && r.du?.duLieu?.tongTien === 100000, tomTat(r));
  const donThuBay = r.du?.duLieu;
  r = await goi('GET', `/khach/dat-san/${don.cacDon[0].maDatSan}/hoa-don-nhap`, { token: tokenKhach });
  kiemTra('hoá đơn nháp có QR và đếm ngược', r.ma === 200 && !!r.du?.duLieu?.anhQrUrl, tomTat(r));
  r = await goi('GET', `/thanh-toan/${don.cacDon[0].maDatSan}/qr`, { token: tokenKhach });
  kiemTra('lấy QR thanh toán', r.ma === 200, tomTat(r));
  kiemTra('webhook sai chữ ký → 401', (await (await fetch(`${API}/webhooks/sepay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sepay-timestamp': '1', 'x-sepay-signature': 'sha256=x' }, body: '{}' })).status) === 401);
  kiemTra('webhook tiền về → 200', (await baoTienVe(don.maDonThanhToan, 80000)) === 200);
  r = await goi('GET', '/khach/dat-san', { token: tokenKhach });
  const donDaThanhToan = (r.du?.duLieu || []).find((d) => d.maDon === don.maDonThanhToan);
  kiemTra('đơn chuyển sang confirmed sau khi tiền về', donDaThanhToan?.trangThai === 'confirmed' || donDaThanhToan?.trangThaiDatSan === 'confirmed', JSON.stringify(donDaThanhToan || r.du).slice(0, 200));
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: ngayThuHai, gioBatDau: '18:00', gioKetThuc: '19:00' } });
  kiemTra('giờ đã xác nhận không đặt lại được → 409', r.ma === 409, tomTat(r));

  nhom('7. Chủ sân thấy dữ liệu khách tạo ra');
  r = await goi('POST', '/chu-san/khoa-san', { token: tokenChu, body: { maSan, thoiGianBatDau: `${ngayThuHai} 18:00`, thoiGianKetThuc: `${ngayThuHai} 19:00` } });
  kiemTra('khoá giờ đã có khách → 409', r.ma === 409, tomTat(r));
  r = await goi('POST', '/chu-san/khoa-san', { token: tokenChu, body: { maSan, thoiGianBatDau: `${ngayThuHai} 20:00`, thoiGianKetThuc: `${ngayThuHai} 21:00`, lyDo: 'Bảo trì' } });
  kiemTra('khoá giờ trống', r.ma === 201 || r.ma === 200, tomTat(r));
  r = await goi('GET', '/chu-san/bao-cao/doanh-thu', { token: tokenChu });
  kiemTra('báo cáo doanh thu có đơn vừa thanh toán', r.ma === 200 && JSON.stringify(r.du?.duLieu?.theoNgay || []).includes('80000'), tomTat(r));
  r = await goi('GET', '/chu-san/rut-tien/so-du', { token: tokenChu });
  kiemTra('số dư rút tiền', r.ma === 200, tomTat(r));
  r = await goi('GET', '/chu-san/dat-san', { token: tokenChu });
  const donCuaChu = r.du?.duLieu?.cacDon || [];
  kiemTra('chủ sân thấy đơn khách vừa đặt (2 đơn)', r.ma === 200 && donCuaChu.length === 2, tomTat(r));
  r = await goi('GET', '/chu-san/dat-san?trangThai=confirmed', { token: tokenChu });
  kiemTra('lọc theo trạng thái confirmed → 1 đơn', r.ma === 200 && r.du?.duLieu?.tong === 1, tomTat(r));
  r = await goi('GET', `/chu-san/dat-san?tuKhoa=${don.maDonThanhToan}`, { token: tokenChu });
  kiemTra('tìm theo mã đơn', r.du?.duLieu?.tong === 1, tomTat(r));
  r = await goi('GET', `/chu-san/dat-san?ngay=${ngayThuHai}`, { token: tokenChu });
  kiemTra('lọc đơn theo ngày chơi (?ngay=) → chỉ đơn của ngày đó', r.ma === 200 && r.du?.duLieu?.tong === 1 && r.du.duLieu.cacDon[0].ngay === ngayThuHai, tomTat(r));
  r = await goi('GET', `/chu-san/dat-san?ngay=${ngayThuHai}&maCoSo=${maCoSo2}`, { token: tokenChu });
  kiemTra('lọc đơn theo ngày + cơ sở 2 → 0 đơn', r.ma === 200 && r.du?.duLieu?.tong === 0, tomTat(r));
  r = await goi('GET', `/chu-san/dat-san?maCoSo=${maCoSo}&soDong=1`, { token: tokenChu });
  kiemTra('soDong=1 → 1 đơn mỗi trang, tong vẫn đủ', r.du?.duLieu?.cacDon?.length === 1 && r.du.duLieu.tong === 2, tomTat(r));
  r = await goi('GET', '/chu-san/dat-san?trangThai=sai', { token: tokenChu });
  kiemTra('trạng thái lọc sai → 400', r.ma === 400, tomTat(r));
  r = await goi('GET', `/chu-san/dat-san/${don.cacDon[0].maDatSan}`, { token: tokenChu });
  const hd = r.du?.duLieu;
  kiemTra('hoá đơn: khách trả 80.000, phí nền tảng + tiền chủ sân = 80.000',
    r.ma === 200 && hd?.tongTien === 80000 && hd.phiNenTang + hd.tienChuSan === 80000, tomTat(r));
  kiemTra('hoá đơn: thanh toán success', hd?.trangThaiThanhToan === 'success', tomTat(r));
  r = await goi('GET', `/chu-san/dat-san/${don.cacDon[0].maDatSan}`, { token: tokenKhach });
  kiemTra('khách không xem được API chủ sân → 403', r.ma === 403, tomTat(r));

  // Chủ sân KHÁC không được xem đơn của cơ sở này.
  const tenChu2 = `chub${hau}`;
  await goi('POST', '/tai-khoan/dang-ky-chu-san', { body: { tenDangNhap: tenChu2, matKhau, hoTen: 'Chủ Khác', soDienThoai: '0988000222', email: `chub${hau}@test.vn` } });
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { tenDangNhap: tenChu2, matKhau } });
  r = await goi('GET', `/chu-san/dat-san/${don.cacDon[0].maDatSan}`, { token: r.du?.duLieu?.maTruyCap });
  kiemTra('chủ sân chưa duyệt/khác không xem được đơn → 403', r.ma === 403, tomTat(r));

  nhom('8. Huỷ đơn và hoàn tiền');
  r = await goi('POST', `/khach/dat-san/${donThuBay.cacDon[0].maDatSan}/huy`, { token: tokenKhach });
  kiemTra('huỷ đơn đang giữ chỗ', r.ma === 200, tomTat(r));
  r = await goi('POST', `/khach/dat-san/${don.cacDon[0].maDatSan}/huy`, { token: tokenKhach });
  kiemTra('huỷ đơn đã thanh toán (chờ hoàn tiền)', r.ma === 200, tomTat(r));
  r = await goi('GET', '/quan-tri/hoan-tien', { token: tokenAdmin });
  kiemTra('admin thấy yêu cầu hoàn tiền', r.ma === 200, tomTat(r));

  console.log(`\nKẾT QUẢ: ${soDat} đạt, ${soHong} hỏng`);
  if (soHong) { console.log('Các mục hỏng:'); cacLoi.forEach((l) => console.log(' -', l)); process.exitCode = 1; }
}

chay().catch((loi) => { console.error('Lỗi kịch bản:', loi); process.exitCode = 1; });
