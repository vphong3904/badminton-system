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
const maDanhGia = [thamSoDuongDan('maDanhGia')];

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
    { name: 'Thông báo' },
    { name: 'Đánh giá', description: 'Khách sửa/xoá đánh giá, chủ sân phản hồi, admin ẩn/hiện đánh giá vi phạm' },
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
      post: endpoint('Đăng ký tài khoản chủ sân (hồ sơ vào thẳng pending, chờ admin duyệt)', 'Tài khoản', { body: 'DangKyChuSan' }),
    },
    '/api/tai-khoan/ngan-hang': {
      get: endpoint('Danh sách ngân hàng cho ô chọn khi đăng ký chủ sân', 'Tài khoản'),
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
    '/api/tai-khoan/ca-nhan/anh': {
      post: endpoint('Đổi ảnh đại diện (multipart, trường tepAnh)', 'Tài khoản', { auth: true }),
    },
    '/api/tai-khoan/doi-mat-khau': {
      post: endpoint('Đổi mật khẩu', 'Tài khoản', { auth: true, body: 'DoiMatKhau' }),
    },
    '/api/khach/co-so': {
      get: endpoint('Tìm cơ sở/sân (mọi tiêu chí tuỳ chọn, kết hợp AND; có lọc giá thì xếp giá rẻ→đắt trước; sau đó gần→xa nếu có GPS, không thì sao cao→thấp)', 'Khách hàng', {
        query: [
          thamSoTruyVan('ngay', 'Ngày chơi YYYY-MM-DD (đi chung với gioBatDau, gioKetThuc)'),
          thamSoTruyVan('gioBatDau', 'Giờ bắt đầu HH:MM (đi chung với ngay, gioKetThuc)'),
          thamSoTruyVan('gioKetThuc', 'Giờ kết thúc HH:MM (đi chung với ngay, gioBatDau)'),
          thamSoTruyVan('tinhThanh', 'Tỉnh hoặc thành phố'),
          thamSoTruyVan('quanHuyen', 'Quận hoặc huyện (cần kèm tinhThanh)'),
          thamSoTruyVan('giaToiThieu', 'Giá/giờ tối thiểu, VNĐ (đi chung với giaToiDa)'),
          thamSoTruyVan('giaToiDa', 'Giá/giờ tối đa, VNĐ (đi chung với giaToiThieu)'),
          thamSoTruyVan('viDo', 'Vĩ độ GPS của khách (đi chung với kinhDo)'),
          thamSoTruyVan('kinhDo', 'Kinh độ GPS của khách (đi chung với viDo)'),
        ],
      }),
    },
    '/api/khach/co-so/danh-sach': {
      get: endpoint('Danh sách tất cả cơ sở đang hoạt động (cho trang chủ)', 'Khách hàng'),
    },
    '/api/khach/co-so/{maCoSo}': {
      get: endpoint('Xem chi tiết cơ sở (có `soPhutDatToiThieu` và `soPhutTreToiDa` để hiển thị trước khi đặt)', 'Khách hàng', { params: maCoSo }),
    },
    '/api/khach/co-so/{maCoSo}/lich-ngay': {
      get: endpoint('Xem lịch các sân của cơ sở trong một ngày (khung đã đặt/bị khóa, bảng giá, `soPhutDatToiThieu`, `soPhutTreToiDa`)', 'Khách hàng', {
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
      get: endpoint('Xem chi tiết sân và bảng giá (có `soPhutDatToiThieu` và `soPhutTreToiDa` của cơ sở)', 'Khách hàng', { params: maSan }),
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
      post: endpoint('Đặt sân một lần (429 ABUSE_HOLD_BLOCKED nếu bị chặn do giữ sân ảo)', 'Khách hàng', { auth: true, body: 'DatSan' }),
      get: endpoint('Xem lịch sử đặt sân', 'Khách hàng', { auth: true }),
    },
    '/api/khach/dat-san/co-dinh': {
      post: endpoint('Đặt sân cố định hằng ngày tối đa 90 ngày, thanh toán một hóa đơn tổng', 'Khách hàng', {
        auth: true,
        body: 'DatSanCoDinh',
      }),
    },
    '/api/khach/dat-san/nhieu': {
      post: endpoint(
        'Đặt nhiều sân / nhiều khung giờ trong MỘT cơ sở, MỘT ngày, thanh toán 1 QR. Tất cả hoặc không: '
        + 'các mục liền kề cùng sân được gộp thành cụm, mỗi cụm là 1 đơn con (cùng maNhomDat, cùng hetHanGiuCho). '
        + '400 cụm ngắn hơn tối thiểu (chiTiet.cacCumNgan[]: maSan/ngay/gioBatDau/gioKetThuc/soPhut/soPhutToiThieu); '
        + '409 CONFLICT kèm chiTiet.cacCumTrung (đủ mọi cụm trùng, lyDo booked|locked) và không giữ cụm nào; '
        + '429 ABUSE_HOLD_BLOCKED khi khách hủy/để hết hạn ≥ abuse_threshold đợt trong abuse_window_hours (chiTiet: soLan/nguong/gioCuaSo/chanDen)',
        'Khách hàng',
        { auth: true, body: 'DatNhieuSan', responses: { 404: response.Loi, 409: response.Loi, 429: response.Loi, 503: response.Loi } }),
    },
    '/api/khach/dat-san/{maDatSan}/hoa-don-nhap': {
      get: endpoint('Xem hóa đơn nháp và hướng dẫn thanh toán (đơn con bất kỳ của nhóm nhiều sân đều trả hóa đơn tổng của nhóm; có maNhomDat, conLaiGiay; '
        + 'G2: đã gửi ảnh thì hetHanGiuCho/conLaiGiay = null, thêm hanXacNhan, conLaiXacNhanGiay, chungTu[] (các ảnh đã gửi, không có cảnh báo trùng ảnh), soAnhToiDa)', 'Khách hàng', { auth: true, params: maDatSan }),
    },
    '/api/khach/dat-san/{maDatSan}/huy-xem-truoc': {
      get: endpoint(
        'Xem trước kết quả hủy (không ghi DB): trả daThanhToan, soTienHoan, tiLeHoan (100/50/0), soGioConLai '
        + 'để app hiện cảnh báo trước khi khách xác nhận hủy',
        'Khách hàng',
        { auth: true, params: maDatSan, responses: { 404: response.Loi, 409: response.Loi } }),
    },
    '/api/khach/dat-san/{maDatSan}/huy': {
      post: endpoint(
        'Hủy đơn đặt sân (đơn thuộc nhóm nhiều sân/khung giờ: hủy TẤT CẢ đơn con của nhóm). Đơn đã thanh toán hoàn theo chính sách: còn ≥24h hoàn 100%, 12–24h hoàn 50%, '
        + 'dưới 12h không hoàn; có hoàn thì tạo yêu cầu hoàn tiền cho chủ sân và gửi thông báo',
        'Khách hàng',
        { auth: true, params: maDatSan }),
    },
    '/api/khach/dat-san/{maDatSan}/check-in': {
      post: endpoint(
        'G3 – Khách quét QR check-in tại sân (mỗi đơn con check-in riêng). Body {maSan, token, phienBan} tách từ QR "bc1:<maSan>:<phienBan>:<token>", '
        + 'quetLuc/viDo/kinhDo tuỳ chọn. Backend kiểm theo thứ tự: token → phiên bản → chủ đơn → đúng sân → trạng thái → cửa sổ giờ (giờ MÁY CHỦ, '
        + 'từ checkin_open_minutes trước giờ chơi đến hết SoPhutTreToiDa) → chưa check-in. Mã lỗi: QR_INVALID(400), QR_OUTDATED(400), NOT_BOOKING_OWNER(403), '
        + 'WRONG_COURT(409), BOOKING_NOT_PAID(409), BOOKING_NOT_ELIGIBLE(409), OUT_OF_WINDOW(409, chiTiet.viTri = qua_som|qua_tre), ALREADY_CHECKED_IN(409). '
        + 'Thành công: đơn → checked_in; đơn đang chờ chủ sân duyệt được tự xác nhận (nhật ký xac_nhan_qua_check_in), trả daTuXacNhanDon.',
        'Khách hàng',
        { auth: true, params: maDatSan, body: 'CheckInQr', responses: { 403: response.Loi, 409: response.Loi } }),
    },
    '/api/khach/dat-san/{maDatSan}/khieu-nai': {
      post: endpoint(
        'Khách khiếu nại chủ sân (chỉ đơn đã hủy và hoàn tiền xong — hoàn tiền refunded; mỗi đơn 1 lần; trả 201)',
        'Khách hàng',
        { auth: true, params: maDatSan, body: 'KhieuNaiMoi', responses: { 404: response.Loi, 409: response.Loi } }),
    },
    '/api/khach/khieu-nai': {
      get: endpoint('Danh sách khiếu nại của khách', 'Khách hàng', { auth: true }),
    },
    '/api/thong-bao': {
      get: endpoint('Danh sách thông báo của người đăng nhập (mới nhất trước) + số chưa đọc', 'Thông báo', {
        auth: true,
        query: [
          thamSoTruyVan('trang', 'Trang, mặc định 1'),
          thamSoTruyVan('soLuong', 'Số dòng mỗi trang (1–50), mặc định 30'),
          thamSoTruyVan('chiChuaDoc', 'true = chỉ thông báo chưa đọc'),
        ],
      }),
    },
    '/api/thong-bao/chua-doc': {
      get: endpoint('Đếm thông báo chưa đọc (cho chấm đỏ ở chuông)', 'Thông báo', { auth: true }),
    },
    '/api/thong-bao/da-doc-tat-ca': {
      post: endpoint('Đánh dấu tất cả thông báo là đã đọc', 'Thông báo', { auth: true }),
    },
    '/api/thong-bao/{maThongBao}/da-doc': {
      patch: endpoint('Đánh dấu một thông báo là đã đọc', 'Thông báo', {
        auth: true, params: [thamSoDuongDan('maThongBao')],
      }),
    },
    '/api/khach/dat-san/{maDatSan}/danh-gia': {
      post: endpoint('Đánh giá cơ sở sau khi chơi xong và đã thanh toán (đơn completed, mỗi đơn 1 đánh giá; trả 201)', 'Khách hàng', {
        auth: true,
        params: maDatSan,
        body: 'DanhGiaMoi',
        responses: { 404: response.Loi, 409: response.Loi },
      }),
      patch: endpoint(
        'Khách sửa đánh giá của mình (soSao và/hoặc noiDung, ít nhất 1 trường) trong 7 ngày kể từ lúc đánh giá; '
        + 'quá hạn → 409 REVIEW_EDIT_EXPIRED; đánh giá đã bị ẩn → 409 REVIEW_HIDDEN; tính lại điểm cơ sở. '
        + 'maDatSan là buổi đang giữ đánh giá (maDatSanDanhGia trong GET /khach/dat-san)',
        'Đánh giá', {
          auth: true,
          params: maDatSan,
          body: 'SuaDanhGia',
          responses: { 404: response.Loi, 409: response.Loi },
        }),
      delete: endpoint(
        'Khách xoá đánh giá của mình (không giới hạn thời gian), tính lại điểm cơ sở; sau đó được đánh giá lại',
        'Đánh giá', { auth: true, params: maDatSan, responses: { 404: response.Loi } }),
    },
    '/api/khach/dat-san/{maDatSan}/tai-khoan-hoan-tien': {
      put: endpoint('Cập nhật tài khoản nhận tiền hoàn', 'Khách hàng', {
        auth: true,
        params: maDatSan,
        body: 'TaiKhoanHoanTien',
      }),
    },
    '/api/khach/hoan-tien/{maHoanTien}/da-nhan': {
      post: endpoint('G4 – Khách xác nhận ĐÃ NHẬN lại tiền hoàn (refunded → received, đóng khoản hoàn). maHoanTien lấy từ GET /khach/dat-san. 409 REFUND_NOT_SENT nếu chủ sân chưa chuyển',
        'Khách hàng', { auth: true, params: [thamSoDuongDan('maHoanTien')], responses: { 404: response.Loi, 409: response.Loi } }),
    },
    '/api/khach/hoan-tien/{maHoanTien}/chua-nhan': {
      post: endpoint('G4 – Khách báo CHƯA nhận được tiền hoàn (refunded → not_received; vẫn tính HanHoan cũ, chủ sân được báo để chuyển lại). Body tuỳ chọn {ghiChu}',
        'Khách hàng', { auth: true, params: [thamSoDuongDan('maHoanTien')], responses: { 404: response.Loi, 409: response.Loi } }),
    },
    '/api/thanh-toan/{maDatSan}/qr': {
      get: endpoint('Lấy QR và nội dung chuyển khoản', 'Thanh toán', { auth: true, params: maDatSan }),
    },
    '/api/thanh-toan/{maDatSan}/anh-chuyen-khoan': {
      post: {
        ...endpoint('Khách gửi ảnh chuyển khoản → confirming (đợi chủ sân xác nhận). G2: mỗi lần gửi thêm 1 chứng từ (không xoá ảnh cũ, tối đa 5 ảnh/đơn, 409 PROOF_LIMIT), '
          + 'giữ chỗ vô thời hạn (HetHanGiuCho=NULL), hanXacNhan = +30 phút (+15 nếu đặt gấp). Trả maChungTu, soAnhDaGui, hanXacNhan, conLaiXacNhanGiay', 'Thanh toán', {
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
                properties: {
                  anhChuyenKhoan: { type: 'string', format: 'binary' },
                  thoiDiemChuyen: {
                    type: 'string',
                    description: 'Tuỳ chọn: giờ chuyển khoản trên biên lai, ISO 8601 hoặc "YYYY-MM-DD HH:mm" (giờ VN); không được ở tương lai',
                    example: '2026-11-21 14:30',
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/chu-san/ngan-hang': {
      patch: endpoint('Đổi tài khoản nhận tiền (mọi trạng thái hồ sơ): chọn maNganHang + số tài khoản', 'Chủ sân', { auth: true, body: 'DoiNganHang' }),
    },
    '/api/chu-san/co-so/{maCoSo}/dong': {
      patch: endpoint('Đóng tạm cơ sở (409 HAS_ACTIVE_BOOKINGS nếu còn khách/lịch cố định)', 'Chủ sân', { auth: true, params: maCoSo, body: 'LyDoDongXoa' }),
    },
    '/api/chu-san/co-so/{maCoSo}/mo': {
      patch: endpoint('Mở lại cơ sở đã đóng', 'Chủ sân', { auth: true, params: maCoSo }),
    },
    '/api/chu-san/san/{maSan}/dong': {
      patch: endpoint('Đóng tạm sân (409 HAS_ACTIVE_BOOKINGS nếu còn khách/lịch cố định)', 'Chủ sân', { auth: true, params: maSan, body: 'LyDoDongXoa' }),
    },
    '/api/chu-san/san/{maSan}/mo': {
      patch: endpoint('Bật sân (chưa hoạt động/đã đóng → active); sân đầu tiên được bật thì cơ sở tự hiện cho khách nếu đã có bảng giá', 'Chủ sân', { auth: true, params: maSan }),
    },
    '/api/chu-san/san/{maSan}': {
      delete: endpoint('Xoá sân (phải đóng trước; 409 MUST_CLOSE_FIRST / HAS_ACTIVE_BOOKINGS / HAS_BOOKING_HISTORY)', 'Chủ sân', { auth: true, params: maSan, body: 'LyDoDongXoa' }),
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
    '/api/chu-san/dang-ky/doanh-nghiep': {
      put: endpoint('Sửa tên doanh nghiệp (khi hồ sơ bị từ chối)', 'Chủ sân', { auth: true, body: 'DoanhNghiep' }),
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
      get: endpoint('Xem bảng giá của 1 cơ sở (trang quản lý bảng giá: chọn cơ sở ở dropdown)', 'Chủ sân', { auth: true, params: maCoSo }),
      post: endpoint('Thêm MỘT khung giá tuỳ chỉnh vào cơ sở (400 nếu ngoài giờ mở cửa hoặc chồng khung cũ)', 'Chủ sân', { auth: true, params: maCoSo, body: 'KhungGia' }),
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
      post: endpoint('Tạo sân (luôn ở trạng thái chưa hoạt động `maintenance`; chủ sân phải bật bằng PATCH /san/{maSan}/mo)', 'Chủ sân', { auth: true, body: 'TaoSan' }),
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
      post: endpoint('Khóa khung giờ sân (1 ngày hoặc khoảng ngày)', 'Chủ sân', { auth: true, body: 'KhoaSan' }),
    },
    '/api/chu-san/khoa-san/{maKhoa}': {
      delete: endpoint('Xóa khung giờ khóa sân', 'Chủ sân', {
        auth: true,
        params: [thamSoDuongDan('maKhoa')],
      }),
    },
    '/api/chu-san/danh-gia': {
      get: endpoint('Chủ sân xem đánh giá của các cơ sở của mình (kể cả đã bị ẩn, có cờ biAn), mới nhất trước', 'Đánh giá', {
        auth: true,
        query: [
          thamSoTruyVan('maCoSo', 'Chỉ lấy đánh giá của cơ sở này'),
          thamSoTruyVan('soSao', 'Lọc theo số sao 1–5'),
          thamSoTruyVan('sapXep', 'moi-nhat (mặc định) | sao-thap (1→5 sao) | sao-cao (5→1 sao)'),
          thamSoTruyVan('chuaPhanHoi', 'true = chỉ đánh giá chưa phản hồi · false = chỉ đánh giá đã phản hồi'),
          thamSoTruyVan('trang', 'Trang, từ 1 (mặc định 1)'),
          thamSoTruyVan('soLuong', 'Số dòng mỗi trang, 1–50 (mặc định 20)'),
        ],
      }),
    },
    '/api/chu-san/danh-gia/{maDanhGia}/phan-hoi': {
      patch: endpoint(
        'Chủ sân phản hồi đánh giá của cơ sở mình (2–1000 ký tự; ghi đè được phản hồi cũ); đánh giá đã ẩn → 409; báo khách review_replied',
        'Đánh giá', {
          auth: true,
          params: maDanhGia,
          body: 'PhanHoiDanhGia',
          responses: { 404: response.Loi, 409: response.Loi },
        }),
      delete: endpoint(
        'Chủ sân xoá phản hồi của mình (đánh giá của khách giữ nguyên, phản hồi lại được); chưa có phản hồi → 409 REVIEW_NO_REPLY',
        'Đánh giá', {
          auth: true,
          params: maDanhGia,
          responses: { 404: response.Loi, 409: response.Loi },
        }),
    },
    '/api/chu-san/dat-san': {
      get: endpoint('Danh sách đơn đặt sân của khách tại cơ sở của tôi', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('trangThai', 'pending_payment | confirmed | checked_in | completed | cancelled | expired'),
          thamSoTruyVan('trangThaiThanhToan', 'pending | confirming (đợi xác nhận) | success | failed | expired | late_payment'),
          thamSoTruyVan('maCoSo', 'Lọc theo cơ sở'),
          thamSoTruyVan('maSan', 'Lọc theo sân'),
          thamSoTruyVan('ngay', 'Đúng 1 ngày chơi YYYY-MM-DD (ưu tiên hơn tuNgay/denNgay)'),
          thamSoTruyVan('soDong', 'Số đơn mỗi trang, 1-200 (mặc định 20)'),
          thamSoTruyVan('tuNgay', 'Ngày chơi từ YYYY-MM-DD'),
          thamSoTruyVan('denNgay', 'Ngày chơi đến YYYY-MM-DD'),
          thamSoTruyVan('tuKhoa', 'Tìm theo mã đơn / tên / SĐT khách'),
          thamSoTruyVan('trang', 'Trang (mặc định 1, 20 đơn/trang)'),
          thamSoTruyVan('sapXep', 'moi-nhat (mặc định: ngày chơi mới nhất trước, cũ nhất cuối) | cu-nhat | han-xac-nhan (G2: hàng đợi duyệt thanh toán, sắp hết hạn/quá hạn lên đầu)'),
        ],
      }),
      post: endpoint('Chủ sân tạo đơn cho khách tại chỗ (1 ngày) hoặc khách cố định (có ngayKetThuc) — xác nhận ngay', 'Chủ sân', {
        auth: true,
        body: 'ChuSanTaoDon',
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/dat-san/{maDatSan}': {
      get: endpoint('Chi tiết đơn (hoá đơn) tại cơ sở của tôi. G2: thêm hanXacNhan, conLaiXacNhanGiay, quaHanXacNhan, chungTu[] (nhiều ảnh) và canhBaoTrungAnh[] (ảnh đã dùng ở đơn khác — chỉ cảnh báo)', 'Chủ sân', { auth: true, params: maDatSan }),
    },
    '/api/chu-san/dat-san/{maDatSan}/xac-nhan-thanh-toan': {
      post: endpoint('Chủ sân xác nhận đã nhận tiền → đơn thành công (confirmed)', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/dat-san/{maDatSan}/tu-choi-thanh-toan': {
      post: endpoint('Chủ sân từ chối ảnh chuyển khoản (kèm lý do bắt buộc, ghi nhật ký) → thanh toán về pending, giữ chỗ hold_minutes, khách gửi lại; ảnh cũ chuyển rejected, không xoá', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        body: 'TuChoiThanhToan',
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/dat-san/{maDatSan}/da-thu': {
      patch: endpoint('Đánh dấu đã thu tiền ngoài hệ thống cho đơn do chủ sân tạo (?tatCaBuoi=true: cả lịch cố định)', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        query: [thamSoTruyVan('tatCaBuoi', 'true = đánh dấu mọi buổi chưa thu của lịch cố định (mặc định 1 buổi)')],
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/dat-san/{maDatSan}/huy': {
      patch: endpoint('Chủ sân huỷ đơn do mình tạo (không hoàn tiền, giải phóng lịch; ?tatCaBuoi=true: cả lịch cố định). Đơn app → 409', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        query: [thamSoTruyVan('tatCaBuoi', 'true = huỷ mọi buổi chưa chơi của lịch cố định (mặc định 1 buổi)')],
        responses: { 404: response.Loi, 409: response.Loi },
      }),
      post: endpoint('Chủ sân huỷ đơn đã đặt (kèm lý do) → khách được hoàn 100%, vào hàng đợi hoàn tiền', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        body: 'HuyDonChuSan',
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/san/{maSan}/qr-check-in': {
      get: endpoint('G3 – Xem QR check-in hiện tại của sân (tạo lười lần đầu): maSan, tenSan, tenCoSo, phienBan, noiDungQr, anhQr (data URL PNG), lichSu[]',
        'Chủ sân', { auth: true, params: maSan, responses: { 404: response.Loi } }),
    },
    '/api/chu-san/san/{maSan}/qr-check-in/doi': {
      post: endpoint('G3 – Đổi QR check-in: token mới, phiên bản + 1, QR cũ mất hiệu lực ngay; ghi LichSuQrSan + nhật ký',
        'Chủ sân', { auth: true, params: maSan, responses: { 404: response.Loi } }),
    },
    '/api/chu-san/san/{maSan}/qr-check-in/anh.png': {
      get: endpoint('G3 – Tải ảnh PNG QR độ phân giải cao (trả thẳng image/png, không bọc envelope)',
        'Chủ sân', { auth: true, params: maSan, responses: { 404: response.Loi } }),
    },
    '/api/chu-san/san/{maSan}/qr-check-in/in': {
      get: endpoint('G3 – Trang HTML để in (khoGiay=A4|A5, mặc định A4): tên cơ sở + tên sân + QR + hướng dẫn (trả thẳng text/html)',
        'Chủ sân', { auth: true, params: maSan, query: [thamSoTruyVan('khoGiay', 'A4 | A5')], responses: { 404: response.Loi } }),
    },
    '/api/chu-san/dat-san/{maDatSan}/check-in-thu-cong': {
      post: endpoint('G3 – Chủ sân check-in thủ công (QR lỗi/mất mạng/hết pin; tìm đơn bằng GET /chu-san/dat-san?tuKhoa=mã đơn hoặc SĐT). '
        + 'Chỉ đơn thuộc cơ sở của mình; từ checkin_open_minutes trước giờ chơi đến hết giờ chơi; ghi người + lý do. Khách không gọi được.',
        'Chủ sân', { auth: true, params: maDatSan, body: 'CheckInThuCong', responses: { 404: response.Loi, 409: response.Loi } }),
    },
    '/api/chu-san/hoan-tien': {
      get: endpoint('Yêu cầu hoàn tiền của khách huỷ đơn (chủ sân tự chuyển khoản)', 'Chủ sân', {
        auth: true,
        query: [thamSoTruyVan('trangThai', 'processing (chờ hoàn, gồm not_received/escalated; mặc định) | refunded (đã hoàn, gồm received). Mỗi dòng có maHoanTien, trangThaiHoanTien chi tiết, hanHoan, quaHan, anhChungTuUrl')],
      }),
    },
    '/api/chu-san/hoan-tien/{maThanhToan}/hoan-thanh': {
      post: {
        ...endpoint('G4 – Chủ sân bấm đã hoàn: bắt buộc ẢNH chứng từ chuyển khoản (multipart field anhChungTu), không còn mã giao dịch. Khoản → refunded, khách được báo để xác nhận Đã nhận / Chưa nhận',
          'Chủ sân', { auth: true, params: maThanhToan, responses: { 404: response.Loi, 409: response.Loi } }),
        requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['anhChungTu'],
              properties: { anhChungTu: { type: 'string', format: 'binary', description: 'Ảnh chuyển khoản hoàn (JPG/PNG/WEBP ≤5MB), BẮT BUỘC' } },
            },
          },
        },
      },
      },
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
      get: endpoint('Xem công nợ khách đặt tại sân (đơn chủ sân tạo, chưa thu)', 'Chủ sân', {
        auth: true,
        query: [thamSoTruyVan('maCoSo', 'Chỉ 1 cơ sở của tôi')],
      }),
    },
    '/api/quan-tri/san/{maSan}/dong': {
      patch: endpoint('Đóng tạm sân (cùng điều kiện với chủ sân)', 'Quản trị', { auth: true, params: maSan, body: 'LyDoDongXoa' }),
    },
    '/api/quan-tri/san/{maSan}/mo': {
      patch: endpoint('Mở lại sân', 'Quản trị', { auth: true, params: maSan }),
    },
    '/api/quan-tri/san/{maSan}': {
      delete: endpoint('Xoá sân (phải đóng trước)', 'Quản trị', { auth: true, params: maSan, body: 'LyDoDongXoa' }),
    },
    '/api/quan-tri/co-so/{maCoSo}/dong': {
      patch: endpoint('Đóng tạm cơ sở', 'Quản trị', { auth: true, params: maCoSo, body: 'LyDoDongXoa' }),
    },
    '/api/quan-tri/co-so/{maCoSo}/mo': {
      patch: endpoint('Mở lại cơ sở', 'Quản trị', { auth: true, params: maCoSo }),
    },
    '/api/quan-tri/co-so/{maCoSo}': {
      delete: endpoint('Xoá cơ sở (phải đóng trước)', 'Quản trị', { auth: true, params: maCoSo, body: 'LyDoDongXoa' }),
    },
    '/api/quan-tri/nguoi-dung': {
      get: endpoint('Admin liệt kê tài khoản khách hàng hoặc chủ sân (kèm lý do khóa, số đơn / số cơ sở)', 'Quản trị', {
        auth: true,
        query: [
          thamSoTruyVan('vaiTro', 'customer | owner', true),
          thamSoTruyVan('trangThai', 'active | locked | all (mặc định all)'),
          thamSoTruyVan('tuKhoa', 'Tìm theo họ tên, email hoặc số điện thoại'),
          thamSoTruyVan('trang', 'Trang, từ 1 (mặc định 1)'),
          thamSoTruyVan('soLuong', 'Số dòng mỗi trang, 1–50 (mặc định 20)'),
        ],
      }),
    },
    '/api/quan-tri/nguoi-dung/{maNguoiDung}/khoa': {
      patch: endpoint(
        'Admin khóa tài khoản khách / chủ sân (bắt buộc lyDo 3–255 ký tự; chủ sân bị khóa thì cơ sở đang hoạt động cũng bị khóa). Khi đăng nhập, người dùng nhận thông báo kèm lý do này',
        'Quản trị', {
          auth: true,
          params: maNguoiDung,
          body: 'KhoaTaiKhoan',
          responses: { 404: response.Loi, 409: response.Loi },
        }),
    },
    '/api/quan-tri/nguoi-dung/{maNguoiDung}/mo-khoa': {
      patch: endpoint('Admin mở khóa tài khoản khách / chủ sân', 'Quản trị', {
        auth: true,
        params: maNguoiDung,
        responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/co-so': {
      get: endpoint('Admin liệt kê cơ sở kèm điểm trung bình, số đánh giá hiển thị và số đánh giá đã xóa', 'Quản trị', {
        auth: true,
        query: [thamSoTruyVan('tuKhoa', 'Tìm theo tên cơ sở hoặc tên chủ sân')],
      }),
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
      get: endpoint('Admin: đơn khách đã gửi ảnh chuyển khoản, đang đợi xác nhận. G2: kèm hanXacNhan, conLaiXacNhanGiay, quaHan, chungTu[] (nhiều ảnh), canhBaoTrungAnh[]; '
        + 'query quaHan=true|false để lọc; quá hạn lên đầu, KHÔNG tự nhả slot', 'Quản trị', {
        auth: true,
        query: [thamSoTruyVan('quaHan', 'true = chỉ đơn quá hạn xác nhận | false = chỉ đơn còn trong hạn | bỏ trống = tất cả')],
      }),
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
      patch: {
        ...endpoint('G4 – Admin ghi nhận đã hoàn: BẮT BUỘC ảnh chứng từ (multipart field anhChungTu); thiếu ảnh → 400', 'Quản trị',
          { auth: true, params: maThanhToan, responses: { 404: response.Loi, 409: response.Loi } }),
        requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['anhChungTu'],
              properties: { anhChungTu: { type: 'string', format: 'binary', description: 'Ảnh chuyển khoản hoàn (JPG/PNG/WEBP ≤5MB), BẮT BUỘC' } },
            },
          },
        },
      },
      },
    },
    '/api/quan-tri/khieu-nai': {
      get: endpoint('Admin đọc danh sách khiếu nại chủ sân (mặc định chờ xử lý, cũ nhất trước)', 'Quản trị', {
        auth: true,
        query: [
          thamSoTruyVan('trangThai', 'pending | upheld | rejected | all (mặc định pending)'),
          thamSoTruyVan('gioiHan', 'Số dòng tối đa (1–100)'),
        ],
      }),
    },
    '/api/quan-tri/khieu-nai/{maKhieuNai}/xu-ly': {
      patch: endpoint(
        'Admin xử lý khiếu nại: upheld → cộng 1 lần vi phạm (1 cảnh cáo, 2 cảnh cáo nghiêm trọng, 3 khóa tài khoản chủ sân); rejected → bác bỏ (cần ghiChu)',
        'Quản trị',
        {
          auth: true,
          params: [thamSoDuongDan('maKhieuNai')],
          body: 'XuLyKhieuNai',
          responses: { 404: response.Loi, 409: response.Loi },
        }),
    },
    '/api/quan-tri/danh-gia': {
      get: endpoint('Admin xem đánh giá (mặc định tất cả) kèm tên cơ sở, tên chủ sân, tên khách', 'Đánh giá', {
        auth: true,
        query: [
          thamSoTruyVan('trangThai', 'hien | an | all (mặc định all)'),
          thamSoTruyVan('maCoSo', 'Lọc theo cơ sở'),
          thamSoTruyVan('soSao', 'Lọc theo số sao 1–5'),
          thamSoTruyVan('trang', 'Trang, từ 1 (mặc định 1)'),
          thamSoTruyVan('soLuong', 'Số dòng mỗi trang, 1–50 (mặc định 20)'),
        ],
      }),
    },
    '/api/quan-tri/danh-gia/{maDanhGia}/an': {
      patch: endpoint(
        'Admin ẩn (an=true, bắt buộc lyDo 3–255 ký tự) hoặc hiện lại (an=false) đánh giá; tính lại điểm cơ sở (chỉ đánh giá hiển thị), ghi nhật ký an_danh_gia / hien_danh_gia, báo khách và chủ sân',
        'Đánh giá', {
          auth: true,
          params: maDanhGia,
          body: 'AnHienDanhGia',
          responses: { 404: response.Loi, 409: response.Loi },
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
      DangKyChuSan: {
        type: 'object',
        required: ['hoTen', 'email', 'soDienThoai', 'tenDoanhNghiep', 'maNganHang', 'soTaiKhoan', 'matKhau', 'xacNhanMatKhau'],
        properties: {
          hoTen: { type: 'string', minLength: 2, maxLength: 100, example: 'Nguyen Van A' },
          email: { type: 'string', format: 'email', example: 'chusan@example.com' },
          soDienThoai: { type: 'string', pattern: '^0[35789][0-9]{8}$', example: '0901234567' },
          tenDoanhNghiep: { type: 'string', minLength: 2, maxLength: 150, example: 'Công ty TNHH Thể thao ABC' },
          maNganHang: { type: 'string', description: 'Mã ngân hàng lấy từ GET /api/tai-khoan/ngan-hang (BE tự điền tên ngân hàng)', example: 'MB' },
          soTaiKhoan: { type: 'string', pattern: '^[0-9]{6,20}$', example: '0123456789' },
          matKhau: { type: 'string', format: 'password', minLength: 8, maxLength: 72, example: 'MatKhau123' },
          xacNhanMatKhau: { type: 'string', format: 'password', description: 'Phải trùng matKhau', example: 'MatKhau123' },
        },
      },
      DoanhNghiep: {
        type: 'object',
        required: ['tenDoanhNghiep'],
        properties: { tenDoanhNghiep: { type: 'string', minLength: 2, maxLength: 150 } },
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
      DatNhieuSan: {
        type: 'object',
        required: ['maCoSo', 'ngay', 'tenKhach', 'soDienThoai', 'cacMuc'],
        properties: {
          maCoSo: { type: 'integer', example: 12 },
          ngay: { type: 'string', format: 'date', example: '2026-11-28' },
          tenKhach: { type: 'string', example: 'Nguyen Van A' },
          soDienThoai: { type: 'string', example: '0901234567' },
          ghiChu: { type: 'string' },
          cacMuc: {
            type: 'array',
            minItems: 1,
            description: 'Mỗi mục là một khoảng giờ của một sân (mốc 30 phút). Không giới hạn số mục.',
            items: {
              type: 'object',
              required: ['maSan', 'gioBatDau', 'gioKetThuc'],
              properties: {
                maSan: { type: 'integer', example: 31 },
                gioBatDau: { type: 'string', example: '18:00' },
                gioKetThuc: { type: 'string', example: '20:00' },
              },
            },
          },
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
      KhieuNaiMoi: {
        type: 'object',
        required: ['noiDung'],
        properties: {
          noiDung: { type: 'string', minLength: 10, maxLength: 1000 },
          giaiDoan: { type: 'string', enum: ['at_cancel', 'after_cancel'], description: 'at_cancel: bấm ngay sau khi hủy' },
        },
      },
      XuLyKhieuNai: {
        type: 'object',
        required: ['quyetDinh'],
        properties: {
          quyetDinh: { type: 'string', enum: ['upheld', 'rejected'] },
          ghiChu: { type: 'string', minLength: 3, maxLength: 500, description: 'Bắt buộc khi rejected' },
        },
      },
      DanhGiaMoi: {
        type: 'object',
        required: ['soSao'],
        properties: {
          soSao: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
          noiDung: { type: 'string', maxLength: 1000, description: 'Không bắt buộc', example: 'Sân đẹp, đèn sáng, chủ sân nhiệt tình.' },
        },
      },
      SuaDanhGia: {
        type: 'object',
        minProperties: 1,
        properties: {
          soSao: { type: 'integer', minimum: 1, maximum: 5, example: 4 },
          noiDung: { type: 'string', maxLength: 1000, description: 'Chuỗi rỗng = xoá bình luận' },
        },
      },
      PhanHoiDanhGia: {
        type: 'object',
        required: ['noiDung'],
        properties: {
          noiDung: { type: 'string', minLength: 2, maxLength: 1000, description: 'Đã trim', example: 'Cảm ơn bạn đã ủng hộ sân!' },
        },
      },
      KhoaTaiKhoan: {
        type: 'object',
        required: ['lyDo'],
        properties: {
          lyDo: { type: 'string', minLength: 3, maxLength: 255, description: 'Hiện cho người dùng khi đăng nhập', example: 'không tuân thủ quy định của hệ thống' },
        },
      },
      AnHienDanhGia: {
        type: 'object',
        required: ['an'],
        properties: {
          an: { type: 'boolean', description: 'true = ẩn · false = hiện lại' },
          lyDo: { type: 'string', minLength: 3, maxLength: 255, description: 'Bắt buộc khi an=true', example: 'Ngôn từ xúc phạm' },
        },
      },
      DanhGiaChiTiet: {
        type: 'object',
        properties: {
          maDanhGia: { type: 'integer' },
          maDatSan: { type: 'integer' },
          maDon: { type: 'string' },
          maCoSo: { type: 'integer' },
          tenCoSo: { type: 'string' },
          tenKhach: { type: 'string' },
          tenChuSan: { type: 'string', description: 'Chỉ có ở API admin' },
          soSao: { type: 'integer', minimum: 1, maximum: 5 },
          noiDung: { type: 'string', nullable: true },
          ngayTao: { type: 'string' },
          phanHoiChuSan: { type: 'string', nullable: true },
          ngayPhanHoi: { type: 'string', nullable: true },
          biAn: { type: 'boolean' },
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
          linkBanDo: {
            type: 'string', format: 'uri',
            description: 'Link Google Maps (kể cả maps.app.goo.gl). Backend tự đọc vĩ độ/kinh độ từ link này để tính "sân gần tôi"; không gửi viDo/kinhDo.',
            example: 'https://maps.app.goo.gl/AbCdEf123',
          },
          moTa: { type: 'string' },
          gioMoCua: { type: 'string', example: '06:00' },
          gioDongCua: { type: 'string', example: '22:00' },
          soPhutDatToiThieu: { type: 'integer', example: 60 },
          soPhutTreToiDa: {
            type: 'integer', enum: [15, 20, 30], example: 15,
            description: 'Số phút khách được đến trễ tối đa (không bắt buộc; không gửi thì giữ giá trị hiện có, cơ sở mới mặc định 15).',
          },
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
      KhungGia: {
        type: 'object',
        required: [
          'gioBatDau', 'gioKetThuc', 'giaNgayThuongKhachVangLai',
          'giaNgayThuongKhachCoDinh', 'giaCuoiTuanKhachVangLai', 'giaCuoiTuanKhachCoDinh',
        ],
        properties: {
          gioBatDau: { type: 'string', example: '18:00' },
          gioKetThuc: { type: 'string', example: '21:00' },
          giaNgayThuongKhachVangLai: { type: 'integer', example: 120000 },
          giaNgayThuongKhachCoDinh: { type: 'integer', example: 100000 },
          giaCuoiTuanKhachVangLai: { type: 'integer', example: 140000 },
          giaCuoiTuanKhachCoDinh: { type: 'integer', example: 120000 },
        },
      },
      DoiNganHang: {
        type: 'object',
        required: ['maNganHang', 'soTaiKhoan', 'chuTaiKhoan'],
        properties: {
          maNganHang: { type: 'string', description: 'Mã từ GET /api/tai-khoan/ngan-hang (BE tự điền tên)', example: 'MB' },
          soTaiKhoan: { type: 'string', example: '0123456789' },
          chuTaiKhoan: { type: 'string', example: 'NGUYEN VAN A' },
        },
      },
      LyDoDongXoa: {
        type: 'object',
        properties: { lyDo: { type: 'string', maxLength: 255, description: 'Tuỳ chọn, ghi vào nhật ký' } },
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
          maCoSo: { type: 'integer', description: 'Cơ sở thêm sân vào; bỏ trống = cơ sở đầu tiên' },
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
        required: ['maSan'],
        properties: {
          maSan: { type: 'integer' },
          thoiGianBatDau: { type: 'string', example: '2026-11-15 12:00', description: 'Dạng cũ (1 ngày): dùng cặp này HOẶC cặp tuNgay/gioBatDau' },
          thoiGianKetThuc: { type: 'string', example: '2026-11-15 14:00', description: 'Dạng cũ (1 ngày), cùng ngày với thoiGianBatDau' },
          tuNgay: { type: 'string', example: '2026-11-15', description: 'Dạng khoảng ngày: ngày bắt đầu (YYYY-MM-DD)' },
          denNgay: { type: 'string', example: '2026-11-20', description: 'Ngày kết thúc (gồm cả ngày này); bỏ trống = chỉ tuNgay. Tối đa 90 ngày' },
          gioBatDau: { type: 'string', example: '08:00', description: 'Giờ bắt đầu mỗi ngày (HH:MM)' },
          gioKetThuc: { type: 'string', example: '10:00', description: 'Giờ kết thúc mỗi ngày (HH:MM)' },
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
      CheckInQr: {
        type: 'object',
        required: ['maSan', 'token', 'phienBan'],
        properties: {
          maSan: { type: 'integer', example: 3 },
          token: { type: 'string', description: 'token trong QR (64 ký tự hex)' },
          phienBan: { type: 'integer', example: 1 },
          quetLuc: { type: 'string', description: 'giờ thiết bị lúc quét (ISO) – backend bỏ qua khi quyết định' },
          viDo: { type: 'number', description: 'tuỳ chọn' },
          kinhDo: { type: 'number', description: 'tuỳ chọn' },
        },
      },
      CheckInThuCong: {
        type: 'object',
        required: ['lyDo'],
        properties: { lyDo: { type: 'string', minLength: 2, maxLength: 255, example: 'Khách hết pin điện thoại' } },
      },
      HuyDonChuSan: {
        type: 'object',
        required: ['lyDo'],
        properties: { lyDo: { type: 'string', minLength: 2, maxLength: 255, example: 'Sân đóng để bảo trì sàn' } },
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
