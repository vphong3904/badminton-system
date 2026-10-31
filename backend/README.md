# Ung dung dat san cau long
Ung dung dat san cau long theo thoi gian thuc.

## Cac phan cua du an
- mobile_app: Ung dung di dong Flutter
- web_app: Trang web khach hang
- admin_web: Trang quan tri
- backend: Giao dien lap trinh Node.js
- database: Tep lenh MySQL
- docs: Tai lieu du an

## API moi

- Khach hang: `GET /api/khach/co-so`, `GET /api/khach/co-so/:maCoSo`,
  `GET /api/khach/san/:maSan`, `GET /api/khach/san/:maSan/lich-trong`, `POST /api/khach/dat-san`,
  `POST /api/khach/dat-san/co-dinh`, `GET /api/khach/dat-san`,
  `GET /api/khach/dat-san/:maDatSan/hoa-don-nhap` va `POST /api/khach/dat-san/:maDatSan/huy`.
- Thanh toan: `GET /api/thanh-toan/:maDatSan/qr`,
  `POST /api/thanh-toan/:maDatSan/anh-chuyen-khoan`,
  webhook `POST /api/webhooks/sepay`.
- Chu san: cac endpoint `/api/chu-san/bao-cao/*` va `/api/chu-san/rut-tien`.
- Quan tri: cac endpoint `/api/quan-tri/chu-san/*`, `/api/quan-tri/hoan-tien`,
  `/api/quan-tri/rut-tien`, `/api/quan-tri/giao-dich/sepay` va `/api/quan-tri/nhat-ky`.

Don co dinh tao cac luot dat hang ngay trong khoang ngay bat dau-ket thuc (toi da 90 ngay),
gom thanh mot hoa don va mot lan thanh toan. Tien va ma noi dung chuyen khoan duoc doi soat
boi webhook; tai khoan hoan tien va viec chi tra chu san do admin chuyen khoan thu cong.

Xem [SEPAY_SETUP.md](./SEPAY_SETUP.md) de cau hinh bien moi truong, migration va webhook SePay.

## Swagger va trang thu API

Chay backend bang `npm run dev`, sau do mo `http://localhost:3000/api-docs`.
Trang Swagger hien thi toan bo endpoint, co the nhan **Try it out** de gui request.
Voi API can dang nhap, dang nhap truoc, sao chep `maTruyCap`, nhan **Authorize** va dan token
(khong can tu them chu `Bearer`). Tai lieu OpenAPI dang JSON tai `/api-docs/openapi.json`.

Webhook SePay can chu ky HMAC tren raw body nen khong the test truc tiep bang nut **Try it out**.