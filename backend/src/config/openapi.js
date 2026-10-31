const cauHinh = require('./env');

const response = {
  ThanhCong: {
    description: 'Yêu cầu thành công',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            thanhCong: { type: 'boolean', example: true },
            duLieu: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  Loi: {
    description: 'Yêu cầu không thành công',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            thanhCong: { type: 'boolean', example: false },
            loi: {
              type: 'object',
              properties: {
                maLoi: { type: 'string' },
                thongBao: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

const thamSoDuongDan = (ten) => ({
  name: ten,
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
});

const thamSoTruyVan = (ten, moTa, batBuoc = false) => ({
  name: ten,
  in: 'query',
  required: batBuoc,
  description: moTa,
  schema: { type: 'string' },
});

const bodyJson = (tenLuocDo) => ({
  required: true,
  content: {
    'application/json': {
      schema: { $ref: `#/components/schemas/${tenLuocDo}` },
    },
  },
});

const endpoint = (tomTat, tag, { auth, params = [], query = [], body, upload, responses = {} } = {}) => ({
  tags: [tag],
  summary: tomTat,
  ...(auth ? { security: [{ BearerAuth: [] }] } : {}),
  ...(params.length ? { parameters: params } : {}),
  ...(query.length ? { parameters: [...(params || []), ...query] } : {}),
  ...(body ? { requestBody: bodyJson(body) } : {}),
  ...(upload ? {
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['tepAnh'],
            properties: { tepAnh: { type: 'string', format: 'binary' } },
          },
        },
      },
    },
  } : {}),
  responses: {
    200: response.ThanhCong,
    400: response.Loi,
    ...(auth ? { 401: response.Loi, 403: response.Loi } : {}),
    ...responses,
  },
});

const maCoSo = [thamSoDuongDan('maCoSo')];
const maSan = [thamSoDuongDan('maSan')];
const maDatSan = [thamSoDuongDan('maDatSan')];
const maThanhToan = [thamSoDuongDan('maThanhToan')];
const maNguoiDung = [thamSoDuongDan('maNguoiDung')];
const maYeuCau = [thamSoDuongDan('maYeuCau')];

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Badminton System API',
    version: '1.0.0',
    description: [
      'Tài liệu và trang thử API cho hệ thống đặt sân cầu lông.',
      'API thông thường trả JSON tiếng Việt không dấu. Webhook SePay dùng phản hồi JSON theo yêu cầu của SePay.',
      'Nhấn Authorize để nhập mã truy cập dạng Bearer sau khi đăng nhập.',
      'Để thử webhook SePay thật cần request có chữ ký HMAC hợp lệ; không thể gọi trực tiếp từ trang này nếu không ký raw body.',
    ].join('\n\n'),
  },
  servers: [{ url: `http://localhost:${cauHinh.cong}`, description: 'Máy phát triển cục bộ' }],
  tags: [
    { name: 'Sức khỏe' },
    { name: 'Tài khoản' },
    { name: 'Khách hàng' },
    { name: 'Thanh toán' },
    { name: 'Chủ sân' },
    { name: 'Quản trị' },
    { name: 'Webhook SePay' },
  ],
  paths: {
    '/api/suc-khoe': {
      get: endpoint('Kiểm tra API đang hoạt động', 'Sức khỏe'),
    },
    '/api/suc-khoe/co-so-du-lieu': {
      get: endpoint('Kiểm tra kết nối db_sancaulong', 'Sức khỏe'),
    },
    '/api/tai-khoan/dang-ky': {
      post: endpoint('Đăng ký tài khoản khách hàng', 'Tài khoản', { body: 'DangKy' }),
    },
    '/api/tai-khoan/dang-ky-chu-san': {
      post: endpoint('Đăng ký tài khoản chủ sân', 'Tài khoản', { body: 'DangKy' }),
    },
    '/api/tai-khoan/dang-nhap': {
      post: endpoint('Đăng nhập khách hàng', 'Tài khoản', { body: 'DangNhap' }),
    },
    '/api/tai-khoan/dang-nhap-web': {
      post: endpoint('Đăng nhập chủ sân hoặc quản trị', 'Tài khoản', { body: 'DangNhap' }),
    },
    '/api/tai-khoan/ca-nhan': {
      get: endpoint('Xem thông tin cá nhân', 'Tài khoản', { auth: true }),
      patch: endpoint('Cập nhật thông tin cá nhân', 'Tài khoản', { auth: true, body: 'CapNhatCaNhan' }),
    },
    '/api/tai-khoan/doi-mat-khau': {
      post: endpoint('Đổi mật khẩu', 'Tài khoản', { auth: true, body: 'DoiMatKhau' }),
    },
    '/api/khach/co-so': {
      get: endpoint('Tìm cơ sở và sân còn trống', 'Khách hàng', {
        query: [
          thamSoTruyVan('ngay', 'Ngày chơi, định dạng YYYY-MM-DD', true),
          thamSoTruyVan('gioBatDau', 'Giờ bắt đầu HH:MM', true),
          thamSoTruyVan('gioKetThuc', 'Giờ kết thúc HH:MM', true),
          thamSoTruyVan('tinhThanh', 'Tỉnh hoặc thành phố'),
          thamSoTruyVan('quanHuyen', 'Quận hoặc huyện'),
        ],
      }),
    },
    '/api/khach/co-so/{maCoSo}': {
      get: endpoint('Xem chi tiết cơ sở', 'Khách hàng', { params: maCoSo }),
    },
    '/api/khach/san/{maSan}': {
      get: endpoint('Xem chi tiết sân và bảng giá', 'Khách hàng', { params: maSan }),
    },
    '/api/khach/san/{maSan}/lich-trong': {
      get: endpoint('Kiểm tra sân có trống trong khung giờ không', 'Khách hàng', {
        params: maSan,
        query: [
          thamSoTruyVan('ngay', 'Ngày chơi YYYY-MM-DD', true),
          thamSoTruyVan('gioBatDau', 'Giờ bắt đầu HH:MM', true),
          thamSoTruyVan('gioKetThuc', 'Giờ kết thúc HH:MM', true),
        ],
      }),
    },
    '/api/khach/dat-san': {
      post: endpoint('Đặt sân một lần', 'Khách hàng', { auth: true, body: 'DatSan' }),
      get: endpoint('Xem lịch sử đặt sân', 'Khách hàng', { auth: true }),
    },
    '/api/khach/dat-san/co-dinh': {
      post: endpoint('Đặt sân cố định hằng ngày tối đa 90 ngày, thanh toán một hóa đơn tổng', 'Khách hàng', {
        auth: true,
        body: 'DatSanCoDinh',
      }),
    },
    '/api/khach/dat-san/{maDatSan}/hoa-don-nhap': {
      get: endpoint('Xem hóa đơn nháp và hướng dẫn thanh toán', 'Khách hàng', { auth: true, params: maDatSan }),
    },
    '/api/khach/dat-san/{maDatSan}/huy': {
      post: endpoint('Hủy đơn đặt sân', 'Khách hàng', { auth: true, params: maDatSan }),
    },
    '/api/khach/dat-san/{maDatSan}/tai-khoan-hoan-tien': {
      put: endpoint('Cập nhật tài khoản nhận tiền hoàn', 'Khách hàng', {
        auth: true,
        params: maDatSan,
        body: 'TaiKhoanHoanTien',
      }),
    },
    '/api/thanh-toan/{maDatSan}/qr': {
      get: endpoint('Lấy QR và nội dung chuyển khoản', 'Thanh toán', { auth: true, params: maDatSan }),
    },
    '/api/thanh-toan/{maDatSan}/anh-chuyen-khoan': {
      post: endpoint('Tải ảnh chuyển khoản để tham khảo', 'Thanh toán', {
        auth: true,
        params: maDatSan,
        upload: true,
      }),
    },
    '/api/webhooks/sepay': {
      post: {
        ...endpoint('Nhận thông báo giao dịch SePay; cần chữ ký HMAC hợp lệ', 'Webhook SePay', {
          responses: {
            200: {
              description: 'Phản hồi bắt buộc cho SePay',
              content: { 'application/json': { schema: { type: 'object', example: { success: true } } } },
            },
            401: response.Loi,
            503: response.Loi,
          },
        }),
        parameters: [
          { name: 'X-SePay-Timestamp', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'X-SePay-Signature', in: 'header', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'transferType', 'transferAmount', 'accountNumber'],
                properties: {
                  id: { type: 'integer', example: 123456 },
                  gateway: { type: 'string', example: 'Vietcombank' },
                  transactionDate: { type: 'string', format: 'date-time' },
                  accountNumber: { type: 'string', example: '0123456789' },
                  content: { type: 'string', example: 'Thanh toan BK261031ABC123' },
                  transferType: { type: 'string', enum: ['in', 'out'] },
                  transferAmount: { type: 'integer', example: 200000 },
                  referenceCode: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    '/api/chu-san/dang-ky': {
      get: endpoint('Xem tiến độ đăng ký chủ sân', 'Chủ sân', { auth: true }),
    },
    '/api/chu-san/dang-ky/co-so': {
      put: endpoint('Lưu thông tin cơ sở đăng ký', 'Chủ sân', { auth: true, body: 'CoSo' }),
    },
    '/api/chu-san/dang-ky/bang-gia': {
      put: endpoint('Lưu bảng giá đăng ký', 'Chủ sân', { auth: true, body: 'BangGia' }),
    },
    '/api/chu-san/dang-ky/ngan-hang': {
      put: endpoint('Lưu tài khoản nhận tiền', 'Chủ sân', { auth: true, body: 'NganHang' }),
    },
    '/api/chu-san/dang-ky/gui-duyet': {
      post: endpoint('Gửi hồ sơ chủ sân để quản trị duyệt', 'Chủ sân', { auth: true }),
    },
    '/api/chu-san/co-so': {
      get: endpoint('Xem thông tin cơ sở', 'Chủ sân', { auth: true }),
      put: endpoint('Cập nhật thông tin cơ sở', 'Chủ sân', { auth: true, body: 'CoSo' }),
    },
    '/api/chu-san/co-so/bang-gia': {
      put: endpoint('Cập nhật bảng giá', 'Chủ sân', { auth: true, body: 'BangGia' }),
    },
    '/api/chu-san/co-so/anh': {
      post: endpoint('Tải ảnh cơ sở', 'Chủ sân', { auth: true, upload: true }),
    },
    '/api/chu-san/san': {
      get: endpoint('Liệt kê sân', 'Chủ sân', { auth: true }),
      post: endpoint('Tạo sân', 'Chủ sân', { auth: true, body: 'TaoSan' }),
    },
    '/api/chu-san/san/{maSan}': {
      patch: endpoint('Cập nhật sân', 'Chủ sân', {
        auth: true,
        params: maSan,
        body: 'CapNhatSan',
      }),
    },
    '/api/chu-san/khoa-san': {
      get: endpoint('Liệt kê khung giờ khóa sân', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('maSan', 'Mã sân'),
          thamSoTruyVan('tuNgay', 'Thời gian bắt đầu lọc'),
          thamSoTruyVan('denNgay', 'Thời gian kết thúc lọc'),
        ],
      }),
      post: endpoint('Khóa khung giờ sân', 'Chủ sân', { auth: true, body: 'KhoaSan' }),
    },
    '/api/chu-san/khoa-san/{maKhoa}': {
      delete: endpoint('Xóa khung giờ khóa sân', 'Chủ sân', {
        auth: true,
        params: [thamSoDuongDan('maKhoa')],
      }),
    },
    '/api/chu-san/bao-cao/doanh-thu': {
      get: endpoint('Báo cáo doanh thu ngày, tháng, năm', 'Chủ sân', {
        auth: true,
        query: [thamSoTruyVan('nam', 'Năm cần xem')],
      }),
    },
    '/api/chu-san/bao-cao/top-khach': {
      get: endpoint('Top khách hàng theo khoảng ngày', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('tuNgay', 'Ngày bắt đầu YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày kết thúc YYYY-MM-DD'),
        ],
      }),
    },
    '/api/chu-san/bao-cao/top-san': {
      get: endpoint('Top sân theo khoảng ngày', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('tuNgay', 'Ngày bắt đầu YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày kết thúc YYYY-MM-DD'),
        ],
      }),
    },
    '/api/chu-san/bao-cao/cong-no': {
      get: endpoint('Xem công nợ khách đặt tại sân', 'Chủ sân', { auth: true }),
    },
    '/api/chu-san/rut-tien/so-du': {
      get: endpoint('Xem số dư có thể rút', 'Chủ sân', { auth: true }),
    },
    '/api/chu-san/rut-tien': {
      post: endpoint('Tạo yêu cầu rút tiền', 'Chủ sân', { auth: true }),
    },
    '/api/quan-tri/chu-san/cho-duyet': {
      get: endpoint('Liệt kê hồ sơ chủ sân chờ duyệt', 'Quản trị', { auth: true }),
    },
    '/api/quan-tri/chu-san/{maNguoiDung}/duyet': {
      patch: endpoint('Duyệt hoặc từ chối hồ sơ chủ sân', 'Quản trị', {
        auth: true,
        params: maNguoiDung,
        body: 'DuyetChuSan',
      }),
    },
    '/api/quan-tri/hoan-tien': {
      get: endpoint('Xem hàng đợi hoàn tiền', 'Quản trị', { auth: true }),
    },
    '/api/quan-tri/hoan-tien/{maThanhToan}/xu-ly': {
      patch: endpoint('Duyệt xử lý hoàn tiền hoặc yêu cầu khách bổ sung tài khoản', 'Quản trị', {
        auth: true,
        params: maThanhToan,
      }),
    },
    '/api/quan-tri/hoan-tien/{maThanhToan}/hoan-tat': {
      patch: endpoint('Ghi nhận đã chuyển khoản hoàn tiền', 'Quản trị', {
        auth: true,
        params: maThanhToan,
        body: 'MaGiaoDichHoan',
      }),
    },
    '/api/quan-tri/rut-tien': {
      get: endpoint('Xem hàng đợi yêu cầu rút tiền', 'Quản trị', { auth: true }),
    },
    '/api/quan-tri/rut-tien/{maYeuCau}/da-chi': {
      patch: endpoint('Ghi nhận đã chi tiền cho chủ sân', 'Quản trị', {
        auth: true,
        params: maYeuCau,
        body: 'MaGiaoDich',
      }),
    },
    '/api/quan-tri/rut-tien/{maYeuCau}/tu-choi': {
      patch: endpoint('Từ chối yêu cầu rút tiền', 'Quản trị', {
        auth: true,
        params: maYeuCau,
        body: 'LyDoTuChoi',
      }),
    },
    '/api/quan-tri/giao-dich/sepay': {
      get: endpoint('Xem giao dịch SePay chưa đối soát', 'Quản trị', { auth: true }),
    },
    '/api/quan-tri/nhat-ky': {
      get: endpoint('Tra cứu nhật ký hệ thống', 'Quản trị', {
        auth: true,
        query: [
          thamSoTruyVan('tuNgay', 'Ngày bắt đầu YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày kết thúc YYYY-MM-DD'),
          thamSoTruyVan('gioiHan', 'Số bản ghi tối đa, từ 1 đến 100'),
        ],
      }),
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Dán maTruyCap từ API đăng nhập, không thêm tiền tố Bearer.',
      },
    },
    schemas: {
      DangKy: {
        type: 'object',
        required: ['tenDangNhap', 'matKhau', 'hoTen', 'soDienThoai', 'email'],
        properties: {
          tenDangNhap: { type: 'string', example: 'khach01' },
          matKhau: { type: 'string', format: 'password', example: 'MatKhau123' },
          hoTen: { type: 'string', example: 'Nguyen Van A' },
          soDienThoai: { type: 'string', example: '0901234567' },
          email: { type: 'string', format: 'email', example: 'khach@example.com' },
        },
      },
      DangNhap: {
        type: 'object',
        required: ['tenDangNhap', 'matKhau'],
        properties: {
          tenDangNhap: { type: 'string', example: 'khach01' },
          matKhau: { type: 'string', format: 'password', example: 'MatKhau123' },
        },
      },
      DoiMatKhau: {
        type: 'object',
        required: ['matKhauCu', 'matKhauMoi'],
        properties: {
          matKhauCu: { type: 'string', format: 'password' },
          matKhauMoi: { type: 'string', format: 'password', minLength: 6 },
        },
      },
      CapNhatCaNhan: {
        type: 'object',
        properties: {
          hoTen: { type: 'string' },
          soDienThoai: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      DatSan: {
        type: 'object',
        required: ['maSan', 'ngay', 'gioBatDau', 'gioKetThuc'],
        properties: {
          maSan: { type: 'integer', example: 1 },
          ngay: { type: 'string', format: 'date', example: '2026-11-15' },
          gioBatDau: { type: 'string', example: '18:00' },
          gioKetThuc: { type: 'string', example: '19:00' },
          tenKhach: { type: 'string', example: 'Nguyen Van A' },
          soDienThoai: { type: 'string', example: '0901234567' },
          ghiChu: { type: 'string' },
        },
      },
      DatSanCoDinh: {
        allOf: [
          { $ref: '#/components/schemas/DatSan' },
          {
            type: 'object',
            required: ['ngayKetThuc'],
            properties: { ngayKetThuc: { type: 'string', format: 'date', example: '2026-12-15' } },
          },
        ],
      },
      TaiKhoanHoanTien: {
        type: 'object',
        required: ['tenNganHang', 'maNganHang', 'soTaiKhoan', 'chuTaiKhoan'],
        properties: {
          tenNganHang: { type: 'string' },
          maNganHang: { type: 'string' },
          soTaiKhoan: { type: 'string' },
          chuTaiKhoan: { type: 'string' },
        },
      },
      CoSo: {
        type: 'object',
        required: [
          'tenCoSo', 'diaChi', 'tinhThanh', 'quanHuyen', 'soDienThoai',
          'linkBanDo', 'gioMoCua', 'gioDongCua', 'soPhutDatToiThieu',
        ],
        properties: {
          tenCoSo: { type: 'string' },
          diaChi: { type: 'string' },
          tinhThanh: { type: 'string' },
          quanHuyen: { type: 'string' },
          soDienThoai: { type: 'string' },
          zalo: { type: 'string' },
          linkBanDo: { type: 'string', format: 'uri' },
          moTa: { type: 'string' },
          gioMoCua: { type: 'string', example: '06:00' },
          gioDongCua: { type: 'string', example: '22:00' },
          soPhutDatToiThieu: { type: 'integer', example: 60 },
        },
      },
      BangGia: {
        type: 'object',
        required: ['khungGias'],
        properties: {
          khungGias: {
            type: 'array',
            items: {
              type: 'object',
              required: [
                'gioBatDau', 'gioKetThuc', 'giaNgayThuongKhachVangLai',
                'giaNgayThuongKhachCoDinh', 'giaCuoiTuanKhachVangLai',
                'giaCuoiTuanKhachCoDinh',
              ],
              properties: {
                gioBatDau: { type: 'string', example: '06:00' },
                gioKetThuc: { type: 'string', example: '12:00' },
                giaNgayThuongKhachVangLai: { type: 'integer', example: 80000 },
                giaNgayThuongKhachCoDinh: { type: 'integer', example: 70000 },
                giaCuoiTuanKhachVangLai: { type: 'integer', example: 100000 },
                giaCuoiTuanKhachCoDinh: { type: 'integer', example: 90000 },
              },
            },
          },
        },
      },
      NganHang: {
        type: 'object',
        required: ['tenNganHang', 'soTaiKhoan', 'chuTaiKhoan'],
        properties: {
          tenNganHang: { type: 'string' },
          soTaiKhoan: { type: 'string' },
          chuTaiKhoan: { type: 'string' },
        },
      },
      TaoSan: {
        type: 'object',
        required: ['tenSan'],
        properties: {
          tenSan: { type: 'string', example: 'San 1' },
          trangThai: { type: 'string', enum: ['active', 'maintenance'] },
        },
      },
      CapNhatSan: {
        type: 'object',
        properties: {
          tenSan: { type: 'string' },
          trangThai: { type: 'string', enum: ['active', 'maintenance'] },
        },
      },
      KhoaSan: {
        type: 'object',
        required: ['maSan', 'thoiGianBatDau', 'thoiGianKetThuc'],
        properties: {
          maSan: { type: 'integer' },
          thoiGianBatDau: { type: 'string', example: '2026-11-15 12:00' },
          thoiGianKetThuc: { type: 'string', example: '2026-11-15 14:00' },
          lyDo: { type: 'string' },
        },
      },
      DuyetChuSan: {
        type: 'object',
        required: ['trangThai'],
        properties: {
          trangThai: { type: 'string', enum: ['approved', 'rejected'] },
          lyDoTuChoi: { type: 'string' },
        },
      },
      MaGiaoDichHoan: {
        type: 'object',
        required: ['maGiaoDichHoan'],
        properties: { maGiaoDichHoan: { type: 'string' } },
      },
      MaGiaoDich: {
        type: 'object',
        required: ['maGiaoDich'],
        properties: { maGiaoDich: { type: 'string' } },
      },
      LyDoTuChoi: {
        type: 'object',
        required: ['lyDoTuChoi'],
        properties: { lyDoTuChoi: { type: 'string' } },
      },
    },
  },
};
