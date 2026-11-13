// Kịch bản kiểm thử API đầu-cuối (cần server đang chạy + DB đã nạp db_sancaulong.sql + admin đã seed).
// Dùng: API=http://localhost:3055/api ADMIN_EMAIL=admin@badminton.local ADMIN_PASSWORD=Admin12345 node scripts/kiemTraE2E.js

const API = process.env.API || 'http://localhost:3000/api';
const MAT_KHAU_ADMIN = process.env.ADMIN_PASSWORD || 'Admin12345';
const EMAIL_ADMIN = process.env.ADMIN_EMAIL || 'admin@badminton.local';
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

// Khách gửi ảnh chuyển khoản (multipart). Ảnh PNG 1x1 hợp lệ; trả { ma, du }.
const PNG_NHO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64');
async function guiAnhChuyenKhoan(token, maDatSan, noiDung = PNG_NHO, tenTep = 'ck.png', loai = 'image/png') {
  const form = new FormData();
  form.append('anhChuyenKhoan', new Blob([noiDung], { type: loai }), tenTep);
  const phanHoi = await fetch(`${API}/thanh-toan/${maDatSan}/anh-chuyen-khoan`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  let du = null;
  try { du = await phanHoi.json(); } catch { /* không phải JSON */ }
  return { ma: phanHoi.status, du };
}

async function chay() {
  const email = `khach${hau}@test.vn`;
  const sdt = `09${hau}0`.slice(0, 10).padEnd(10, '1');
  const matKhau = 'matkhau123';

  nhom('1. Khách: đăng ký / đăng nhập / hồ sơ');
  let r = await goi('POST', '/tai-khoan/dang-ky', { body: { matKhau, hoTen: 'Khách Thử', soDienThoai: sdt, email } });
  kiemTra('đăng ký khách thành công (201)', r.ma === 201, tomTat(r));
  const tokenKhach = r.du?.duLieu?.maTruyCap;
  r = await goi('POST', '/tai-khoan/dang-ky', { body: { matKhau, hoTen: 'Khách Thử', soDienThoai: sdt, email } });
  kiemTra('trùng email → 409 EMAIL_EXISTS', r.ma === 409 && r.du?.loi?.maLoi === 'EMAIL_EXISTS', tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-ky', { body: { matKhau: '1', hoTen: '', soDienThoai: '12', email: 'x' } });
  kiemTra('dữ liệu sai → 400 kèm chiTiet theo trường', r.ma === 400 && Array.isArray(r.du?.loi?.chiTiet), tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap', { body: { email, matKhau } });
  kiemTra('đăng nhập bằng email', r.ma === 200, tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap', { body: { email, matKhau: 'saimatkhau' } });
  kiemTra('sai mật khẩu → 401', r.ma === 401, tomTat(r));
  r = await goi('GET', '/tai-khoan/ca-nhan');
  kiemTra('không token → 401', r.ma === 401, tomTat(r));
  r = await goi('PATCH', '/tai-khoan/ca-nhan', { token: tokenKhach, body: { hoTen: 'Khách Đã Sửa' } });
  kiemTra('sửa hồ sơ một phần', r.ma === 200 && r.du?.duLieu?.hoTen === 'Khách Đã Sửa', tomTat(r));
  r = await goi('POST', '/tai-khoan/doi-mat-khau', { token: tokenKhach, body: { matKhauCu: 'sai', matKhauMoi: 'matkhaumoi1' } });
  kiemTra('đổi mật khẩu với mật khẩu cũ sai → 400', r.ma === 400, tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { email, matKhau } });
  kiemTra('khách đăng nhập cổng web → 403', r.ma === 403, tomTat(r));

  nhom('2. Chủ sân: đăng ký → chưa duyệt bị chặn');
  const emailChu = `chu${hau}@test.vn`;
  r = await goi('POST', '/tai-khoan/dang-ky-chu-san', { body: { matKhau, hoTen: 'Chủ Sân Thử', soDienThoai: '0988000111', email: emailChu } });
  kiemTra('đăng ký chủ sân (201), trạng thái duyệt = draft', r.ma === 201 && r.du?.duLieu?.nguoiDung?.trangThaiDuyet === 'draft', tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { email: emailChu, matKhau } });
  const tokenChu = r.du?.duLieu?.maTruyCap;
  kiemTra('đăng nhập web chủ sân', r.ma === 200 && !!tokenChu, tomTat(r));
  r = await goi('POST', '/tai-khoan/dang-nhap', { body: { email: emailChu, matKhau } });
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
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { email: EMAIL_ADMIN, matKhau: MAT_KHAU_ADMIN } });
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
  const maDatSanDon = don.cacDon[0].maDatSan;
  r = await guiAnhChuyenKhoan(tokenKhach, maDatSanDon, Buffer.from('khong phai anh'), 'gia.png');
  kiemTra('gửi file không phải ảnh → 400', r.ma === 400, tomTat(r));
  r = await guiAnhChuyenKhoan(tokenKhach, maDatSanDon);
  kiemTra('khách gửi ảnh chuyển khoản → confirming (đợi xác nhận)', r.ma === 200 && r.du?.duLieu?.trangThaiThanhToan === 'confirming', tomTat(r));
  r = await goi('GET', '/khach/dat-san', { token: tokenKhach });
  let donKhach = (r.du?.duLieu || []).find((d) => d.maDon === don.maDonThanhToan);
  kiemTra('đơn vẫn pending_payment khi chủ sân chưa xác nhận', donKhach?.trangThai === 'pending_payment', JSON.stringify(donKhach || r.du).slice(0, 200));
  r = await goi('GET', `/khach/dat-san/${maDatSanDon}/hoa-don-nhap`, { token: tokenKhach });
  kiemTra('hoá đơn trả ảnh đã gửi + thông tin tài khoản nhận', r.du?.duLieu?.trangThaiThanhToan === 'confirming' && !!r.du.duLieu.anhChuyenKhoanUrl && !!r.du.duLieu.taiKhoanNhan?.soTaiKhoan, tomTat(r));
  r = await goi('POST', `/chu-san/dat-san/${maDatSanDon}/xac-nhan-thanh-toan`, { token: tokenKhach });
  kiemTra('khách không tự xác nhận được → 403', r.ma === 403, tomTat(r));

  // Chủ sân từ chối lần 1 → khách gửi lại → chủ sân xác nhận.
  r = await goi('GET', '/chu-san/dat-san?trangThaiThanhToan=confirming', { token: tokenChu });
  kiemTra('chủ sân lọc được đơn đợi xác nhận kèm ảnh', r.ma === 200 && r.du?.duLieu?.tong === 1 && !!r.du.duLieu.cacDon[0].anhChuyenKhoanUrl, tomTat(r));
  r = await goi('POST', `/chu-san/dat-san/${maDatSanDon}/tu-choi-thanh-toan`, { token: tokenChu, body: {} });
  kiemTra('từ chối thiếu lý do → 400', r.ma === 400, tomTat(r));
  r = await goi('POST', `/chu-san/dat-san/${maDatSanDon}/tu-choi-thanh-toan`, { token: tokenChu, body: { lyDo: 'Chưa thấy tiền về' } });
  kiemTra('chủ sân từ chối ảnh → pending', r.ma === 200 && r.du?.duLieu?.trangThaiThanhToan === 'pending', tomTat(r));
  r = await goi('GET', `/khach/dat-san/${maDatSanDon}/hoa-don-nhap`, { token: tokenKhach });
  kiemTra('khách thấy lý do bị từ chối', r.du?.duLieu?.lyDoTuChoi === 'Chưa thấy tiền về', tomTat(r));
  r = await goi('POST', `/chu-san/dat-san/${maDatSanDon}/xac-nhan-thanh-toan`, { token: tokenChu });
  kiemTra('xác nhận khi khách chưa gửi lại ảnh → 409', r.ma === 409, tomTat(r));
  r = await guiAnhChuyenKhoan(tokenKhach, maDatSanDon);
  kiemTra('khách gửi lại ảnh', r.ma === 200, tomTat(r));
  r = await goi('POST', `/chu-san/dat-san/${maDatSanDon}/xac-nhan-thanh-toan`, { token: tokenChu });
  kiemTra('chủ sân xác nhận → success + confirmed', r.ma === 200 && r.du?.duLieu?.trangThaiDatSan === 'confirmed', tomTat(r));
  r = await goi('POST', `/chu-san/dat-san/${maDatSanDon}/xac-nhan-thanh-toan`, { token: tokenChu });
  kiemTra('xác nhận lần 2 → 409', r.ma === 409, tomTat(r));
  r = await goi('GET', '/khach/dat-san', { token: tokenKhach });
  const donDaThanhToan = (r.du?.duLieu || []).find((d) => d.maDon === don.maDonThanhToan);
  kiemTra('đơn chuyển sang confirmed sau khi chủ sân xác nhận', donDaThanhToan?.trangThai === 'confirmed' || donDaThanhToan?.trangThaiDatSan === 'confirmed', JSON.stringify(donDaThanhToan || r.du).slice(0, 200));
  r = await goi('POST', '/khach/dat-san', { token: tokenKhach, body: { maSan, ngay: ngayThuHai, gioBatDau: '18:00', gioKetThuc: '19:00' } });
  kiemTra('giờ đã xác nhận không đặt lại được → 409', r.ma === 409, tomTat(r));

  nhom('6b. Chủ sân tạo đơn + admin duyệt thanh toán');
  const ngayChuTao = ngayTuongLai(3, 3);
  const donChuTao = { maSan, ngay: ngayChuTao, gioBatDau: '10:00', gioKetThuc: '11:00', tenKhach: 'Khach Tai Cho', soDienThoai: '0338484839', daThu: true };
  r = await goi('POST', '/chu-san/dat-san', { token: tokenKhach, body: donChuTao });
  kiemTra('khách không tạo đơn kiểu chủ sân được → 403', r.ma === 403, tomTat(r));
  r = await goi('POST', '/chu-san/dat-san', { token: tokenChu, body: donChuTao });
  kiemTra('chủ sân tạo đơn cho khách tại chỗ → confirmed, đã thu', r.ma === 201 && r.du?.duLieu?.trangThai === 'confirmed' && r.du.duLieu.trangThaiThu === 'paid', tomTat(r));
  r = await goi('POST', '/chu-san/dat-san', { token: tokenChu, body: donChuTao });
  kiemTra('tạo trùng giờ → 409', r.ma === 409, tomTat(r));
  r = await goi('POST', '/chu-san/dat-san', { token: tokenChu, body: { ...donChuTao, gioBatDau: '12:00', gioKetThuc: '13:00', ngayKetThuc: ngayTuongLai(3, 5), daThu: false } });
  kiemTra('chủ sân tạo lịch cố định nhiều ngày', r.ma === 201 && r.du?.duLieu?.loaiKhach === 'fixed' && r.du.duLieu.cacDon.length >= 2, tomTat(r));
  r = await goi('GET', '/quan-tri/dat-san/cho-xac-nhan', { token: tokenAdmin });
  kiemTra('admin xem được danh sách đơn đợi xác nhận', r.ma === 200 && Array.isArray(r.du?.duLieu), tomTat(r));
  r = await goi('POST', `/quan-tri/dat-san/${maDatSanDon}/xac-nhan-thanh-toan`, { token: tokenChu });
  kiemTra('chủ sân không gọi được API admin → 403', r.ma === 403, tomTat(r));

  nhom('7. Chủ sân thấy dữ liệu khách tạo ra');
  r = await goi('POST', '/chu-san/khoa-san', { token: tokenChu, body: { maSan, thoiGianBatDau: `${ngayThuHai} 18:00`, thoiGianKetThuc: `${ngayThuHai} 19:00` } });
  kiemTra('khoá giờ đã có khách → 409', r.ma === 409, tomTat(r));
  r = await goi('POST', '/chu-san/khoa-san', { token: tokenChu, body: { maSan, thoiGianBatDau: `${ngayThuHai} 20:00`, thoiGianKetThuc: `${ngayThuHai} 21:00`, lyDo: 'Bảo trì' } });
  kiemTra('khoá giờ trống', r.ma === 201 || r.ma === 200, tomTat(r));
  r = await goi('GET', '/chu-san/bao-cao/doanh-thu', { token: tokenChu });
  kiemTra('báo cáo doanh thu có đơn vừa thanh toán', r.ma === 200 && JSON.stringify(r.du?.duLieu?.theoNgay || []).includes('80000'), tomTat(r));
  r = await goi('GET', '/chu-san/bao-cao/khach-hang/tong-quan', { token: tokenChu });
  kiemTra('thống kê khách: tổng quan', r.ma === 200 && r.du?.duLieu?.tongKhach >= 1 && Array.isArray(r.du.duLieu.theoNguon), tomTat(r));
  r = await goi('GET', '/chu-san/bao-cao/khach-hang?sapXep=chi-tieu', { token: tokenChu });
  kiemTra('thống kê khách: danh sách khách', r.ma === 200 && r.du?.duLieu?.tong >= 1, tomTat(r));
  const khachDau = r.du?.duLieu?.cacKhach?.[0];
  if (khachDau) {
    const truyVan = khachDau.maKhachHang ? `maKhachHang=${khachDau.maKhachHang}` : `soDienThoai=${encodeURIComponent(khachDau.soDienThoai)}`;
    r = await goi('GET', `/chu-san/bao-cao/khach-hang/chi-tiet?${truyVan}`, { token: tokenChu });
    kiemTra('thống kê khách: chi tiết 1 khách', r.ma === 200 && r.du?.duLieu?.khach?.soLuotDat >= 1, tomTat(r));
  }
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
  const emailChu2 = `chub${hau}@test.vn`;
  await goi('POST', '/tai-khoan/dang-ky-chu-san', { body: { matKhau, hoTen: 'Chủ Khác', soDienThoai: '0988000222', email: emailChu2 } });
  r = await goi('POST', '/tai-khoan/dang-nhap-web', { body: { email: emailChu2, matKhau } });
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
