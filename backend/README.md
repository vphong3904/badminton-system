# Backend — API đặt sân cầu lông
Node.js 20+ / Express 5 / MySQL 8 (zod, JWT). Tiếng Việt không dấu cho tên code/DB. Lớp: `routes → validators(zod) → controllers → services (SQL + nghiệp vụ)`.

## Chạy
```
cp .env.example .env        # điền DB_*, JWT_SECRET (BANK_* là tài khoản dự phòng, tùy chọn)
# tạo DB: chạy db_sancaulong.sql (nguồn sự thật schema + dữ liệu mẫu)
npm install
npm run dev                 # http://localhost:3000/api · Swagger: /api-docs
npm run seed:admin          # tạo tài khoản admin
npm test                    # node --test (một số test "DB:" cần MySQL thật)
```
DB tạo trước 11/2026: chạy thêm các `scripts/migration-*.sql` theo thứ tự thời gian (xem tên file); DB mới chỉ cần `db_sancaulong.sql`.

## Nhóm API (mount ở `src/app.js`)
| Tiền tố | Ai dùng | Ghi chú |
|---|---|---|
| `/api/tai-khoan` | mọi vai trò | đăng ký/đăng nhập (`/dang-nhap` mobile, `/dang-nhap-web` web), hồ sơ, đổi mật khẩu |
| `/api/khach` | khách (mobile) | cơ sở/sân/lịch ngày, đặt lẻ/cố định/nhiều sân (`/dat-san/nhieu`), hủy, đánh giá, khiếu nại, yêu thích |
| `/api/thanh-toan` | khách | `GET /:maDatSan/qr`, `POST /:maDatSan/anh-chuyen-khoan` (multipart `anhChuyenKhoan`) |
| `/api/thong-bao` | mọi vai trò | danh sách, chưa đọc, đánh dấu đã đọc |
| `/api/chu-san` | chủ sân (web) | onboarding, cơ sở/sân/giá/khóa sân, đơn + xác nhận/từ chối thanh toán, hoàn tiền, báo cáo, đánh giá |
| `/api/quan-tri` | admin (web) | duyệt chủ sân, tài khoản, hoàn tiền trả muộn, khiếu nại, đánh giá, đóng/xóa sân-cơ sở, nhật ký |

Hợp đồng chi tiết từng endpoint: `../docs/agent/features/<chức năng>/api.md` (nguồn sự thật) + Swagger. Lịch sử đổi API: `../docs/agent/CHANGELOG-API.md`.

## Tiền
Khách chuyển khoản **trực tiếp cho chủ sân** (QR VietQR theo tài khoản ngân hàng chủ sân trong `HoSoChuSan`), gửi ảnh chuyển khoản, chủ sân xác nhận đã nhận. Hệ thống không giữ/chuyển/hoàn tiền; hoàn tiền do chủ sân tự chuyển rồi bấm hoàn thành. Không có luồng rút tiền.

## Job nền
`src/jobs/hanHoan.js` (G4.5): khoản hoàn `processing/not_received` quá `HanHoan` (`refund_deadline_hours`) → nhắc chủ sân 1 lần; quá thêm `refund_grace_hours` → `escalated` + báo Admin (chu kỳ `JOB_HAN_HOAN_PHUT`, mặc định 10 phút; tắt khi `NODE_ENV=test`).
`src/jobs/hoanThanhDon.js`: đơn `confirmed` qua giờ chơi → `completed` + nhắc đánh giá (chu kỳ `JOB_HOAN_THANH_PHUT`, mặc định 5 phút; tắt khi `NODE_ENV=test`).

## Swagger
Mở `/api-docs`; với API cần đăng nhập: đăng nhập trước, copy `maTruyCap`, bấm **Authorize**, dán token (không cần chữ `Bearer`). JSON: `/api-docs/openapi.json`.
