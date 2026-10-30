-- Schema đặt sân cầu lông (17 bảng). MySQL 8+
-- LƯU Ý: viết lại theo thiết kế đã chốt (users dùng chung theo role, court_blocks,
-- payments.proof_url, trạng thái late_payment, đơn cố định, hàng đợi hoàn tiền/chi trả, audit log).
-- Nếu bạn có db_sancaulong.sql riêng, chỉ cần đối chiếu tên bảng/cột ở tầng services.
CREATE DATABASE IF NOT EXISTS sancaulong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sancaulong;

CREATE TABLE provinces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE districts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  province_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (province_id) REFERENCES provinces(id)
);

CREATE TABLE users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('customer','owner','admin') NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  status ENUM('active','locked') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (role), INDEX (phone)
);

-- Hồ sơ chủ sân: onboarding + duyệt + tài khoản ngân hàng nhận tiền
CREATE TABLE owner_profiles (
  user_id BIGINT PRIMARY KEY,
  approval_status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME NULL,
  reject_reason VARCHAR(500) NULL,
  bank_name VARCHAR(100) NULL,
  bank_account_no VARCHAR(30) NULL,
  bank_account_name VARCHAR(100) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE venues (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NOT NULL,
  province_id INT NULL,
  district_id INT NULL,
  phone VARCHAR(20) NULL,
  zalo VARCHAR(30) NULL,
  map_url VARCHAR(500) NULL,
  description TEXT NULL,
  image_url VARCHAR(255) NULL,
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  court_count INT NOT NULL DEFAULT 0,
  min_booking_minutes INT NOT NULL DEFAULT 60,
  status ENUM('draft','active','hidden') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (province_id) REFERENCES provinces(id),
  FOREIGN KEY (district_id) REFERENCES districts(id),
  INDEX (status, province_id, district_id)
);

-- Bảng giá theo khung giờ (giá/giờ): giá cố định (app/đơn cố định) và giá vãng lai
CREATE TABLE price_slots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  fixed_price INT NOT NULL,
  walkin_price INT NOT NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE
);

CREATE TABLE courts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  name VARCHAR(50) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE,
  UNIQUE (venue_id, name)
);

-- Khóa một khoảng giờ của sân (bảo trì, giữ chỗ...)
CREATE TABLE court_blocks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  court_id BIGINT NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  reason VARCHAR(255) NULL,
  created_by BIGINT NOT NULL,
  FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX (court_id, start_at, end_at)
);

-- Đơn cố định: cùng khung giờ lặp lại mỗi ngày trong khoảng ngày
CREATE TABLE recurring_bookings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  customer_id BIGINT NULL,
  court_id BIGINT NOT NULL,
  contact_name VARCHAR(100) NULL,
  contact_phone VARCHAR(20) NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_by BIGINT NOT NULL,
  FOREIGN KEY (venue_id) REFERENCES venues(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (court_id) REFERENCES courts(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE bookings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  venue_id BIGINT NOT NULL,
  customer_id BIGINT NULL,
  created_by BIGINT NOT NULL,
  source ENUM('app','onsite') NOT NULL DEFAULT 'app',
  recurring_id BIGINT NULL,
  booking_date DATE NOT NULL,
  contact_name VARCHAR(100) NULL,
  contact_phone VARCHAR(20) NULL,
  note VARCHAR(500) NULL,
  total_amount INT NOT NULL DEFAULT 0,
  status ENUM('pending_payment','paid','cancelled','expired','completed') NOT NULL DEFAULT 'pending_payment',
  expires_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancel_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (venue_id) REFERENCES venues(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (recurring_id) REFERENCES recurring_bookings(id),
  INDEX (venue_id, booking_date), INDEX (customer_id), INDEX (status, expires_at)
);

-- Mỗi dòng = một ô 30 phút của một sân. UNIQUE chặn đặt trùng khi ô còn hiệu lực.
CREATE TABLE booking_slots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT NOT NULL,
  court_id BIGINT NOT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  active_key TINYINT GENERATED ALWAYS AS (IF(is_active = 1, 1, NULL)) STORED,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (court_id) REFERENCES courts(id),
  UNIQUE KEY uq_slot (court_id, slot_date, start_time, active_key)
);

CREATE TABLE payments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT NOT NULL,
  amount INT NOT NULL,
  method ENUM('qr','cash') NOT NULL DEFAULT 'qr',
  status ENUM('pending','paid','late_payment','failed','refunded') NOT NULL DEFAULT 'pending',
  transfer_content VARCHAR(100) NULL,
  qr_expires_at DATETIME NULL,
  proof_url VARCHAR(255) NULL,
  refund_bank_name VARCHAR(100) NULL,
  refund_account_no VARCHAR(30) NULL,
  refund_account_name VARCHAR(100) NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  INDEX (status)
);

CREATE TABLE refunds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT NOT NULL,
  booking_id BIGINT NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected','done') NOT NULL DEFAULT 'pending',
  processed_by BIGINT NULL,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (processed_by) REFERENCES users(id)
);

-- Hàng đợi chi trả doanh thu cho chủ sân
CREATE TABLE payouts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT NOT NULL,
  amount INT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  processed_by BIGINT NULL,
  paid_at DATETIME NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (processed_by) REFERENCES users(id)
);

CREATE TABLE reviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  booking_id BIGINT NOT NULL UNIQUE,
  rating TINYINT NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (venue_id) REFERENCES venues(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(50) NULL,
  entity_id BIGINT NULL,
  meta JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (entity, entity_id), INDEX (user_id)
);

CREATE TABLE notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title VARCHAR(150) NOT NULL,
  body VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO provinces (name) VALUES ('TP. Hồ Chí Minh'),('Hà Nội'),('Đà Nẵng');
-- Tài khoản admin: tạo bằng `npm run seed:admin` (nhóm 2) để băm mật khẩu đúng cách.
