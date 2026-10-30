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
    tenDangNhap: nguoiDung.tenDangNhap,
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
      if (nguoiDungs.some((nguoiDung) => nguoiDung.tenDangNhap === thamSo[1] || nguoiDung.email === thamSo[5])) {
        const loi = new Error('Dữ liệu trùng');
        loi.code = 'ER_DUP_ENTRY';
        throw loi;
      }
      const nguoiDung = {
        maNguoiDung: nguoiDungs.length + 1,
        vaiTro: thamSo[0],
        tenDangNhap: thamSo[1],
        matKhauMaHoa: thamSo[2],
        hoTen: thamSo[3],
        soDienThoai: thamSo[4],
        email: thamSo[5],
        trangThai: 'active',
      };
      nguoiDungs.push(nguoiDung);
      return [{ insertId: nguoiDung.maNguoiDung }];
    }
    if (/INSERT INTO HoSoChuSan/.test(cauTruyVan)) {
      hoSosChuSan.push({ maNguoiDung: thamSo[0], trangThaiDuyet: 'draft' });
      return [{}];
    }
    if (/FROM NguoiDung nd\s+LEFT JOIN HoSoChuSan hs/.test(cauTruyVan)) {
      const nguoiDung = nguoiDungs.find((muc) => muc.maNguoiDung === thamSo[0]);
      return [[nguoiDung && {
        ...taoNguoiDungCongKhai(nguoiDung),
        trangThaiDuyet: hoSosChuSan.find((hoSo) => hoSo.maNguoiDung === nguoiDung.maNguoiDung)?.trangThaiDuyet,
      }]];
    }
    if (/FROM NguoiDung WHERE TenDangNhap = \? OR Email = \?/.test(cauTruyVan)) {
      return [[taoNguoiDungCongKhai(nguoiDungs.find(
        (nguoiDung) => nguoiDung.tenDangNhap === thamSo[0] || nguoiDung.email === thamSo[1]))]];
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
  hoBoi: ketNoiGia,
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
  tenDangNhap: 'khach01',
  matKhau: '123456',
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
    tenDangNhap: 'khach01',
    matKhau: '123456',
  });
  assert.equal(ketQuaDangNhap.maTrangThai, 200);
  const phanHoiCaNhan = await fetch(`${diaChiCoSo}/tai-khoan/ca-nhan`, {
    headers: { authorization: `Bearer ${ketQuaDangNhap.noiDung.duLieu.maTruyCap}` },
  }).then((phanHoi) => phanHoi.json());
  assert.equal(phanHoiCaNhan.duLieu.tenDangNhap, 'khach01');
});

test('Sai mật khẩu, trùng tên đăng nhập và dữ liệu không hợp lệ', async () => {
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-nhap', {
    tenDangNhap: 'khach01',
    matKhau: 'sai',
  })).maTrangThai, 401);
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-ky', thongTinDangKy)).maTrangThai, 409);
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-ky', {
    ...thongTinDangKy,
    soDienThoai: '123',
  })).maTrangThai, 400);
});

test('Chủ sân đăng ký và đăng nhập đúng nền tảng', async () => {
  const ketQuaDangKy = await guiYeuCauPost('/tai-khoan/dang-ky-chu-san', {
    ...thongTinDangKy,
    tenDangNhap: 'chu01',
    email: 'b@x.com',
  });
  assert.equal(ketQuaDangKy.noiDung.duLieu.nguoiDung.trangThaiDuyet, 'draft');
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-nhap', {
    tenDangNhap: 'chu01',
    matKhau: '123456',
  })).maTrangThai, 403);
  assert.equal((await guiYeuCauPost('/tai-khoan/dang-nhap-web', {
    tenDangNhap: 'chu01',
    matKhau: '123456',
  })).maTrangThai, 200);
});

test('Không có mã truy cập thì bị từ chối', async () => {
  const maTrangThai = await fetch(`${diaChiCoSo}/tai-khoan/ca-nhan`).then((phanHoi) => phanHoi.status);
  assert.equal(maTrangThai, 401);
});
