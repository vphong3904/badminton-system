# admin — web quản trị (React + Vite + Tailwind)
Chạy: `cp .env.example .env && npm install && npm run dev` · Kiểm: `npm run build && npm run lint`. Địa chỉ backend: `VITE_API_URL` (mặc định `http://localhost:3000`).
Đăng nhập qua `POST /api/tai-khoan/dang-nhap-web` (vai trò `admin`; tạo tài khoản bằng `npm run seed:admin` ở `backend/`).

## Cấu trúc `src/`
`App.jsx` · `pages/` (`Login`, `Dashboard`, `Owners`, `Users`, `Complaints`, `Reviews`, `PaymentProofs` (Chờ xác nhận / quá hạn, G2.6), `Refunds`, `Logs`) · `components/` · `api/` (`client`, `auth`, `admin`) · `context/AuthContext.jsx`.
File chết chưa xóa (không nơi nào import): `pages/{Withdrawals,Sepay,Bookings,Venues}.jsx`, `components/{GrantOwnerModal,PayloadModal}.jsx`.

Chưa xác nhận build/chạy với backend thật. Hàng đợi việc: `../docs/agent/tasks/README.md`.
