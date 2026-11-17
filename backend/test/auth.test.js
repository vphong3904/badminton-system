const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');

const nguoiDungs = [];
const hoSosChuSan = [];

function taoNguoiDungCongKhai(nguoiDung) {
  if (!nguoiDung) return undefined;
  return {
    maNguoiDung: nguoiDung.maNguoiDung,
    vaiTro: nguoiDung.vaiTro,
    hoTen: nguoiDung.hoTen,
    soDienThoai: nguoiDung.soDienThoai,
    email: nguoiDung.email,
    trangThai: nguoiDung.trangThai,
    matKhauMaHoa: nguoiDung.matKhauMaHoa,
  };
}

const ketNoiGia = {
  async query(cauTruyVan, thamSo = []) {
    if (/INSERT INTO NguoiDung/.test(cauTruyVan)) {
      if (nguoiDungs.some((nguoiDung) => nguoiDung.email === thamSo[4])) {
        const loi = new Error('Dữ liệu trùng');
        loi.code = 'ER_DUP_ENTRY';
        throw loi;
      }
      const nguoiDung = {
        maNguoiDung: nguoiDungs.length + 1,
        vaiTro: thamSo[0],
        matKhauMaHoa: thamSo[1],
        hoTen: thamSo[2],
        soDienThoai: thamSo[3],
        email: thamSo[4],
        trangThai: 'active',
      };
      nguoiDungs.push(nguoiDung);
      return [{ insertId: nguoiDung.maNguoiDung }];
    }
    if (/INSERT INTO HoSoChuSan/.test(cauTruyVan)) {
      assert.match(cauTruyVan, /'pending', NOW\(\)/, 'hồ sơ phải vào thẳng pending');
      hoSosChuSan.push({
        maNguoiDung: thamSo[0],
        tenDoanhNghiep: thamSo[1],
        tenNganHang: thamSo[2],
        maNganHang: thamSo[3],
        soTaiKhoan: thamSo[4],
        chuTaiKhoan: thamSo[5],
        trangThaiDuyet: 'pending',
      });
      return [{}];
    }
    if (/FROM NguoiDung nd\s+LEFT JOIN HoSoChuSan hs/.test(cauTruyVan)) {
      const nguoiDung = nguoiDungs.find((muc) => muc.maNguoiDung === thamSo[0]);
      const hoSo = nguoiDung && hoSosChuSan.find((muc) => muc.maNguoiDung === nguoiDung.maNguoiDung);
      return [[nguoiDung && {
        ...taoNguoiDungCongKhai(nguoiDung),
        trangThaiDuyet: hoSo?.trangThaiDuyet,
        tenDoanhNghiep: hoSo?.tenDoanhNghiep,
        lyDoTuChoi: hoSo?.lyDoTuChoi,
      }]];
    }
    if (/FROM NguoiDung WHERE Email = \?/.test(cauTruyVan)) {
      return [[taoNguoiDungCongKhai(nguoiDungs.find(
        (nguoiDung) => nguoiDung.email === thamSo[0]))]];
    }
    if (/FROM NguoiDung WHERE MaNguoiDung = \?/.test(cauTruyVan)) {
      const nguoiDung = nguoiDungs.find((muc) => muc.maNguoiDung === thamSo[0]);
      return [[nguoiDung && {
        maNguoiDung: nguoiDung.maNguoiDung,
        vaiTro: nguoiDung.vaiTro,
        trangThai: nguoiDung.trangThai,
      }]];
    }
    throw new Error(`Chưa giả lập truy vấn: ${cauTruyVan}`);
  },
  async getConnection() {
    return {
      ...ketNoiGia,
      beginTransaction() {},
      commit() {},
      rollback() {},
      release() {},
    };
  },
};

require('../src/config/db');
require.cache[require.resolve('../src/config/db')].exports = {
  pool: ketNoiGia,
  thucHienGiaoDich: async (hamThucThi) => hamThucThi(ketNoiGia),
};
process.env.NODE_ENV = 'test';
const ungDung = require('../src/app');

let mayChu;
let diaChiCoSo;
test.before(async () => {
  mayChu = ungDung.listen(0);
  diaChiCoSo = `http://localhost:${mayChu.address().port}/api`;
});
test.after(() => mayChu.close());

