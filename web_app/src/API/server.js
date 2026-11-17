// =====================================================================
// API quản lý sân & chi nhánh  (Node.js + Express + MySQL)
//
// Cài đặt:   npm i express mysql2 cors
// Chạy:      node server.js
//            (cần có "type": "module" trong package.json cùng thư mục vì file dùng cú pháp import)
// Cấu hình:  đổi bằng biến môi trường (DB_HOST, DB_PORT, DB_USER,
//            DB_PASSWORD, DB_NAME, PORT) hoặc sửa trực tiếp giá trị mặc định bên dưới.
//
// Ánh xạ giữa giao diện (App.jsx) và database (db_sancaulong.sql):
//   Sân         -> San.TenSan
//   Chi nhánh   -> CoSo.TenCoSo   (bảng CoSo, San nối qua MaCoSo)
//   Giá thường  -> San.GiaThuong  (cột MỚI, server tự thêm nếu chưa có)
//   Trạng thái  -> San.TrangThai  ('active' = Hoạt động, 'maintenance' = Tạm đóng)
// =====================================================================
import express from 'express'
import cors from 'cors'
import mysql from 'mysql2/promise'

const PORT = Number(process.env.PORT) || 3001

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'DatSanCauLong',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL trả về số thay vì chuỗi
})

/* ------------------------------------------------------------------
   Tiện ích
   ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Mỗi dòng trả về đúng dạng mà App.jsx đang dùng: { id, name, branch, price, active }
const SELECT_COURT = `
  SELECT s.MaSan     AS id,
         s.TenSan    AS name,
         c.TenCoSo   AS branch,
         s.GiaThuong AS price,
         (s.TrangThai = 'active') AS active
  FROM San s
  JOIN CoSo c ON c.MaCoSo = s.MaCoSo`

const toCourt = (r) => ({
  id: r.id,
  name: r.name,
  branch: r.branch,
  price: Number(r.price),
  active: Boolean(r.active),
})

// Bọc handler async để lỗi được chuyển sang error middleware
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next)

// Cột GiaThuong chưa có trong schema gốc -> tự thêm khi server khởi động (chạy nhiều lần vẫn an toàn)
async function ensureSchema() {
  const [cols] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'San' AND COLUMN_NAME = 'GiaThuong'`
  )
  if (cols.length === 0) {
    await pool.query(`ALTER TABLE San ADD COLUMN GiaThuong DECIMAL(12,0) NOT NULL DEFAULT 0 AFTER TenSan`)
    console.log('Đã thêm cột San.GiaThuong')
  }
}

// CoSo.MaChuSan là NOT NULL. Khi chưa có chức năng đăng nhập, tạm gán cho tài khoản
// owner đầu tiên (hoặc admin nếu chưa có owner). Sau này thay bằng id người đang đăng nhập.
async function getOwnerId(conn) {
  const [rows] = await conn.query(
    `SELECT MaNguoiDung FROM NguoiDung
     WHERE VaiTro IN ('owner', 'admin')
     ORDER BY (VaiTro = 'owner') DESC, MaNguoiDung
     LIMIT 1`
  )
  return rows[0]?.MaNguoiDung ?? null
}

/* ------------------------------------------------------------------
   Routes
   ------------------------------------------------------------------ */

const app = express()
app.use(cors())
app.use(express.json())

// 1. Danh sách sân
app.get(
  '/api/courts',
  wrap(async (req, res) => {
    const [rows] = await pool.query(`${SELECT_COURT} ORDER BY s.MaSan`)
    res.json(rows.map(toCourt))
  })
)

// 2. Đổi trạng thái Hoạt động <-> Tạm đóng (chỉ sân có id này)
app.patch(
  '/api/courts/:id/toggle',
  wrap(async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Mã sân không hợp lệ.')

    // Đảo trạng thái ngay trong câu UPDATE nên không bị lệch khi bấm nhanh / nhiều người cùng dùng
    const [result] = await pool.query(
      `UPDATE San
       SET TrangThai = IF(TrangThai = 'active', 'maintenance', 'active')
       WHERE MaSan = ?`,
      [id]
    )
    if (result.affectedRows === 0) throw new HttpError(404, 'Không tìm thấy sân.')

    const [rows] = await pool.query(`${SELECT_COURT} WHERE s.MaSan = ?`, [id])
    res.json(toCourt(rows[0]))
  })
)

// 3. Thêm sân mới (mặc định Tạm đóng)
app.post(
  '/api/courts',
  wrap(async (req, res) => {
    const name = String(req.body?.name ?? '').trim()
    const branch = String(req.body?.branch ?? '').trim()
    const price = Number(req.body?.price)

    if (!name || !branch) throw new HttpError(400, 'Nhập tên sân và chi nhánh.')
    if (name.length > 50) throw new HttpError(400, 'Tên sân tối đa 50 ký tự.')
    if (branch.length > 80) throw new HttpError(400, 'Tên chi nhánh tối đa 80 ký tự.')
    if (!Number.isFinite(price) || price <= 0 || price > 1e9) {
      throw new HttpError(400, 'Giá thường phải lớn hơn 0.')
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      // Chi nhánh đã có thì dùng lại, chưa có thì tạo mới
      const [found] = await conn.query('SELECT MaCoSo FROM CoSo WHERE TenCoSo = ? LIMIT 1', [branch])
      let maCoSo = found[0]?.MaCoSo
      if (!maCoSo) {
        const chuSan = await getOwnerId(conn)
        if (!chuSan) throw new HttpError(500, 'Chưa có tài khoản chủ sân/admin trong bảng NguoiDung.')
        const [coSo] = await conn.query(
          `INSERT INTO CoSo (MaChuSan, TenCoSo, DiaChi, TinhThanh, QuanHuyen)
           VALUES (?, ?, ?, 'TP. Hồ Chí Minh', ?)`,
          [chuSan, branch, branch, branch]
        )
        maCoSo = coSo.insertId
      }

      const [san] = await conn.query(
        `INSERT INTO San (MaCoSo, TenSan, GiaThuong, TrangThai) VALUES (?, ?, ?, 'maintenance')`,
        [maCoSo, name, price]
      )
      const [rows] = await conn.query(`${SELECT_COURT} WHERE s.MaSan = ?`, [san.insertId])

      await conn.commit()
      res.status(201).json(toCourt(rows[0]))
    } catch (err) {
      await conn.rollback()
      if (err.code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, `Sân "${name}" đã tồn tại trong chi nhánh "${branch}".`)
      }
      throw err
    } finally {
      conn.release()
    }
  })
)

/* ------------------------------------------------------------------
   Xử lý lỗi chung
   ------------------------------------------------------------------ */
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message })
  console.error(err)
  res.status(500).json({ message: 'Lỗi máy chủ, vui lòng thử lại.' })
})

/* ------------------------------------------------------------------
   Khởi động
   ------------------------------------------------------------------ */
try {
  await ensureSchema()
  app.listen(PORT, () => console.log(`API chạy tại http://localhost:${PORT}`))
} catch (err) {
  console.error('Không kết nối được MySQL:', err.message)
  console.error('Kiểm tra lại DB_HOST / DB_USER / DB_PASSWORD / DB_NAME và đã chạy db_sancaulong.sql chưa.')
  process.exit(1)
}
