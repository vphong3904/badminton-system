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
      'API thông thường trả JSON tiếng Việt không dấu.',
      'Nhấn Authorize để nhập mã truy cập dạng Bearer sau khi đăng nhập.',
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
    '/api/khach/co-so/danh-sach': {
      get: endpoint('Danh sách tất cả cơ sở đang hoạt động (cho trang chủ)', 'Khách hàng'),
    },
    '/api/khach/co-so/{maCoSo}': {
      get: endpoint('Xem chi tiết cơ sở', 'Khách hàng', { params: maCoSo }),
    },
    '/api/khach/co-so/{maCoSo}/lich-ngay': {
      get: endpoint('Xem lịch các sân của cơ sở trong một ngày (khung đã đặt/bị khóa và bảng giá)', 'Khách hàng', {
        params: maCoSo,
        query: [thamSoTruyVan('ngay', 'Ngày chơi YYYY-MM-DD', true)],
      }),
    },
    '/api/khach/co-so/{maCoSo}/danh-gia': {
      get: endpoint('Xem đánh giá của cơ sở (công khai, mới nhất trước, bỏ đánh giá bị admin ẩn)', 'Khách hàng', {
        params: maCoSo,
        query: [
          thamSoTruyVan('trang', 'Trang, từ 1 (mặc định 1)'),
          thamSoTruyVan('soLuong', 'Số đánh giá mỗi trang, 1–50 (mặc định 20)'),
        ],
        responses: { 404: response.Loi },
      }),
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
    '/api/khach/dat-san/{maDatSan}/danh-gia': {
      post: endpoint('Đánh giá cơ sở sau khi chơi xong và đã thanh toán (đơn completed, mỗi đơn 1 đánh giá; trả 201)', 'Khách hàng', {
        auth: true,
        params: maDatSan,
        body: 'DanhGiaMoi',
        responses: { 404: response.Loi, 409: response.Loi },
      }),
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
      post: {
        ...endpoint('Khách gửi ảnh chuyển khoản → thanh toán chuyển sang confirming (đợi chủ sân xác nhận)', 'Thanh toán', {
          auth: true,
          params: maDatSan,
          responses: { 404: response.Loi, 409: response.Loi },
        }),
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['anhChuyenKhoan'],
                properties: { anhChuyenKhoan: { type: 'string', format: 'binary' } },
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
      get: endpoint('Danh sách TẤT CẢ cơ sở của tôi (kèm soSan, soSanHoatDong)', 'Chủ sân', { auth: true }),
      post: endpoint('Tạo thêm cơ sở (ẩn cho tới khi có sân + bảng giá)', 'Chủ sân', { auth: true, body: 'CoSo' }),
      put: endpoint('[Cũ] Cập nhật cơ sở đầu tiên - nên dùng PUT /co-so/{maCoSo}', 'Chủ sân', { auth: true, body: 'CoSo' }),
    },
    '/api/chu-san/co-so/bang-gia': {
      put: endpoint('[Cũ] Cập nhật bảng giá cơ sở đầu tiên', 'Chủ sân', { auth: true, body: 'BangGia' }),
    },
    '/api/chu-san/co-so/anh': {
      post: endpoint('[Cũ] Tải ảnh cơ sở đầu tiên', 'Chủ sân', { auth: true, upload: true }),
    },
    '/api/chu-san/co-so/{maCoSo}': {
      get: endpoint('Chi tiết 1 cơ sở của tôi', 'Chủ sân', { auth: true, params: maCoSo }),
      put: endpoint('Cập nhật 1 cơ sở', 'Chủ sân', { auth: true, params: maCoSo, body: 'CoSo' }),
    },
    '/api/chu-san/co-so/{maCoSo}/bang-gia': {
      put: endpoint('Cập nhật bảng giá của 1 cơ sở', 'Chủ sân', { auth: true, params: maCoSo, body: 'BangGia' }),
    },
    '/api/chu-san/co-so/{maCoSo}/anh': {
      post: endpoint('Tải ảnh cho 1 cơ sở', 'Chủ sân', { auth: true, params: maCoSo, upload: true }),
    },
    '/api/chu-san/san': {
      get: endpoint('Liệt kê sân của mọi cơ sở (lọc ?maCoSo)', 'Chủ sân', {
        auth: true,
        query: [thamSoTruyVan('maCoSo', 'Chỉ sân của cơ sở này')],
      }),
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
    '/api/chu-san/dat-san': {
      get: endpoint('Danh sách đơn đặt sân của khách tại cơ sở của tôi', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('trangThai', 'pending_payment | confirmed | completed | cancelled | expired'),
          thamSoTruyVan('trangThaiThanhToan', 'pending | confirming (đợi xác nhận) | success | failed | expired | late_payment'),
          thamSoTruyVan('maCoSo', 'Lọc theo cơ sở'),
          thamSoTruyVan('maSan', 'Lọc theo sân'),
          thamSoTruyVan('ngay', 'Đúng 1 ngày chơi YYYY-MM-DD (ưu tiên hơn tuNgay/denNgay)'),
          thamSoTruyVan('soDong', 'Số đơn mỗi trang, 1-200 (mặc định 20)'),
          thamSoTruyVan('tuNgay', 'Ngày chơi từ YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày chơi đến YYYY-MM-DD'),
          thamSoTruyVan('tuKhoa', 'Tìm theo mã đơn / tên / SĐT khách'),
          thamSoTruyVan('trang', 'Trang (mặc định 1, 20 đơn/trang)'),
          thamSoTruyVan('sapXep', 'moi-nhat (mặc định: ngày chơi mới nhất trước, cũ nhất cuối) | cu-nhat'),
        ],
      }),
      post: endpoint('Chủ sân tạo đơn cho khách tại chỗ (1 ngày) hoặc khách cố định (có ngayKetThuc) — xác nhận ngay', 'Chủ sân', {
        auth: true,
        body: 'ChuSanTaoDon',
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/dat-san/{maDatSan}': {
      get: endpoint('Chi tiết đơn (hoá đơn) tại cơ sở của tôi', 'Chủ sân', { auth: true, params: maDatSan }),
    },
    '/api/chu-san/dat-san/{maDatSan}/xac-nhan-thanh-toan': {
      post: endpoint('Chủ sân xác nhận đã nhận tiền → đơn thành công (confirmed)', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/dat-san/{maDatSan}/tu-choi-thanh-toan': {
      post: endpoint('Chủ sân từ chối ảnh chuyển khoản (kèm lý do) → khách gửi lại', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        body: 'TuChoiThanhToan',
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/hoan-tien': {
      get: endpoint('Yêu cầu hoàn tiền của khách huỷ đơn (chủ sân tự chuyển khoản)', 'Chủ sân', {
        auth: true,
        query: [thamSoTruyVan('trangThai', 'processing (chờ hoàn, mặc định) | refunded (đã hoàn)')],
      }),
    },
    '/api/chu-san/hoan-tien/{maThanhToan}/hoan-thanh': {
      post: endpoint('Chủ sân xác nhận đã chuyển khoản hoàn tiền cho khách', 'Chủ sân', {
        auth: true,
        params: maThanhToan,
        body: 'HoanThanhHoanTien',
      }),
    },
    '/api/chu-san/bao-cao/doanh-thu': {
      get: endpoint('Báo cáo doanh thu theo ngày/tháng/năm hoặc khoảng ngày tự chọn (kèm tongCong)', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('nam', 'Xem theo năm, vd 2026'),
          thamSoTruyVan('thang', 'Xem theo tháng 1-12 (cần kèm nam)'),
          thamSoTruyVan('tuNgay', 'Khoảng ngày tự chọn: từ YYYY-MM-DD (ưu tiên hơn nam/thang)'),
          thamSoTruyVan('denNgay', 'Khoảng ngày tự chọn: đến YYYY-MM-DD'),
          thamSoTruyVan('maCoSo', 'Chỉ tính 1 cơ sở'),
        ],
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
    '/api/chu-san/bao-cao/khach-hang/tong-quan': {
      get: endpoint('Tổng quan khách đặt sân: số khách, khách mới/quay lại, tỷ lệ huỷ, chi tiêu, theo nguồn, khách mới theo tháng', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('tuNgay', 'Ngày chơi từ YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày chơi đến YYYY-MM-DD'),
          thamSoTruyVan('maCoSo', 'Chỉ tính 1 cơ sở'),
        ],
      }),
    },
    '/api/chu-san/bao-cao/khach-hang': {
      get: endpoint('Danh sách khách đặt sân kèm số lượt, chi tiêu, công nợ, lần đặt gần nhất', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('tuNgay', 'Ngày chơi từ YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày chơi đến YYYY-MM-DD'),
          thamSoTruyVan('maCoSo', 'Chỉ tính 1 cơ sở'),
          thamSoTruyVan('tuKhoa', 'Tìm theo tên / SĐT khách'),
          thamSoTruyVan('nhom', 'moi (đặt lần đầu trong khoảng) | quay-lai (từ 2 lượt)'),
          thamSoTruyVan('sapXep', 'luot-dat (mặc định) | chi-tieu | gan-nhat | ten'),
          thamSoTruyVan('trang', 'Trang (mặc định 1)'),
          thamSoTruyVan('soDong', 'Số khách mỗi trang, 1-100 (mặc định 20)'),
        ],
      }),
    },
    '/api/chu-san/bao-cao/khach-hang/chi-tiet': {
      get: endpoint('Chi tiết 1 khách: tổng hợp, sân hay đặt, lịch sử đơn (mới nhất trước)', 'Chủ sân', {
        auth: true,
        responses: { 404: response.Loi },
        query: [
          thamSoTruyVan('maKhachHang', 'Mã khách có tài khoản (hoặc dùng soDienThoai)'),
          thamSoTruyVan('soDienThoai', 'SĐT khách vãng lai do chủ sân tạo (hoặc dùng maKhachHang)'),
          thamSoTruyVan('maCoSo', 'Chỉ 1 cơ sở'),
          thamSoTruyVan('tuNgay', 'Ngày chơi từ YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày chơi đến YYYY-MM-DD'),
          thamSoTruyVan('trang', 'Trang đơn (mặc định 1)'),
          thamSoTruyVan('soDong', 'Số đơn mỗi trang, 1-100 (mặc định 20)'),
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
    '/api/quan-tri/dat-san/cho-xac-nhan': {
      get: endpoint('Admin: đơn khách đã gửi ảnh chuyển khoản, đang đợi xác nhận (kèm anhChuyenKhoanUrl)', 'Quản trị', { auth: true }),
    },
    '/api/quan-tri/dat-san/{maDatSan}/xac-nhan-thanh-toan': {
      post: endpoint('Admin xác nhận thanh toán → đơn thành công (confirmed)', 'Quản trị', {
        auth: true,
        params: maDatSan,
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/dat-san/{maDatSan}/tu-choi-thanh-toan': {
      post: endpoint('Admin từ chối ảnh chuyển khoản (kèm lý do) → khách gửi lại', 'Quản trị', {
        auth: true,
        params: maDatSan,
        body: 'TuChoiThanhToan',
        responses: { 404: response.Loi, 409: response.Loi },
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
        required: ['matKhau', 'hoTen', 'soDienThoai', 'email'],
        properties: {
          matKhau: { type: 'string', format: 'password', minLength: 8, maxLength: 72, description: 'Có cả chữ và số, không khoảng trắng', example: 'MatKhau123' },
          hoTen: { type: 'string', minLength: 2, maxLength: 100, description: 'Chỉ chữ cái, khoảng trắng và . \' -', example: 'Nguyen Van A' },
          soDienThoai: { type: 'string', pattern: '^0[35789][0-9]{8}$', description: 'Số di động VN; nhận cả +84 và tự chuẩn hoá về 0xxxxxxxxx', example: '0901234567' },
          email: { type: 'string', format: 'email', example: 'khach@example.com' },
        },
      },
      DangNhap: {
        type: 'object',
        required: ['email', 'matKhau'],
        properties: {
          email: { type: 'string', format: 'email', example: 'khach@example.com' },
          matKhau: { type: 'string', format: 'password', example: 'MatKhau123' },
        },
      },
      DoiMatKhau: {
        type: 'object',
        required: ['matKhauCu', 'matKhauMoi'],
        properties: {
          matKhauCu: { type: 'string', format: 'password' },
          matKhauMoi: { type: 'string', format: 'password', minLength: 8, maxLength: 72, description: 'Có cả chữ và số, không khoảng trắng, khác matKhauCu' },
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
        required: ['maSan', 'ngay', 'gioBatDau', 'gioKetThuc', 'tenKhach', 'soDienThoai'],
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
      ChuSanTaoDon: {
        allOf: [
          { $ref: '#/components/schemas/DatSan' },
          {
            type: 'object',
            properties: {
              ngayKetThuc: {
                type: 'string', format: 'date', example: '2026-12-15',
                description: 'Có → khách cố định, tạo đơn mỗi ngày từ ngay đến ngayKetThuc',
              },
              daThu: { type: 'boolean', example: true, description: 'Khách đã trả tiền chưa (mặc định false)' },
            },
          },
        ],
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
      DanhGiaMoi: {
        type: 'object',
        required: ['soSao'],
        properties: {
          soSao: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
          noiDung: { type: 'string', maxLength: 1000, description: 'Không bắt buộc', example: 'Sân đẹp, đèn sáng, chủ sân nhiệt tình.' },
        },
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
        required: ['tenNganHang', 'maNganHang', 'soTaiKhoan', 'chuTaiKhoan'],
        properties: {
          tenNganHang: { type: 'string' },
          maNganHang: { type: 'string' },
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
      TuChoiThanhToan: {
        type: 'object',
        required: ['lyDo'],
        properties: { lyDo: { type: 'string', minLength: 2, maxLength: 255, example: 'Chưa thấy tiền về tài khoản' } },
      },
      HoanThanhHoanTien: {
        type: 'object',
        properties: { maGiaoDichHoan: { type: 'string', maxLength: 100, description: 'Mã giao dịch chuyển khoản hoàn (không bắt buộc)' } },
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