const guiYeuCauPost = (duongDan, duLieu, maTruyCap) => fetch(`${diaChiCoSo}${duongDan}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(maTruyCap && { authorization: `Bearer ${maTruyCap}` }),
  },
  body: JSON.stringify(duLieu),
}).then(async (phanHoi) => ({ maTrangThai: phanHoi.status, noiDung: await phanHoi.json() }));

const thongTinDangKy = {
  matKhau: 'matkhau123',
  hoTen: 'Nguyen A',
  soDienThoai: '0901234567',
  email: 'a@x.com',
};

test('Đăng ký khách, đăng nhập và lấy thông tin cá nhân', async () => {
  const ketQuaDangKy = await guiYeuCauPost('/tai-khoan/dang-ky', thongTinDangKy);
  assert.equal(ketQuaDangKy.maTrangThai, 201);
  assert.equal(ketQuaDangKy.noiDung.duLieu.nguoiDung.vaiTro, 'customer');
  assert.equal(ketQuaDangKy.noiDung.duLieu.nguoiDung.matKhauMaHoa, undefined);
  assert.ok(ketQuaDangKy.noiDung.duLieu.maTruyCap);

  const ketQuaDangNhap = await guiYeuCauPost('/tai-khoan/dang-nhap', {
    email: 'a@x.com',
    matKhau: 'matkhau123',
  });
  assert.equal(ketQuaDangNhap.maTrangThai, 200);
  const phanHoiCaNhan = await fetch(`${diaChiCoSo}/tai-khoan/ca-nhan`, {
    headers: { authorization: `Bearer ${ketQuaDangNhap.noiDung.duLieu.maTruyCap}` },
  }).then((phanHoi) => phanHoi.json());
  assert.equal(phanHoiCaNhan.duLieu.email, 'a@x.com');
  assert.equal(phanHoiCaNhan.duLieu.tenDangNhap, undefined);
});

test('Sai mật khẩu, trùng email và dữ liệu không hợp lệ', async () => {
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-nhap', {
    email: 'a@x.com',
    matKhau: 'sai',
  })).maTrangThai, 401);
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-ky', thongTinDangKy)).maTrangThai, 409);
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-ky', {
    ...thongTinDangKy,
    soDienThoai: '123',
  })).maTrangThai, 400);
});

const thongTinDangKyChuSan = {
  ...thongTinDangKy,
  email: 'b@x.com',
  tenDoanhNghiep: 'Công ty Thể thao B',
  maNganHang: 'MB',
  soTaiKhoan: '0123456789',
  xacNhanMatKhau: 'matkhau123',
};

test('Chủ sân đăng ký: hồ sơ pending, điền sẵn doanh nghiệp + ngân hàng, vẫn đăng nhập được', async () => {
  const ketQuaDangKy = await guiYeuCauPost('/tai-khoan/dang-ky-chu-san', thongTinDangKyChuSan);
  assert.equal(ketQuaDangKy.maTrangThai, 201);
  const nguoiDung = ketQuaDangKy.noiDung.duLieu.nguoiDung;
  assert.equal(nguoiDung.trangThaiDuyet, 'pending');
  assert.equal(nguoiDung.tenDoanhNghiep, 'Công ty Thể thao B');
  assert.match(nguoiDung.thongBaoDuyet, /đang đợi duyệt/);

  const hoSo = hoSosChuSan.find((muc) => muc.maNguoiDung === nguoiDung.maNguoiDung);
  assert.equal(hoSo.trangThaiDuyet, 'pending');
  assert.equal(hoSo.tenDoanhNghiep, 'Công ty Thể thao B');
  assert.equal(hoSo.tenNganHang, 'MB Bank');
  assert.equal(hoSo.maNganHang, 'MB');
  assert.equal(hoSo.soTaiKhoan, '0123456789');
  assert.equal(hoSo.chuTaiKhoan, 'Nguyen A');

  assert.equal((await guiYeuCauPost('/tai-khoan/dang-nhap', {
    email: 'b@x.com',
    matKhau: 'matkhau123',
  })).maTrangThai, 403);
  const dangNhapWeb = await guiYeuCauPost('/tai-khoan/dang-nhap-web', {
    email: 'b@x.com',
    matKhau: 'matkhau123',
  });
  assert.equal(dangNhapWeb.maTrangThai, 200);
  assert.equal(dangNhapWeb.noiDung.duLieu.nguoiDung.trangThaiDuyet, 'pending');
  assert.match(dangNhapWeb.noiDung.duLieu.nguoiDung.thongBaoDuyet, /đang đợi duyệt/);
});

test('Đăng ký chủ sân kiểm tra đủ trường mới', async () => {
  const thuLai = (thayDoi) => guiYeuCauPost('/tai-khoan/dang-ky-chu-san', {
    ...thongTinDangKyChuSan, email: 'c@x.com', ...thayDoi,
  });
  const truongLoi = async (thayDoi) => (await thuLai(thayDoi)).noiDung.loi.chiTiet.map((muc) => muc.truong);

  assert.deepEqual(await truongLoi({ xacNhanMatKhau: 'khac12345' }), ['xacNhanMatKhau']);
  assert.deepEqual(await truongLoi({ tenDoanhNghiep: '  ' }), ['tenDoanhNghiep']);
  assert.deepEqual(await truongLoi({ maNganHang: 'KHONGCO' }), ['maNganHang']);
  assert.deepEqual(await truongLoi({ soTaiKhoan: '12ab' }), ['soTaiKhoan']);
  const thieu = await guiYeuCauPost('/tai-khoan/dang-ky-chu-san', thongTinDangKy);
  assert.equal(thieu.maTrangThai, 400);
  assert.equal((await thuLai({ email: 'b@x.com' })).maTrangThai, 409);
});

test('Danh sách ngân hàng công khai', async () => {
  const phanHoi = await fetch(`${diaChiCoSo}/tai-khoan/ngan-hang`).then((r) => r.json());
  assert.ok(phanHoi.duLieu.some((nganHang) => nganHang.maNganHang === 'MB' && nganHang.tenNganHang));
});

test('Không có mã truy cập thì bị từ chối', async () => {
  const maTrangThai = await fetch(`${diaChiCoSo}/tai-khoan/ca-nhan`).then((phanHoi) => phanHoi.status);
  assert.equal(maTrangThai, 401);
});
