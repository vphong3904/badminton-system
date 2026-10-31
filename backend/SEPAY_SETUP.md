# Cau hinh thanh toan va webhook SePay

Webhook nhan bien dong tien vao tai `/api/webhooks/sepay`. Ung dung chi xac nhan don khi chu ky dung, dung tai khoan nhan, noi dung chuyen khoan khop ma don va so tien khop hoa don. Anh chuyen khoan khach tai len chi de tham khao, khong tu xac nhan da thanh toan.

## 1. Cap nhat co so du lieu

Neu tao moi database, nap `database/db_sancaulong.sql` nhu binh thuong. Neu database da co cac bang dat san/thanh toan, chay migration sau mot lan tu thu muc goc repo:

```powershell
Get-Content -Raw .\database\migrations\20261030_create_giaodich_sepay.sql |
  mysql -h localhost -u root -p db_sancaulong
```

Bang `GiaoDichSePay` luu ID giao dich SePay lam khoa chinh. SePay gui lai cung mot webhook se khong ghi nhan thanh toan hai lan.

## 2. Cau hinh bien moi truong

Trong `backend/.env` (khong commit file nay), dien:

```dotenv
SEPAY_WEBHOOK_SECRET=chuoi_bi_mat_ngau_nhien_dai_va_kho_doan
SEPAY_BANK_ACCOUNT=so_tai_khoan_nhan_tien
SEPAY_BANK_CODE=ma_ngan_hang_duoc_qr_sepay_ho_tro
SEPAY_WEBHOOK_MAX_SKEW_SECONDS=300
```

- `SEPAY_WEBHOOK_SECRET`: tao mot secret rieng, vi du bang password manager hoac `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Dung cung mot gia tri khi tao webhook tren SePay.
- `SEPAY_BANK_ACCOUNT`: phai trung voi tai khoan nhan tien da ket noi SePay va truong `accountNumber` trong webhook.
- `SEPAY_BANK_CODE`: ma ngan hang ma dich vu QR SePay chap nhan; doi chieu ma ngan hang cua tai khoan nhan voi SePay truoc khi mo thanh toan that.
- Khong gui secret qua chat, khong dua vao ma nguon, log, frontend hay URL.

Khoi dong lai backend sau khi sua `.env`. Khi chua co tai khoan va ma ngan hang, API tao don/lay QR tra loi loi `PAYMENT_NOT_CONFIGURED` thay vi tao mot QR khong the thanh toan.

## 3. Tao webhook tren SePay

1. Dang nhap SePay va mo phan quan ly webhook cho tai khoan ngan hang nhan tien.
2. Tao webhook moi, dat URL la `https://<ten-mien-api>/api/webhooks/sepay`; dung URL HTTPS cong khai, khong dung `localhost` khi chay that.
3. Chon su kien giao dich tien vao (incoming/transfer in), dinh dang JSON va phuong thuc xac thuc **HMAC-SHA256**.
4. Dan `SEPAY_WEBHOOK_SECRET` vao truong secret cua webhook. Neu SePay hien secret moi, cap nhat dong thoi tren SePay va `.env`, sau do khoi dong lai backend.
5. Luu cau hinh va dung chuc nang gui thu cua SePay de kiem tra ket noi. Khong chon che do khong xac thuc.

Backend doc raw body truoc khi parse JSON va kiem tra cac header `X-SePay-Timestamp`, `X-SePay-Signature`. Chu ky phai la HMAC-SHA256 cua chuoi `{timestamp}.{raw_body}` voi tien to `sha256=`; request qua han 5 phut bi tu choi de giam replay. Phan hoi thanh cong dung chinh xac HTTP 200 va JSON `{"success":true}` theo yeu cau webhook SePay.

## 4. Kiem thu end-to-end

1. Dam bao API co the truy cap tu internet qua HTTPS, `.env` da co ba bien SePay va backend ket noi duoc `db_sancaulong`.
2. Tao don dat san; API tra ma don, so tien, noi dung chuyen khoan va URL anh QR. Chuyen dung so tien, dung tai khoan va giu nguyen ma don trong noi dung.
3. Cho SePay gui webhook giao dich thuc. Kiem tra don chuyen sang `confirmed`, thanh toan sang `success`, va dong giao dich co `TrangThaiDoiSoat='matched'` trong `GiaoDichSePay`.
4. Thu gui lai cung mot webhook. API van tra thanh cong de SePay dung retry, nhung ma giao dich duy nhat khong duoc xu ly lai.
5. Khong dung payload gia de xac nhan mot don that. Neu test bang payload ky thu cong, chi dung database va ma don test rieng, dong thoi kiem tra thoi gian giu cho.

QR duoc tao boi `https://qr.sepay.vn/img` voi tai khoan, ma ngan hang, so tien va ma don. Neu QR khong hien hoac app ngan hang khong nhan dien, kiem tra lai `SEPAY_BANK_CODE`, `SEPAY_BANK_ACCOUNT` va thu tao QR truc tiep tu SePay.

## 5. Trang thai va xu ly loi

| Ket qua | Y nghia / xu ly |
|---|---|
| `200 {"success":true}` | Da ghi nhan webhook; giao dich co the da doi soat hoac duoc luu cho admin kiem tra. |
| `401` | Chu ky sai, thieu header hoac timestamp het han. Kiem tra raw body, secret va dong ho may chu. |
| `503` | Chua cau hinh secret webhook; dien `SEPAY_WEBHOOK_SECRET` va khoi dong lai. |
| `500` | Backend/database gap loi; SePay co the thu gui lai, kiem tra log backend va bang `GiaoDichSePay`. |
| `unmatched` | Khong phai tien vao tai khoan da cau hinh hoac noi dung khong co ma don. |
| `amount_mismatch` | Ma don co khop nhung so tien khong khop; don khong duoc tu dong xac nhan. Admin can doi soat. |
| `late` / `late_payment` | Tien den sau khi het han giu cho; khong tu dong mo lai san. Khach bo sung tai khoan nhan hoan, admin xu ly hoan tien. |

Webhook la co che doi soat chinh. Anh khach tai len khong thay the xac nhan tu ngan hang. Cac giao dich hoan tien va chi tra chu san hien duoc admin chuyen khoan thu cong, sau do cap nhat ma giao dich tren trang quan tri. Chua co tich hop chuyen tien ra tu dong qua SePay.

Tai lieu SePay: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc va https://developer.sepay.vn/vi/sepay-webhooks/lap-trinh-webhooks/lap-trinh-webhook-nodejs
