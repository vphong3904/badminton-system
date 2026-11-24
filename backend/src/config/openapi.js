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
      'Realtime (Socket.IO, G8.0): kết nối tới cùng cổng với REST, đường dẫn `/socket.io`, bắt tay `auth: { token: <JWT> }`. Server tự cho vào room `user:{id}` (và `admin` nếu là quản trị). Client gửi `lich:theo-doi` / `lich:bo-theo-doi` `{maCoSo, ngay}` (ack `{ok}`), server phát `lich-san:doi`, `thong-bao:moi`, `dat-san:cap-nhat`, `chat:*`… (xem docs/agent/features/community/README.md mục 5A). Socket chỉ là tín hiệu; nguồn sự thật là REST.',
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
    { name: 'Sự kiện', description: 'Chủ sân tạo/quản lý sự kiện; khách xem, đăng ký và thanh toán phí sự kiện' },
    { name: 'Cộng đồng', description: 'Báo cáo bài tìm người chơi/đội nhóm và quản trị nội dung cộng đồng' },
    { name: 'Chủ sân' },
    { name: 'Quản trị' },
  ],
  paths: {
    '/api/suc-khoe': {
      get: endpoint('Kiểm tra API đang hoạt động', 'Sức khỏe'),
    },
    '/api/gio-may-chu': {
      get: endpoint('Giờ máy chủ theo NOW() của MySQL (+07:00): {iso, epochMs, mui, ngay, gio}. Công khai; FE chỉ dùng để hiển thị/đếm ngược', 'Sức khỏe'),
    },
    '/api/suc-khoe/co-so-du-lieu': {
      get: endpoint('Kiểm tra kết nối db_sancaulong', 'Sức khỏe'),
    },
    '/api/khach/chat/{maPhong}/tin-nhan': {
      get: endpoint('Lấy lịch sử chat (tối đa 50 tin; dùng truocMaTin hoặc sauMaTin)', 'Cộng đồng · Chat', {
        auth: true, params: [thamSoDuongDan('maPhong')],
        query: [
          thamSoTruyVan('truocMaTin', 'Lấy 50 tin có mã nhỏ hơn cursor.'),
          thamSoTruyVan('sauMaTin', 'Lấy 50 tin có mã lớn hơn cursor để bù sau reconnect.'),
        ],
      }),
      post: endpoint('Gửi tin nhắn qua REST dự phòng (1–1000 ký tự)', 'Cộng đồng · Chat', {
        auth: true, params: [thamSoDuongDan('maPhong')], body: 'TinNhanCongDong',
        responses: { 201: response.ThanhCong, 429: response.Loi },
      }),
    },
    '/api/khach/chat/{maPhong}/thanh-vien': {
      get: endpoint('Danh sách thành viên đang hoạt động của phòng chat', 'Cộng đồng · Chat', {
        auth: true, params: [thamSoDuongDan('maPhong')],
      }),
    },
    '/api/khach/bao-cao': {
      post: endpoint('Báo cáo sự kiện, bài tìm người chơi hoặc đội nhóm (mỗi người một lần/đối tượng)', 'Cộng đồng', { auth: true, body: 'BaoCaoCongDong', responses: { 201: response.ThanhCong, 409: response.Loi } }),
    },
    '/api/quan-tri/cong-dong/bao-cao': {
      get: endpoint('Hàng đợi báo cáo bài tìm người chơi/đội nhóm', 'Quản trị', { auth: true, query: [thamSoTruyVan('trangThai','pending|upheld|rejected|all'), thamSoTruyVan('loaiDoiTuong','player_post|team'), thamSoTruyVan('trang','Trang từ 1'), thamSoTruyVan('soLuong','1–50')] }),
    },
    '/api/quan-tri/cong-dong/bao-cao/{maBaoCao}/xu-ly': {
      patch: endpoint('Admin chấp nhận (ẩn/xóa) hoặc bác báo cáo cộng đồng; bắt buộc lý do', 'Quản trị', { auth: true, params: [thamSoDuongDan('maBaoCao')], body: 'XuLyBaoCaoCongDong' }),
    },
    '/api/quan-tri/cong-dong/bai': { get: endpoint('Admin liệt kê bài tìm người chơi, gồm nội dung ẩn/gỡ', 'Quản trị', { auth: true }) },
    '/api/quan-tri/cong-dong/bai/{maDoiTuong}/an': { patch: endpoint('Admin ẩn bài tìm người chơi (bắt buộc lý do)', 'Quản trị', { auth: true, params: [thamSoDuongDan('maDoiTuong')], body: 'LyDoCongDong' }) },
    '/api/quan-tri/cong-dong/bai/{maDoiTuong}/bo-an': { patch: endpoint('Admin bỏ ẩn bài tìm người chơi', 'Quản trị', { auth: true, params: [thamSoDuongDan('maDoiTuong')] }) },
    '/api/quan-tri/cong-dong/bai/{maDoiTuong}': { delete: endpoint('Admin xóa mềm bài tìm người chơi (bắt buộc lý do)', 'Quản trị', { auth: true, params: [thamSoDuongDan('maDoiTuong')], body: 'LyDoCongDong' }) },
    '/api/quan-tri/cong-dong/doi-nhom': { get: endpoint('Admin liệt kê đội nhóm, gồm nội dung ẩn/gỡ', 'Quản trị', { auth: true }) },
    '/api/quan-tri/cong-dong/doi-nhom/{maDoiTuong}/an': { patch: endpoint('Admin ẩn đội nhóm (bắt buộc lý do)', 'Quản trị', { auth: true, params: [thamSoDuongDan('maDoiTuong')], body: 'LyDoCongDong' }) },
    '/api/quan-tri/cong-dong/doi-nhom/{maDoiTuong}/bo-an': { patch: endpoint('Admin bỏ ẩn đội nhóm', 'Quản trị', { auth: true, params: [thamSoDuongDan('maDoiTuong')] }) },
    '/api/quan-tri/cong-dong/doi-nhom/{maDoiTuong}': { delete: endpoint('Admin xóa mềm đội nhóm (bắt buộc lý do)', 'Quản trị', { auth: true, params: [thamSoDuongDan('maDoiTuong')], body: 'LyDoCongDong' }) },
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
      get: endpoint('Xem lịch các sân của cơ sở trong một ngày (khung đã đặt/bị khóa, bảng giá, `soPhutDatToiThieu`, `soPhutTreToiDa`); sân đã đóng hiện kèm `tamDong:true` và `cacKhungBan:[]` (G9.B2)', 'Khách hàng', {
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
      get: endpoint('Xem chi tiết sân và bảng giá (có `soPhutDatToiThieu` và `soPhutTreToiDa` của cơ sở); sân đã đóng trả 200 kèm `tamDong:true` thay vì 404 (G9.B2)', 'Khách hàng', { params: maSan }),
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
      get: endpoint('Xem lịch sử đặt sân. G9 thêm: maSanCu, tenSanCu, ngayChuyenSan, daChuyenSan, coTheTuChoiChuyenSan (nút "Từ chối chuyển sân" ở thẻ đơn; BE tính, 409 vẫn có thể xảy ra khi dữ liệu đổi); '
        + 'loaiHoanTien (cancel|owner_cancel|closure|incident|overpay|late_proof|null), hanHoanPhut (số phút của hạn hoàn: cancel/overpay 4320, owner_cancel/closure/incident 30, '
        + 'đã được Admin chấp nhận khiếu nại hoàn tiền thì refund_grace_hours×60; null khi không có khoản hoàn hoặc late_proof) và hanHoanChu ("3 ngày"/"30 phút"); '
        + 'datGap (bool) + soPhutXacNhan (15|30; null khi đơn không còn chờ trả/chờ duyệt)', 'Khách hàng', { auth: true }),
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
        + 'G2: đã gửi ảnh thì hetHanGiuCho/conLaiGiay = null, thêm hanXacNhan, conLaiXacNhanGiay, chungTu[] (các ảnh đã gửi, không có cảnh báo trùng ảnh), soAnhToiDa; '
        + 'G9: datGap + soPhutXacNhan (15|30) do BE tính — chưa gửi ảnh: nếu gửi ngay bây giờ; đã gửi: theo lúc gửi ảnh đầu tiên của lượt chờ duyệt)', 'Khách hàng', { auth: true, params: maDatSan }),
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
        + 'dưới 12h không hoàn; có hoàn thì BẮT BUỘC body {taiKhoanHoan:{maNganHang, soTaiKhoan, chuTaiKhoan}} (thiếu → 400), tạo yêu cầu hoàn tiền cho chủ sân và gửi thông báo',
        'Khách hàng',
        { auth: true, params: maDatSan }),
    },
    '/api/khach/dat-san/{maDatSan}/tu-choi-chuyen-san': {
      post: endpoint(
        'Từ chối việc chủ sân chuyển sân (G9.E6): huỷ các buổi ĐÃ BỊ CHUYỂN SÂN (MaSanCu khác NULL), còn hiệu lực, chưa tới giờ chơi của đợt chứa đơn, '
        + 'hoàn 100% NGAY (HoanTien.Loai=closure, hạn 30 phút), không áp chính sách 24h/12h, không bắt nhập tài khoản nhận hoàn. '
        + 'Lỗi 409: BOOKING_NOT_MOVED, BOOKING_STARTED, PAYMENT_CONFIRMING, REFUND_PENDING, PARTIAL_CANCEL_UNPAID',
        'Khách hàng',
        { auth: true, params: maDatSan, responses: { 409: response.Loi } }),
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
        'Khách khiếu nại chủ sân CHẬM DUYỆT thanh toán (chỉ khi đã gửi ảnh chuyển khoản mà chủ sân chưa duyệt và đã quá hạn xác nhận thật `ThanhToan.HanXacNhan` (G9.C8); mỗi đơn 1 lần; trả 201). Đơn đã duyệt không khiếu nại được',
        'Khách hàng',
        { auth: true, params: maDatSan, body: 'KhieuNaiMoi', responses: { 404: response.Loi, 409: response.Loi } }),
    },
    '/api/khach/hoan-tien/{maHoanTien}/khieu-nai': {
      post: endpoint(
        'Khách báo CHƯA NHẬN ĐƯỢC TIỀN HOÀN (khiếu nại gửi chủ sân + Admin). Chỉ khi khoản hoàn đã quá hạn thật `HoanTien.HanHoan` (G9.C8: huỷ bởi khách 3 ngày; chủ sân huỷ/đóng sân/sự cố 30 phút) mà chủ sân chưa chuyển hoàn. '
        + 'Body {lyDo 10–800}. Trả 201 {maKhieuNai, maKhieuNaiHienThi, trangThai}. 400 chưa quá HanHoan (hoặc khoản hoàn chưa có hạn); 409 đã khiếu nại / khoản hoàn đã chuyển',
        'Khách hàng', { auth: true, params: [thamSoDuongDan('maHoanTien')], responses: { 404: response.Loi, 409: response.Loi } }),
    },
    '/api/khach/bao-cao': {
      post: endpoint('Khách báo cáo vi phạm một sự kiện; mỗi khách chỉ báo cáo một lần cho mỗi sự kiện; trả 201', 'Khách hàng', {
        auth: true, body: 'BaoCaoSuKien', responses: { 404: response.Loi, 409: response.Loi },
      }),
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
      patch: endpoint('Đóng tạm cơ sở (409 HAS_ACTIVE_BOOKINGS nếu còn khách/lịch cố định; HAS_ACTIVE_EVENTS nếu còn sự kiện sắp diễn ra)', 'Chủ sân', { auth: true, params: maCoSo, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
    },
    '/api/chu-san/co-so/{maCoSo}/mo': {
      patch: endpoint('Mở lại cơ sở đã đóng', 'Chủ sân', { auth: true, params: maCoSo }),
    },
    '/api/chu-san/san/{maSan}/dong': {
      patch: endpoint('Đóng tạm sân (409 HAS_ACTIVE_BOOKINGS nếu còn khách/lịch cố định; HAS_ACTIVE_EVENTS nếu còn sự kiện sắp diễn ra)', 'Chủ sân', { auth: true, params: maSan, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
    },
    '/api/chu-san/san/{maSan}/mo': {
      patch: endpoint('Bật sân (chưa hoạt động/đã đóng → active); 409 NO_PRICE_TABLE nếu cơ sở chưa có bảng giá; sân đầu tiên được bật thì cơ sở tự hiện cho khách', 'Chủ sân', { auth: true, params: maSan, responses: { 409: response.Loi } }),
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
      delete: endpoint('Xoá cơ sở (phải đóng trước; 409 HAS_ACTIVE_EVENTS nếu còn sự kiện sắp diễn ra)', 'Chủ sân', { auth: true, params: maCoSo, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
    },
    '/api/chu-san/co-so/{maCoSo}/bang-gia': {
      get: endpoint('Xem bảng giá của 1 cơ sở (trang quản lý bảng giá: chọn cơ sở ở dropdown)', 'Chủ sân', { auth: true, params: maCoSo }),
      post: endpoint('Thêm MỘT khung giá tuỳ chỉnh vào cơ sở (400 nếu ngoài giờ mở cửa hoặc chồng khung cũ)', 'Chủ sân', { auth: true, params: maCoSo, body: 'KhungGia' }),
      put: endpoint('Cập nhật bảng giá của 1 cơ sở', 'Chủ sân', { auth: true, params: maCoSo, body: 'BangGia' }),
    },
    '/api/chu-san/co-so/{maCoSo}/anh': {
      get: endpoint('Thư viện ảnh của cơ sở: cacAnh[{maAnh, duongDan, laAnhBia}] (ảnh bìa đầu tiên), soAnhToiDa', 'Chủ sân', { auth: true, params: maCoSo }),
      post: endpoint('Đổi ảnh bìa của cơ sở (ảnh cũ giữ lại trong thư viện)', 'Chủ sân', { auth: true, params: maCoSo, upload: true }),
    },
    '/api/chu-san/co-so/{maCoSo}/anh-san': {
      post: endpoint('Thêm 1 hoặc nhiều ảnh sân (multipart, field tepAnh lặp lại; không đổi ảnh bìa; tổng tối đa 12 ảnh/cơ sở, vượt thì từ chối cả lô). Trả thư viện ảnh mới', 'Chủ sân', { auth: true, params: maCoSo, upload: true }),
    },
    '/api/chu-san/co-so/{maCoSo}/anh/{maAnh}/bia': {
      patch: endpoint('Đặt 1 ảnh trong thư viện làm ảnh bìa', 'Chủ sân', { auth: true }),
    },
    '/api/chu-san/co-so/{maCoSo}/anh/{maAnh}': {
      delete: endpoint('Xoá 1 ảnh khỏi thư viện (xoá ảnh bìa thì ảnh đầu tiên còn lại thành ảnh bìa)', 'Chủ sân', { auth: true }),
    },
    '/api/chu-san/san': {
      get: endpoint('Liệt kê sân của mọi cơ sở (lọc ?maCoSo)', 'Chủ sân', {
        auth: true,
        query: [thamSoTruyVan('maCoSo', 'Chỉ sân của cơ sở này')],
      }),
      post: endpoint('Tạo sân (luôn ở trạng thái chưa hoạt động `maintenance`; chủ sân phải bật bằng PATCH /san/{maSan}/mo)', 'Chủ sân', { auth: true, body: 'TaoSan' }),
    },
    '/api/chu-san/san/{maSan}': {
      patch: endpoint('Cập nhật sân; chuyển sang maintenance bị chặn 409 HAS_ACTIVE_EVENTS nếu sân còn sự kiện sắp diễn ra', 'Chủ sân', { auth: true, params: maSan, body: 'CapNhatSan', responses: { 409: response.Loi } }),
      delete: endpoint('Xoá MỀM sân (G9.F3: DaXoa=1, vẫn giữ đơn/báo cáo cũ; sân đã từng có đơn xoá được; phải đóng trước; 409 HAS_ACTIVE_BOOKINGS / HAS_ACTIVE_EVENTS nếu còn đơn, lịch cố định hoặc sự kiện sắp diễn ra; sân đã xoá → 404; tên sân được dùng lại)', 'Chủ sân', { auth: true, params: maSan, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
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
      post: endpoint('Khóa khung giờ sân (1 ngày hoặc khoảng ngày). Không còn 409 CONFLICT: mặc định chỉ khoá phần trống (cắt quanh đơn/khóa sẵn có) và trả `cacDonVuong`; kèm `xuLyDonVuong` để chuyển sân/huỷ đơn vướng cùng giao dịch (G9.E3). Nhánh `huy` (G9.E5): chỉ khi không còn sân để chuyển, lý do bắt buộc, hoàn 100% (HoanTien.Loai=closure, hạn 30 phút) gom 1 khoản/đợt thanh toán; trả `cacDonDaHuy` + `tongTienHoan`. Lỗi 409: BOOKING_NOT_IN_RANGE, BOOKING_STARTED (đã đến giờ/đã check-in), PAYMENT_CONFIRMING, TARGET_COURT_UNAVAILABLE, REFUND_PENDING (đợt còn khoản hoàn chưa xong), PARTIAL_CANCEL_UNPAID (khách chưa trả, chỉ huỷ trọn đợt)', 'Chủ sân', { auth: true, body: 'KhoaSan', responses: { 409: response.Loi } }),
    },
    '/api/chu-san/khoa-san/xem-truoc': {
      get: endpoint('Xem trước khoá sân (G9.E2): `cacKhungTrong` (khung sẽ được khoá, theo ngày) + `cacDonVuong` (đơn vướng kèm `coTheChuyen`, `coTheHuy`, `cacSanThayThe`). Không ghi gì', 'Chủ sân', {
        auth: true,
        query: [
          thamSoTruyVan('maSan', 'Mã sân (bắt buộc)'),
          thamSoTruyVan('tuNgay', 'Ngày bắt đầu YYYY-MM-DD (bắt buộc)'),
          thamSoTruyVan('denNgay', 'Ngày kết thúc YYYY-MM-DD; bỏ trống = chỉ tuNgay (tối đa 90 ngày)'),
          thamSoTruyVan('gioBatDau', 'Giờ bắt đầu mỗi ngày HH:MM (bắt buộc)'),
          thamSoTruyVan('gioKetThuc', 'Giờ kết thúc mỗi ngày HH:MM (bắt buộc)'),
        ],
        responses: { 404: response.Loi },
      }),
    },
    '/api/chu-san/khoa-san/{maKhoa}': {
      delete: endpoint('Xóa khung giờ khóa sân; khóa do sự kiện trả 409 EVENT_LOCK_PROTECTED', 'Chủ sân', {
        auth: true, params: [thamSoDuongDan('maKhoa')], responses: { 409: response.Loi },
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
          thamSoTruyVan('sapXep', 'moi-nhat (mặc định: ngày chơi mới nhất trước, cũ nhất cuối) | cu-nhat | han-xac-nhan (G2: hàng đợi duyệt thanh toán, sắp hết hạn/quá hạn lên đầu) | thanh-toan-moi-nhat | thanh-toan-cu-nhat (G9.A2: theo giờ thu tiền, đơn chưa có giờ xuống cuối)'),
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
    '/api/chu-san/khieu-nai': {
      get: endpoint('Khiếu nại gửi tới chủ sân (chờ xử lý trước): loai service|refund, hạn phản hồi (hanPhanHoi, quaHanPhanHoi), phanHoiChuSan, thông tin khoản hoàn (soTienHoan, trangThaiHoanTien, anhChungTuHoan)', 'Chủ sân', {
        auth: true, query: [thamSoTruyVan('trangThai', 'pending | upheld | rejected | all (mặc định all)')],
      }),
    },
    '/api/chu-san/khieu-nai/{maKhieuNai}/phan-hoi': {
      post: endpoint('Chủ sân giải trình 1 lần cho khiếu nại đang chờ (body {noiDung 10–1000}); báo Admin và khách. Không thay cho việc chuyển hoàn + ảnh chứng từ', 'Chủ sân', {
        auth: true, params: [thamSoDuongDan('maKhieuNai')], responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/chu-san/khieu-nai/{maKhieuNai}/khang-nghi': {
      post: {
        ...endpoint('Chủ sân kháng nghị 1 lần quyết định chấp nhận khiếu nại, trong appeal_hours (24h, G9.C) kể từ lúc Admin xử lý. G9.C9: multipart — noiDung 10–1000 ký tự + anhBangChung (1–3 ảnh jpg/png/webp ≤5MB, bắt buộc ≥1); gậy → appealed, báo Admin. Trả {maKhangNghi, maKhieuNai, trangThai, bangChung[]}. Lỗi: 400 thiếu/quá số ảnh hoặc APPEAL_EXPIRED, APPEAL_NOT_ALLOWED, APPEAL_ALREADY_SENT (409)', 'Chủ sân', {
          auth: true, params: [thamSoDuongDan('maKhieuNai')], responses: { 404: response.Loi, 409: response.Loi },
        }),
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['noiDung', 'anhBangChung'],
                properties: {
                  noiDung: { type: 'string', minLength: 10, maxLength: 1000 },
                  anhBangChung: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
      },
    },
    '/api/chu-san/dat-san/{maDatSan}/huy': {
      patch: endpoint('Chủ sân huỷ đơn do mình tạo (không hoàn tiền, giải phóng lịch; ?tatCaBuoi=true: cả lịch cố định). Đơn app → 409', 'Chủ sân', {
        auth: true,
        params: maDatSan,
        query: [thamSoTruyVan('tatCaBuoi', 'true = huỷ mọi buổi chưa chơi của lịch cố định (mặc định 1 buổi)')],
        responses: { 404: response.Loi, 409: response.Loi },
      }),
      post: endpoint('Chủ sân huỷ đơn đã đặt (kèm lý do) → khách được hoàn 100%, vào hàng đợi hoàn tiền (hạn 30 phút). G9.D1: body thêm cacBuoi[] (tuỳ chọn) = huỷ MỘT PHẦN các buổi chọn, cùng đợt thanh toán, chưa tới giờ chơi; hoàn = tổng TongTien các buổi chọn (100%, máy chủ tính). Trả thêm huyMotPhan, cacBuoiDaHuy[], soBuoiConLai. 409: PAYMENT_CONFIRMING, REFUND_PENDING, PARTIAL_CANCEL_UNPAID, BUOI_KHONG_HUY_DUOC, BUOI_DA_DEN_GIO; 400 BUOI_KHAC_DOT', 'Chủ sân', {
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
    '/api/chu-san/bao-cao/doanh-thu-theo-san': {
      get: endpoint('Doanh thu từng sân (G9.B1): cùng bộ lọc và quy tắc trừ hoàn như doanh-thu nên Σ các sân = tongCong.doanhThu; gồm sân đã đóng nếu có doanh thu; sắp doanhThu giảm dần', 'Chủ sân', {
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
      patch: endpoint('Đóng tạm sân (cùng điều kiện với chủ sân; 409 HAS_ACTIVE_EVENTS nếu còn sự kiện sắp diễn ra)', 'Quản trị', { auth: true, params: maSan, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
    },
    '/api/quan-tri/san/{maSan}/mo': {
      patch: endpoint('Mở lại sân (409 NO_PRICE_TABLE nếu cơ sở chưa có bảng giá)', 'Quản trị', { auth: true, params: maSan, responses: { 409: response.Loi } }),
    },
    '/api/quan-tri/san/{maSan}': {
      delete: endpoint('Xoá MỀM sân (G9.F3: DaXoa=1, vẫn giữ đơn/báo cáo cũ; sân đã từng có đơn xoá được; phải đóng trước; 409 HAS_ACTIVE_BOOKINGS / HAS_ACTIVE_EVENTS nếu còn đơn, lịch cố định hoặc sự kiện sắp diễn ra; sân đã xoá → 404; tên sân được dùng lại)', 'Quản trị', { auth: true, params: maSan, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
    },
    '/api/quan-tri/co-so/{maCoSo}/dong': {
      patch: endpoint('Đóng tạm cơ sở (409 HAS_ACTIVE_EVENTS nếu còn sự kiện sắp diễn ra)', 'Quản trị', { auth: true, params: maCoSo, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
    },
    '/api/quan-tri/co-so/{maCoSo}/mo': {
      patch: endpoint('Mở lại cơ sở', 'Quản trị', { auth: true, params: maCoSo }),
    },
    '/api/quan-tri/co-so/{maCoSo}/khoa': {
      patch: endpoint('Khóa cơ sở. Hủy các sự kiện open/closed chưa bắt đầu, giải phóng sân, hủy đăng ký; phí đã xác nhận thanh toán chuyển sang chờ chủ sân tự hoàn.', 'Quản trị', {
        auth: true, params: maCoSo, body: 'LyDoKhoaCoSo', responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/co-so/{maCoSo}/mo-khoa': {
      patch: endpoint('Mở khóa cơ sở; cơ sở trở về trạng thái closed, chủ sân cần chủ động mở lại.', 'Quản trị', {
        auth: true, params: maCoSo, responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/co-so/{maCoSo}': {
      delete: endpoint('Xoá cơ sở (phải đóng trước; 409 HAS_ACTIVE_EVENTS nếu còn sự kiện sắp diễn ra)', 'Quản trị', { auth: true, params: maCoSo, body: 'LyDoDongXoa', responses: { 409: response.Loi } }),
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
        'Admin khóa tài khoản khách / chủ sân (bắt buộc lyDo 3–255 ký tự; khóa chủ sân sẽ khóa cơ sở đang hoạt động, hủy sự kiện sắp diễn ra, giải phóng sân và báo người đăng ký). Khi đăng nhập, người dùng nhận thông báo kèm lý do này',
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
    '/api/quan-tri/bao-cao': {
      get: endpoint('Admin xem hàng đợi báo cáo vi phạm sự kiện; mặc định pending, có thông tin sự kiện, người báo cáo và chủ sân', 'Quản trị', {
        auth: true,
        query: [thamSoTruyVan('trangThai', 'pending | upheld | dismissed | all (mặc định pending)'), thamSoTruyVan('trang', 'Trang, mặc định 1'), thamSoTruyVan('soLuong', '1–50, mặc định 20')],
      }),
    },
    '/api/quan-tri/bao-cao/{maBaoCao}/xu-ly': {
      patch: endpoint('Admin quyết định báo cáo sự kiện: upheld/rejected; upheld có thể ẩn/hủy sự kiện và tùy chọn cộng vi phạm chung vào HoSoChuSan.SoLanViPham. Ghi nhật ký', 'Quản trị', {
        auth: true, params: [thamSoDuongDan('maBaoCao')], body: 'XuLyBaoCaoSuKien', responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/su-kien/{maSuKien}/an': {
      patch: endpoint('Admin ẩn sự kiện khỏi danh sách/chi tiết khách; bắt buộc lý do 3–255 ký tự; báo người đã đăng ký và chủ sân; ghi nhật ký an_su_kien', 'Quản trị', {
        auth: true, params: [thamSoDuongDan('maSuKien')], body: 'AnSuKien', responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/su-kien/{maSuKien}/bo-an': {
      patch: endpoint('Admin bỏ ẩn sự kiện; giữ nguyên trạng thái open/closed/finished/cancelled trước đó; ghi nhật ký bo_an_su_kien', 'Quản trị', {
        auth: true, params: [thamSoDuongDan('maSuKien')], responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/khieu-nai': {
      get: endpoint('Admin đọc danh sách khiếu nại chủ sân (mặc định chờ xử lý, cũ nhất trước). Mỗi dòng có loai = service (chậm duyệt) | refund (chưa nhận tiền hoàn), maKhieuNaiHienThi (KNxxxxxx)', 'Quản trị', {
        auth: true,
        query: [
          thamSoTruyVan('trangThai', 'pending | upheld | rejected | all (mặc định pending)'),
          thamSoTruyVan('gioiHan', 'Số dòng tối đa (1–100)'),
        ],
      }),
    },
    '/api/quan-tri/khieu-nai/{maKhieuNai}/xu-ly': {
      patch: endpoint(
        'Admin quyết định khiếu nại (bắt buộc ghiChu = lý do, cả upheld lẫn rejected; JSON hoặc multipart kèm ≤3 ảnh `anhBangChung`). upheld → tạo 1 gậy (bảng Gay) cho chủ sân: 1 cảnh cáo, 2 cảnh cáo nghiêm trọng, 3 khóa tài khoản; rejected → không gậy. Ghi nhật ký',
        'Quản trị',
        {
          auth: true,
          params: [thamSoDuongDan('maKhieuNai')],
          body: 'XuLyKhieuNai',
          responses: { 404: response.Loi, 409: response.Loi },
        }),
    },
    '/api/quan-tri/khieu-nai/{maKhieuNai}': {
      delete: endpoint(
        'G9.D3 – Admin thu hồi (xoá MỀM) khiếu nại, body {lyDo} bắt buộc → {maKhieuNai, daThuHoi, soLanViPham, daMoKhoaChuSan}. Ẩn khỏi mọi danh sách. Nếu đã upheld: gậy → revoked, tính lại SoLanViPham, kháng nghị đang chờ → cancelled; chủ sân đang bị khoá CHỈ do đủ 3 gậy mà nay <3 → tự mở khoá và bật lại cơ sở hidden. Báo chủ sân + khách, ghi nhật ký thu_hoi_khieu_nai. 404; 409 COMPLAINT_ALREADY_DELETED',
        'Quản trị',
        {
          auth: true,
          params: [thamSoDuongDan('maKhieuNai')],
          body: 'ThuHoiKhieuNai',
          responses: { 404: response.Loi, 409: response.Loi },
        }),
    },
    '/api/quan-tri/khang-nghi': {
      get: endpoint('Admin xem kháng nghị của chủ sân (kèm khiếu nại gốc, lý do quyết định, giải trình). G9.C9: bangChung[] = ảnh chủ sân đính kèm kháng nghị (ảnh Admin đính kèm khi xử lý khiếu nại đổi tên bangChungQuanTri[]); thêm loaiKhieuNai, maHoanTien, trangThaiHoanTien, ngayKhachXacNhan, anhChungTuHoan', 'Quản trị', {
        auth: true,
        query: [thamSoTruyVan('trangThai', 'pending | accepted | rejected | all (mặc định pending)'), thamSoTruyVan('gioiHan', '1–100')],
      }),
    },
    '/api/quan-tri/khang-nghi/{maKhangNghi}/xu-ly': {
      patch: endpoint('Admin xét kháng nghị (body {quyetDinh: accepted|rejected, ghiChu bắt buộc}): accepted → thu hồi gậy (revoked), rejected → giữ gậy. G9.C9: kháng nghị khiếu nại hoàn tiền chỉ accepted được khi khách đã bấm đã nhận tiền hoặc có ảnh chứng từ hoàn, nếu không 409 APPEAL_REFUND_NOT_CONFIRMED. Trả canMoKhoaTaiKhoan khi tài khoản đang khóa mà đã dưới 3 gậy (Admin tự mở khóa)', 'Quản trị', {
        auth: true, params: [thamSoDuongDan('maKhangNghi')], responses: { 404: response.Loi, 409: response.Loi },
      }),
    },
    '/api/quan-tri/chu-san/{maNguoiDung}/khoa-dat-moi': {
      patch: endpoint('Admin khóa/mở khóa nhận đặt MỚI của chủ sân (body {khoa: boolean, lyDo}); lịch đã đặt giữ nguyên; khách đặt mới → 409 OWNER_BOOKING_LOCKED. Ghi nhật ký', 'Quản trị', {
        auth: true, params: [thamSoDuongDan('maNguoiDung')], responses: { 404: response.Loi, 409: response.Loi },
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
    '/api/chu-san/su-kien': {
      get: endpoint('Chủ sân xem danh sách sự kiện của mình', 'Sự kiện', { auth: true, query: [thamSoTruyVan('trangThai', 'open | closed | finished | cancelled'), thamSoTruyVan('trang', 'Trang, mặc định 1'), thamSoTruyVan('soLuong', '1–50, mặc định 20')] }),
      post: endpoint('Tạo sự kiện Giao lưu hoặc Giải đấu', 'Sự kiện', { auth: true, body: 'TaoSuKien', responses: { 409: response.Loi } }),
    },
    '/api/chu-san/su-kien/{maSuKien}': {
      get: endpoint('Chủ sân xem chi tiết sự kiện của mình', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')] }),
      patch: endpoint('Sửa sự kiện theo quy tắc SK-04', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')], body: 'SuaSuKien', responses: { 409: response.Loi } }),
    },
    '/api/chu-san/su-kien/{maSuKien}/anh-bia': { post: endpoint('Chủ sân cập nhật ảnh bìa sự kiện (multipart, field tepAnh)', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')], upload: true }) },
    '/api/chu-san/su-kien/{maSuKien}/dong': { post: endpoint('Đóng nhận đăng ký sự kiện', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')] }) },
    '/api/chu-san/su-kien/{maSuKien}/mo': { post: endpoint('Mở lại nhận đăng ký nếu còn đủ điều kiện', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')] }) },
    '/api/chu-san/su-kien/{maSuKien}/huy': { post: endpoint('Hủy sự kiện, bắt buộc có lý do', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')], body: 'LyDoSuKien', responses: { 409: response.Loi } }) },
    '/api/chu-san/su-kien/{maSuKien}/dang-ky': { get: endpoint('Chủ sân xem/lọc danh sách đăng ký của sự kiện', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')], query: [thamSoTruyVan('trangThai', 'pending | accepted | cancelled | rejected'), thamSoTruyVan('maHangMuc', 'Lọc theo hạng mục'), thamSoTruyVan('trang', 'Trang'), thamSoTruyVan('soLuong', '1–50')] }) },
    '/api/chu-san/dang-ky-su-kien/{maDangKy}/chap-nhan': { post: endpoint('Chủ sân chấp nhận đăng ký', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')], responses: { 409: response.Loi } }) },
    '/api/chu-san/dang-ky-su-kien/{maDangKy}/tu-choi': { post: endpoint('Chủ sân từ chối đăng ký (lý do tuỳ chọn)', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')], body: 'LyDoTuChoiDangKy' }) },
    '/api/chu-san/dang-ky-su-kien/{maDangKy}/loai': { post: endpoint('Chủ sân loại người đã nhận (bắt buộc lý do)', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')], body: 'LyDoSuKien' }) },
    '/api/chu-san/dang-ky-su-kien/{maDangKy}/thanh-toan/xac-nhan': { post: endpoint('Chủ sân xác nhận đã nhận phí sự kiện', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')], responses: { 409: response.Loi } }) },
    '/api/chu-san/dang-ky-su-kien/{maDangKy}/thanh-toan/tu-choi': { post: endpoint('Chủ sân từ chối chứng từ (bắt buộc lý do)', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')], body: 'LyDoSuKien' }) },
    '/api/chu-san/dang-ky-su-kien/{maDangKy}/thanh-toan/hoan-phi': { post: endpoint('Đánh dấu chủ sân đã tự chuyển khoản hoàn phí', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')], responses: { 409: response.Loi } }) },
    '/api/khach/su-kien': { get: endpoint('Khách xem và lọc sự kiện đang công khai; kết quả có coSanDaGiu cho biết sự kiện đã giữ sân', 'Sự kiện', { auth: true, query: [thamSoTruyVan('khuVuc', 'Tỉnh/quận/địa chỉ'), thamSoTruyVan('maCoSo', 'Mã cơ sở'), thamSoTruyVan('ngay', 'YYYY-MM-DD'), thamSoTruyVan('loai', 'social | tournament'), thamSoTruyVan('trinhDo', '1–8'), thamSoTruyVan('phi', 'free | paid'), thamSoTruyVan('conCho', 'true | false'), thamSoTruyVan('trang', 'Trang'), thamSoTruyVan('soLuong', '1–50')] }) },
    '/api/khach/su-kien/{maSuKien}': { get: endpoint('Khách xem chi tiết công khai, chỉ hiển thị số lượng người đăng ký', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')] }) },
    '/api/khach/su-kien/{maSuKien}/dang-ky': { post: endpoint('Khách đăng ký sự kiện', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maSuKien')], body: 'DangKySuKien', responses: { 409: response.Loi } }) },
    '/api/khach/dang-ky-su-kien': { get: endpoint('Khách xem danh sách đăng ký của chính mình', 'Sự kiện', { auth: true, query: [thamSoTruyVan('trangThai', 'pending | accepted | cancelled | rejected'), thamSoTruyVan('trang', 'Trang'), thamSoTruyVan('soLuong', '1–50')] }) },
    '/api/khach/dang-ky-su-kien/{maDangKy}': { delete: endpoint('Khách rút đăng ký trước giờ bắt đầu', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')], responses: { 409: response.Loi } }) },
    '/api/khach/dang-ky-su-kien/{maDangKy}/thanh-toan': { get: endpoint('Khách xem hóa đơn phí sự kiện và QR VietQR', 'Sự kiện', { auth: true, params: [thamSoDuongDan('maDangKy')] }) },
    '/api/khach/dang-ky-su-kien/{maDangKy}/thanh-toan/chung-tu': {
      post: {
        tags: ['Sự kiện'], summary: 'Khách gửi ảnh chứng từ chuyển khoản phí sự kiện', security: [{ BearerAuth: [] }],
        parameters: [thamSoDuongDan('maDangKy')],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['anhChungTu'], properties: { anhChungTu: { type: 'string', format: 'binary' }, thoiDiemChuyen: { type: 'string', description: 'Tuỳ chọn, giờ VN YYYY-MM-DD HH:MM[:SS]' } } } } } },
        responses: { 200: response.ThanhCong, 400: response.Loi, 401: response.Loi, 403: response.Loi, 409: response.Loi },
      },
    },
    // G8.3–G8.4: Cộng đồng — bài tìm người chơi và đội nhóm.
    '/api/khach/tim-nguoi': { get: endpoint('Danh sách bài tìm người chơi, tìm tiêu đề và lọc khu vực/khoảng trình độ/ngày; mới nhất trước', 'Cộng đồng', { auth: true, query: [thamSoTruyVan('tieuDe', 'Từ khóa trong tiêu đề, tối đa 150 ký tự'), thamSoTruyVan('khuVuc', 'Lọc khu vực'), thamSoTruyVan('trinhDoTu', 'Mức trình độ đầu, 1–8'), thamSoTruyVan('trinhDoDen', 'Mức trình độ cuối, 1–8'), thamSoTruyVan('ngay', 'Ngày chơi YYYY-MM-DD')] }), post: endpoint('Tạo bài tìm người chơi (tạo phòng chat cùng transaction)', 'Cộng đồng', { auth: true }) },
    '/api/khach/tim-nguoi/cua-toi': { get: endpoint('Danh sách bài do tôi tạo hoặc tham gia', 'Cộng đồng', { auth: true }) },
    '/api/khach/tim-nguoi/{id}': { get: endpoint('Chi tiết bài và thành viên active', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }), patch: endpoint('Chủ bài sửa thông tin, ngày giờ và số người', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/tim-nguoi/{id}/tham-gia': { post: endpoint('Đăng ký tham gia bài, tự chuyển full khi đủ chỗ', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')], responses: { 409: response.Loi } }) },
    '/api/khach/tim-nguoi/{id}/roi': { post: endpoint('Thành viên rời bài, giải phóng chỗ', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/tim-nguoi/{id}/dong-tuyen': { post: endpoint('Chủ bài đóng tuyển', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/tim-nguoi/{id}/mo-tuyen': { post: endpoint('Chủ bài mở lại tuyển khi còn chỗ và chưa qua ngày chơi', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/tim-nguoi/{id}/huy': { post: endpoint('Chủ bài hủy bài và chuyển phòng chat sang readonly', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/tim-nguoi/{id}/thanh-vien/{maNguoiDung}': { delete: endpoint('Chủ bài xóa thành viên; người bị xóa không thể tham gia lại', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id'), thamSoDuongDan('maNguoiDung')] }) },
    '/api/khach/doi-nhom': { get: endpoint('Danh sách đội nhóm công khai, lọc khu vực/trình độ', 'Cộng đồng', { auth: true }), post: endpoint('Tạo đội nhóm và phòng chat', 'Cộng đồng', { auth: true }) },
    '/api/khach/doi-nhom/cua-toi': { get: endpoint('Danh sách nhóm tôi tạo hoặc tham gia', 'Cộng đồng', { auth: true }) },
    '/api/khach/doi-nhom/{id}': { get: endpoint('Chi tiết nhóm, thành viên và yêu cầu chờ (trưởng nhóm)', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }), patch: endpoint('Trưởng nhóm cập nhật thông tin và giới hạn thành viên', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/doi-nhom/{id}/tham-gia': { post: endpoint('Tham gia tự do hoặc gửi yêu cầu tham gia', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')], responses: { 409: response.Loi } }) },
    '/api/khach/doi-nhom/{id}/yeu-cau/{maYeuCau}/duyet': { post: endpoint('Trưởng nhóm duyệt yêu cầu; kiểm tra lại chỗ trong transaction', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id'), thamSoDuongDan('maYeuCau')] }) },
    '/api/khach/doi-nhom/{id}/yeu-cau/{maYeuCau}/tu-choi': { post: endpoint('Trưởng nhóm từ chối yêu cầu', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id'), thamSoDuongDan('maYeuCau')] }) },
    '/api/khach/doi-nhom/{id}/yeu-cau-cua-toi': { delete: endpoint('Người gửi hủy yêu cầu đang chờ', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/doi-nhom/{id}/roi': { post: endpoint('Thành viên rời nhóm; trưởng nhóm phải chuyển quyền trước', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/doi-nhom/{id}/thanh-vien/{maNguoiDung}': { delete: endpoint('Trưởng nhóm xóa thành viên', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id'), thamSoDuongDan('maNguoiDung')] }) },
    '/api/khach/doi-nhom/{id}/chuyen-quyen': { post: endpoint('Trưởng nhóm chuyển quyền cho thành viên active', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
    '/api/khach/doi-nhom/{id}/giai-tan': { post: endpoint('Trưởng nhóm giải tán nhóm, xóa toàn bộ lịch sử tin nhắn và khóa gửi tin', 'Cộng đồng', { auth: true, params: [thamSoDuongDan('id')] }) },
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
      TinNhanCongDong: {
        type: 'object', required: ['noiDung'],
        properties: { noiDung: { type: 'string', minLength: 1, maxLength: 1000, example: 'Mọi người hẹn nhau lúc 19:00 nhé' } },
      },
      DangKy: {
        type: 'object',
        required: ['matKhau', 'hoTen', 'soDienThoai', 'email'],
        properties: {
          matKhau: { type: 'string', format: 'password', minLength: 8, maxLength: 64, description: 'Có cả chữ và số, không khoảng trắng', example: 'MatKhau123' },
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
          matKhau: { type: 'string', format: 'password', minLength: 8, maxLength: 64, example: 'MatKhau123' },
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
          matKhauMoi: { type: 'string', format: 'password', minLength: 8, maxLength: 64, description: 'Có cả chữ và số, không khoảng trắng, khác matKhauCu' },
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
      BaoCaoSuKien: {
        type: 'object', required: ['maSuKien', 'lyDo'],
        properties: {
          maSuKien: { type: 'integer', minimum: 1 },
          lyDo: { type: 'string', enum: ['misleading', 'fraud', 'inappropriate', 'other'] },
          noiDung: { type: 'string', maxLength: 500 },
        },
      },
      XuLyBaoCaoSuKien: {
        type: 'object', required: ['quyetDinh', 'ghiChu'],
        properties: {
          quyetDinh: { type: 'string', enum: ['upheld', 'rejected'] },
          hanhDong: { type: 'string', enum: ['none', 'hide', 'cancel'], default: 'none' },
          congViPham: { type: 'boolean', default: false },
          ghiChu: { type: 'string', minLength: 3, maxLength: 500 },
        },
      },
      AnSuKien: {
        type: 'object', required: ['lyDo'],
        properties: { lyDo: { type: 'string', minLength: 3, maxLength: 255 } },
      },
      XuLyKhieuNai: {
        type: 'object',
        required: ['quyetDinh', 'ghiChu'],
        properties: {
          quyetDinh: { type: 'string', enum: ['upheld', 'rejected'] },
          ghiChu: { type: 'string', minLength: 3, maxLength: 500, description: 'Lý do quyết định — bắt buộc' },
          anhBangChung: { type: 'array', maxItems: 3, items: { type: 'string', format: 'binary' }, description: 'Ảnh bằng chứng (multipart, tùy chọn, ≤3)' },
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
      LyDoKhoaCoSo: {
        type: 'object',
        required: ['lyDo'],
        properties: {
          lyDo: { type: 'string', minLength: 3, maxLength: 255, description: 'Lý do Admin khóa cơ sở', example: 'Cơ sở vi phạm quy định hoạt động' },
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
              required: ['gioBatDau', 'gioKetThuc'],
              properties: {
                gioBatDau: { type: 'string', example: '06:00' },
                gioKetThuc: { type: 'string', example: '12:00' },
                giaTheoThu: {
                  type: 'array',
                  description: 'Giá riêng từng thứ (đủ 7 phần tử, thu 1 = Thứ 2 … 7 = Chủ nhật). Nếu thiếu, gửi 4 trường giá cũ (T2–T6 / T7–CN).',
                  items: {
                    type: 'object',
                    required: ['thu', 'giaKhachVangLai', 'giaKhachCoDinh'],
                    properties: {
                      thu: { type: 'integer', minimum: 1, maximum: 7, example: 6 },
                      giaKhachVangLai: { type: 'integer', example: 100000 },
                      giaKhachCoDinh: { type: 'integer', example: 90000 },
                    },
                  },
                },
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
        required: ['gioBatDau', 'gioKetThuc'],
        properties: {
          gioBatDau: { type: 'string', example: '18:00' },
          gioKetThuc: { type: 'string', example: '21:00' },
          giaTheoThu: {
            type: 'array',
            description: 'Giá riêng từng thứ (đủ 7 phần tử, thu 1 = Thứ 2 … 7 = Chủ nhật). Nếu thiếu, gửi 4 trường giá cũ (T2–T6 / T7–CN).',
            items: {
              type: 'object',
              required: ['thu', 'giaKhachVangLai', 'giaKhachCoDinh'],
              properties: {
                thu: { type: 'integer', minimum: 1, maximum: 7, example: 6 },
                giaKhachVangLai: { type: 'integer', example: 100000 },
                giaKhachCoDinh: { type: 'integer', example: 90000 },
              },
            },
          },
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
          xuLyDonVuong: {
            type: 'array',
            description: 'G9.E3: xử lý các đơn vướng cùng giao dịch với khoá. Đơn không có trong danh sách giữ nguyên (khoá cắt quanh đơn)',
            items: {
              type: 'object',
              required: ['maDatSan', 'hanhDong'],
              properties: {
                maDatSan: { type: 'integer' },
                hanhDong: { type: 'string', enum: ['chuyen-san', 'huy'] },
                maSanMoi: { type: 'integer', description: 'Chỉ với chuyen-san; bỏ trống = máy chủ chọn sân trống đầu tiên cùng cơ sở' },
                lyDo: { type: 'string', description: 'Bắt buộc khi huy (G9.E5); chuyen-san hết sân trống mà không có lyDo thì dùng lyDo của khoá, không có cả hai → 400' },
              },
            },
          },
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
        properties: {
          lyDo: { type: 'string', minLength: 2, maxLength: 255, example: 'Sân đóng để bảo trì sàn' },
          cacBuoi: { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: { type: 'integer' },
            description: 'G9.D1 (tuỳ chọn): mã DatSan các buổi cần huỷ (huỷ một phần). Không gửi = huỷ như cũ', example: [101, 102] },
        },
      },
      ThuHoiKhieuNai: {
        type: 'object',
        required: ['lyDo'],
        properties: { lyDo: { type: 'string', minLength: 3, maxLength: 255, description: 'Lý do thu hồi — bắt buộc', example: 'Admin xử lý nhầm, khách đã nhận tiền hoàn' } },
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
      BaoCaoCongDong: {
        type: 'object', required: ['lyDo'], properties: {
          loaiDoiTuong: { type: 'string', enum: ['event','player_post','team'], default: 'event' },
          maSuKien: { type: 'integer', description: 'Dùng cho event (tương thích API cũ)' },
          maDoiTuong: { type: 'integer', description: 'Mã bài hoặc đội nhóm' },
          lyDo: { type: 'string', enum: ['misleading','fraud','inappropriate','other'] }, noiDung: { type: 'string', maxLength: 500 },
        },
      },
      XuLyBaoCaoCongDong: { type: 'object', required: ['quyetDinh','ghiChu'], properties: { quyetDinh: { type: 'string', enum: ['upheld','rejected'] }, hanhDong: { type: 'string', enum: ['hide','remove','none'] }, ghiChu: { type: 'string', minLength: 3, maxLength: 500 } } },
      LyDoCongDong: { type: 'object', required: ['lyDo'], properties: { lyDo: { type: 'string', minLength: 3, maxLength: 500 } } },
      TaoSuKien: {
        type: 'object', required: ['maCoSo','loai','tieuDe','ngay','gioBatDau','gioKetThuc','hanDangKy','cacMaSan'],
        properties: {
          maCoSo: { type: 'integer' }, loai: { type: 'string', enum: ['social','tournament'] },
          tieuDe: { type: 'string', maxLength: 150 }, moTa: { type: 'string' }, dieuLe: { type: 'string' },
          ngay: { type: 'string', example: '2026-12-01' }, gioBatDau: { type: 'string', example: '08:00' },
          gioKetThuc: { type: 'string', example: '11:00' }, hanDangKy: { type: 'string', example: '2026-11-30 20:00' },
          cacMaSan: { type: 'array', items: { type: 'integer' } }, soLuongToiDa: { type: 'integer' },
          hangMuc: { type: 'array', items: { type: 'object', properties: { tenHangMuc: { type: 'string' }, laDoi: { type: 'boolean' }, soLuongToiDa: { type: 'integer' } } } },
          trinhDoTu: { type: 'integer', minimum: 1, maximum: 8 }, trinhDoDen: { type: 'integer', minimum: 1, maximum: 8 },
          cheDoDuyet: { type: 'string', enum: ['auto','manual'] }, phi: { type: 'integer', minimum: 0 }, ghiChuPhi: { type: 'string', maxLength: 255 },
        },
      },
      SuaSuKien: { type: 'object', additionalProperties: true, description: 'Các trường cần sửa; hỗ trợ themHangMuc[], suaHangMuc[], xoaHangMuc[], lyDoThayDoi.' },
      LyDoSuKien: { type: 'object', required: ['lyDo'], properties: { lyDo: { type: 'string', minLength: 1, maxLength: 255 } } },
      LyDoTuChoiDangKy: { type: 'object', properties: { lyDo: { type: 'string', maxLength: 255 } } },
      DangKySuKien: { type: 'object', properties: { maHangMuc: { type: 'integer' }, trinhDoKhai: { type: 'integer', minimum: 1, maximum: 8 }, tenDongDoi: { type: 'string', maxLength: 100 }, sdtDongDoi: { type: 'string', maxLength: 20 } } },
    },
  },
};
