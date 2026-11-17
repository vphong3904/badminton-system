# Backend (Node/Express 5/MySQL 8, zod, JWT)
Chạy: `npm run dev` · Test: `npm test` · Swagger: /api-docs · DB: `db_sancaulong.sql` (nguồn sự thật schema).
Luồng: routes → middlewares/validate(zod) → controllers (mỏng) → services (SQL+nghiệp vụ).
Trước khi sửa: đọc docs/agent/01-rules.md (mục Backend) + docs/agent/features/<chức năng>/README.md (rồi mở đúng file nó chỉ). Dùng skill `be-agent`.
File >300 dòng (customerService 545, ownerService 329): đọc theo offset/limit, grep tên hàm trước.
