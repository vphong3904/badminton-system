-- =====================================================================
-- HỆ THỐNG ĐẶT SÂN CẦU LÔNG - db_sancaulong (CHỈ CẤU TRÚC)
-- File này chỉ chứa CREATE DATABASE + CREATE TABLE (đã gộp toàn bộ migration).
-- Dữ liệu (cấu hình hệ thống, tài khoản admin, dữ liệu mẫu) nằm ở: db_sancaulong_data.sql
-- Thứ tự chạy: 1) db_sancaulong.sql   2) db_sancaulong_data.sql
-- Quy ước: tên bảng, tên cột viết tiếng Việt không dấu, PascalCase
-- Giá trị ENUM và khóa trong CauHinhHeThong giữ nguyên tiếng Anh
-- Yêu cầu: MySQL 8.0.16+ (để CHECK có hiệu lực)
-- Bảng (20): NguoiDung, HoSoChuSan, CoSo, AnhCoSo, San, KhoaSan, BangGia, LichCoDinh,
--   DatSan, ThanhToan, HoanTien, ChungTuThanhToan, DanhGia, YeuThich, KhieuNai,
--   LichSuQrSan, CheckIn, ThongBao, CauHinhHeThong, NhatKyHeThong
-- =====================================================================
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS db_sancaulong
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_sancaulong;

-- ---------------------------------------------------------------------
-- 1. NguoiDung: dùng chung cho khách / chủ sân / admin, phân biệt bằng VaiTro
--    (VaiTro do backend gán, KHÔNG nhận từ client)
--    Đăng nhập bằng Email (duy nhất) cho mọi vai trò
CREATE TABLE NguoiDung (
  MaNguoiDung   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  HoTen         VARCHAR(100) NOT NULL,
  Email         VARCHAR(150) NOT NULL,
  SoDienThoai   VARCHAR(20) COMMENT 'SĐT chính (chủ sân bắt buộc)',
  SoDienThoaiPhu VARCHAR(20) NULL COMMENT 'SĐT phụ, chỉ chủ sân dùng, không bắt buộc (tối đa 2 số/chủ sân)',
  MatKhauMaHoa  VARCHAR(255) NOT NULL,
  VaiTro        ENUM('customer','owner','admin') NOT NULL DEFAULT 'customer',
  AnhDaiDien    VARCHAR(255) NOT NULL DEFAULT '/tep-tai-len/avatar/default-user.jpg'
                COMMENT 'đường dẫn tương đối; mặc định = ảnh có sẵn uploads/avatar/default-user.jpg; ảnh riêng: /tep-tai-len/avatar/u<MaNguoiDung>-<ms>-<hex>.<jpg|png|webp>',
  TrangThai     ENUM('active','locked') NOT NULL DEFAULT 'active',
  LyDoKhoa      VARCHAR(255) NULL COMMENT 'admin ghi khi khóa tài khoản',
  NgayTao       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT CHK_NguoiDung_AnhDaiDien CHECK (AnhDaiDien LIKE '/tep-tai-len/avatar/%'),
  CONSTRAINT CHK_NguoiDung_ChuSanCoSdt CHECK (VaiTro <> 'owner' OR SoDienThoai IS NOT NULL),
  UNIQUE KEY UQ_NguoiDung_Email (Email),
  KEY IDX_NguoiDung_VaiTro (VaiTro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. HoSoChuSan: thông tin riêng của chủ sân (1-1 với NguoiDung có VaiTro = owner)
--    TrangThaiDuyet: đăng ký chủ sân vào thẳng pending (chờ admin duyệt, tối đa 3 ngày; đã điền sẵn
--                    TenDoanhNghiep + tài khoản ngân hàng). Không có draft.
--                    -> approved / rejected (từ chối thì sửa và gửi lại về pending)
--    Thông tin ngân hàng: khách chuyển khoản thẳng vào đây (QR VietQR) và dùng để chủ sân hoàn tiền
CREATE TABLE HoSoChuSan (
  MaNguoiDung     INT UNSIGNED PRIMARY KEY,
  TenDoanhNghiep  VARCHAR(150) NOT NULL,
  TenNganHang     VARCHAR(100) NOT NULL COMMENT 'tài khoản nhận tiền khách chuyển; điền ngay lúc đăng ký',
  MaNganHang      VARCHAR(20)  NOT NULL COMMENT 'mã VietQR viết tắt (VCB, MB, TCB, ACB…) khớp backend/src/utils/nganHang.js',
  SoTaiKhoan      VARCHAR(30)  NOT NULL,
  ChuTaiKhoan     VARCHAR(100) NOT NULL,
  TrangThaiDuyet  ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  NgayGuiDuyet    DATETIME NULL,
  NgayDuyet       DATETIME NULL,
  MaQuanTriDuyet  INT UNSIGNED NULL COMMENT 'admin duyệt hoặc từ chối',
  LyDoTuChoi      VARCHAR(255) NULL,
  SoLanViPham     TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'số khiếu nại admin xác nhận đúng: 1 cảnh cáo, 2 cảnh cáo nghiêm trọng, 3 khóa tài khoản',
  CONSTRAINT FK_HoSoChuSan_NguoiDung FOREIGN KEY (MaNguoiDung)    REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE,
  CONSTRAINT FK_HoSoChuSan_QuanTri   FOREIGN KEY (MaQuanTriDuyet) REFERENCES NguoiDung(MaNguoiDung),
  KEY IDX_HoSoChuSan_Duyet (TrangThaiDuyet, NgayGuiDuyet)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. CoSo: cơ sở cầu lông (1 cơ sở có nhiều sân con)
--    Cơ sở được tạo ở trạng thái hidden khi chủ sân điền form; admin duyệt xong thì chuyển active
CREATE TABLE CoSo (
  MaCoSo             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaChuSan           INT UNSIGNED NOT NULL,
  TenCoSo            VARCHAR(150) NOT NULL,
  DiaChi             VARCHAR(255) NOT NULL,
  SoDienThoai        VARCHAR(20)  NOT NULL COMMENT 'SĐT liên hệ của cơ sở (khách liên hệ chủ sân qua số này)',
  LinkBanDo          VARCHAR(500) NOT NULL COMMENT 'link Google Maps chủ sân dán vào; mở bản đồ + backend tự đọc ra ViDo/KinhDo',
  TinhThanh          VARCHAR(80)  NOT NULL,
  QuanHuyen          VARCHAR(80)  NOT NULL,
  ViDo               DECIMAL(9,6) NULL COMMENT 'TỰ ĐỘNG lấy từ LinkBanDo khi lưu cơ sở (chủ sân không nhập); dùng tính khoảng cách "sân gần tôi"',
  KinhDo             DECIMAL(9,6) NULL COMMENT 'xem ViDo',
  MoTa               TEXT,
  GioMoCua           TIME NOT NULL DEFAULT '06:00:00',
  GioDongCua         TIME NOT NULL DEFAULT '22:00:00',
  SoPhutDatToiThieu  SMALLINT UNSIGNED NOT NULL DEFAULT 60 COMMENT 'thời gian đặt tối thiểu do chủ sân chọn',
  SoPhutTreToiDa     SMALLINT UNSIGNED NOT NULL DEFAULT 15 COMMENT 'số phút khách được đến trễ tối đa, do chủ sân chọn: 15/20/30',
  GiaThapNhat        DECIMAL(12,0) NULL COMMENT 'giá vãng lai thấp nhất, cập nhật khi lưu bảng giá',
  TrangThai          ENUM('active','hidden','locked','closed') NOT NULL DEFAULT 'hidden'
                     COMMENT 'hidden: đang soạn/chờ duyệt; closed: chủ sân/admin đóng tạm (phải đóng trước khi xóa); locked: admin khóa',
  LyDoKhoa           VARCHAR(255) NULL COMMENT 'admin ghi khi khóa cơ sở',
  DiemTrungBinh      DECIMAL(2,1) NOT NULL DEFAULT 0.0 COMMENT 'cập nhật khi có đánh giá mới',
  SoDanhGia          INT UNSIGNED NOT NULL DEFAULT 0,
  NgayTao            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_CoSo_ChuSan FOREIGN KEY (MaChuSan) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT CHK_CoSo_Gio CHECK (GioDongCua > GioMoCua),
  CONSTRAINT CHK_CoSo_SoPhutToiThieu CHECK (SoPhutDatToiThieu >= 30),
  CONSTRAINT CHK_CoSo_SoPhutTre CHECK (SoPhutTreToiDa IN (15, 20, 30)),
  KEY IDX_CoSo_ChuSan (MaChuSan),
  KEY IDX_CoSo_KhuVuc (TinhThanh, QuanHuyen),
  KEY IDX_CoSo_TrangThai (TrangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. AnhCoSo: ảnh của cơ sở (gallery vuốt ngang)
CREATE TABLE AnhCoSo (
  MaAnh      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaCoSo     INT UNSIGNED NOT NULL,
  DuongDan   VARCHAR(500) NOT NULL COMMENT 'đường dẫn tương đối /tep-tai-len/coso/cs<MaCoSo>-<ms>-<hex>.<jpg|png|webp>; cơ sở chưa có dòng nào → API trả ảnh mặc định /tep-tai-len/coso/coso.jpg (không lưu dòng mặc định ở đây)',
  LaAnhBia   TINYINT(1) NOT NULL DEFAULT 0,
  ThuTu      INT NOT NULL DEFAULT 0,
  CONSTRAINT CHK_AnhCoSo_DuongDan CHECK (DuongDan LIKE '/tep-tai-len/coso/%'),
  CONSTRAINT FK_AnhCoSo_CoSo FOREIGN KEY (MaCoSo) REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  KEY IDX_AnhCoSo_CoSo (MaCoSo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. San: sân con trong cơ sở (Sân 1, Sân 2...). Chống trùng lịch theo sân
--    Sân đã có đơn thì không xóa cứng được, chỉ chuyển sang maintenance
CREATE TABLE San (
  MaSan      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaCoSo     INT UNSIGNED NOT NULL,
  TenSan     VARCHAR(50) NOT NULL,
  TrangThai  ENUM('active','maintenance') NOT NULL DEFAULT 'maintenance' COMMENT 'maintenance = chưa hoạt động/đã đóng; sân mới tạo ở maintenance, chủ sân bật thì mới nhận khách',
  QrToken    CHAR(64) NULL COMMENT 'token QR check-in (ngẫu nhiên 32 byte hex); NULL = chưa tạo, backend tạo lười lần đầu chủ sân mở trang QR',
  QrPhienBan INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'tăng 1 mỗi lần chủ sân đổi QR; QR cũ mất hiệu lực ngay',
  CONSTRAINT FK_San_CoSo FOREIGN KEY (MaCoSo) REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  UNIQUE KEY UQ_San_Ten (MaCoSo, TenSan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. KhoaSan: khóa một khung giờ cụ thể của sân (sửa chữa, giải đấu...)
--    Không dùng cho khách đặt tại chỗ: trường hợp đó chủ sân tạo đơn (DatSan.Nguon = 'owner')
CREATE TABLE KhoaSan (
  MaKhoa      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaSan       INT UNSIGNED NOT NULL,
  NgayKhoa    DATE NOT NULL,
  GioBatDau   TIME NOT NULL,
  GioKetThuc  TIME NOT NULL,
  LyDo        VARCHAR(255) NULL,
  CONSTRAINT FK_KhoaSan_San FOREIGN KEY (MaSan) REFERENCES San(MaSan) ON DELETE CASCADE,
  CONSTRAINT CHK_KhoaSan_Gio CHECK (GioKetThuc > GioBatDau),
  KEY IDX_KhoaSan_Khung (MaSan, NgayKhoa, GioBatDau, GioKetThuc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. BangGia: bảng giá theo khung giờ / loại ngày / loại khách của cơ sở
--    LoaiKhach: walk_in = giá vãng lai (app khách dùng loại này); fixed = giá khách cố định
--    Giá đặt sân = tổng (số giờ thực tế rơi vào từng khung) x GiaMoiGio
CREATE TABLE BangGia (
  MaBangGia    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaCoSo       INT UNSIGNED NOT NULL,
  Thu          TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '1=Thứ 2 … 7=Chủ nhật; 0 = dòng chưa tách thứ (seed), sẽ được nhân ra 7 thứ',
  LoaiNgay     ENUM('weekday','weekend') NOT NULL COMMENT 'T2-T6 / T7-CN (suy ra từ Thu, giữ để tương thích)',
  LoaiKhach    ENUM('walk_in','fixed') NOT NULL DEFAULT 'walk_in',
  GioBatDau    TIME NOT NULL,
  GioKetThuc   TIME NOT NULL,
  GiaMoiGio    DECIMAL(12,0) NOT NULL,
  CONSTRAINT FK_BangGia_CoSo FOREIGN KEY (MaCoSo) REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  CONSTRAINT CHK_BangGia_Gio CHECK (GioKetThuc > GioBatDau),
  CONSTRAINT CHK_BangGia_Gia CHECK (GiaMoiGio >= 0),
  CONSTRAINT CHK_BangGia_Thu CHECK (Thu BETWEEN 0 AND 7),
  KEY IDX_BangGia_CoSo (MaCoSo),
  KEY IDX_BangGia_CoSo_Thu (MaCoSo, Thu, LoaiKhach)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. LichCoDinh: lịch đặt cố định do chủ sân tạo (khách đặt lặp lại theo các thứ trong tuần;
--    chọn đủ 7 thứ = mỗi ngày). Backend sinh sẵn các dòng DatSan cho từng buổi,
--    job nền sinh tiếp; mỗi dòng DatSan mang MaLichCoDinh
CREATE TABLE LichCoDinh (
  MaLichCoDinh   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaSan          INT UNSIGNED NOT NULL,
  MaKhachHang    INT UNSIGNED NULL COMMENT 'NULL nếu khách chưa có tài khoản',
  TenKhach       VARCHAR(100) NOT NULL,
  SoDienThoai    VARCHAR(20)  NOT NULL,
  CacThu         SET('T2','T3','T4','T5','T6','T7','CN') NOT NULL,
  NgayBatDau     DATE NOT NULL,
  NgayKetThuc    DATE NULL COMMENT 'NULL = không giới hạn',
  GioBatDau      TIME NOT NULL,
  GioKetThuc     TIME NOT NULL,
  SoPhut         SMALLINT UNSIGNED NOT NULL,
  DonGiaMoiBuoi  DECIMAL(12,0) NOT NULL COMMENT 'giá mỗi buổi, tính từ BangGia loại fixed',
  GhiChu         VARCHAR(500) NULL,
  TrangThai      ENUM('active','ended','cancelled') NOT NULL DEFAULT 'active',
  MaNguoiTao     INT UNSIGNED NOT NULL,
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_LichCoDinh_San       FOREIGN KEY (MaSan)       REFERENCES San(MaSan),
  CONSTRAINT FK_LichCoDinh_KhachHang FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_LichCoDinh_NguoiTao  FOREIGN KEY (MaNguoiTao)  REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT CHK_LichCoDinh_Gio      CHECK (GioKetThuc > GioBatDau),
  KEY IDX_LichCoDinh_San (MaSan, TrangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. DatSan: lượt đặt sân
--     Nguon = 'app': khách đặt qua app, thanh toán QR vào TK hệ thống (có ThanhToan)
--     Nguon = 'owner': chủ sân tạo cho khách đặt tại chỗ / khách cố định (MaKhachHang có thể NULL)
--     Chủ sân được ưu tiên: hủy đơn app (NguoiHuy = 'owner', hoàn 100%) rồi tạo đơn của mình
CREATE TABLE DatSan (
  MaDatSan            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDon               VARCHAR(20) NOT NULL COMMENT 'mã đơn hiển thị, vd BK20261026001',
  MaKhachHang         INT UNSIGNED NULL COMMENT 'NULL = khách vãng lai do chủ sân tạo',
  TenKhach            VARCHAR(100) NOT NULL COMMENT 'lưu cứng tên khách tại thời điểm đặt, dùng để tìm kiếm',
  SoDienThoaiLienHe   VARCHAR(20) NOT NULL COMMENT 'SĐT khách nhập cho lần đặt này',
  GhiChu              VARCHAR(500) NULL COMMENT 'ghi chú cho sân',
  Nguon               ENUM('app','owner') NOT NULL DEFAULT 'app',
  LoaiKhach           ENUM('walk_in','fixed') NOT NULL DEFAULT 'walk_in',
  MaLichCoDinh        INT UNSIGNED NULL COMMENT 'có giá trị nếu đơn sinh từ lịch cố định',
  MaNhomDat           INT UNSIGNED NULL COMMENT 'nhóm đặt (đơn tổng) = MaDatSan của đơn con đầu nhóm; đơn lẻ = chính MaDatSan',
  MaSan               INT UNSIGNED NOT NULL,
  NgayChoi            DATE NOT NULL,
  GioBatDau           TIME NOT NULL,
  GioKetThuc          TIME NOT NULL,
  SoPhut              SMALLINT UNSIGNED NOT NULL COMMENT 'tối thiểu theo CoSo.SoPhutDatToiThieu (backend kiểm tra), bước 30',
  TongTien            DECIMAL(12,0) NOT NULL COMMENT 'tiền khách trả, lưu cứng',
  PhiNenTang          DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT 'hoa hồng hệ thống, lưu cứng (đơn owner = 0)',
  TienChuSan          DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT '= TongTien - PhiNenTang',
  TrangThaiThu        ENUM('unpaid','paid') NULL COMMENT 'chỉ dùng cho đơn Nguon = owner (công nợ khách); NULL với đơn app',
  NgayThu             DATETIME NULL,
  TrangThai           ENUM('pending_payment','confirmed','checked_in','completed','cancelled','expired')
                      NOT NULL DEFAULT 'pending_payment',
  HetHanGiuCho        DATETIME NULL COMMENT 'hết hạn giữ chỗ (tạo + 10 phút), chỉ đơn app',
  NguoiHuy            ENUM('customer','owner','system') NULL,
  LyDoHuy             VARCHAR(255) NULL,
  NgayHuy             DATETIME NULL,
  NgayTao             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_DatSan_KhachHang  FOREIGN KEY (MaKhachHang)     REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_DatSan_San        FOREIGN KEY (MaSan)           REFERENCES San(MaSan),
  CONSTRAINT FK_DatSan_LichCoDinh FOREIGN KEY (MaLichCoDinh)    REFERENCES LichCoDinh(MaLichCoDinh),
  CONSTRAINT CHK_DatSan_Gio       CHECK (GioKetThuc > GioBatDau),
  CONSTRAINT CHK_DatSan_SoPhut    CHECK (SoPhut >= 30),
  UNIQUE KEY UQ_DatSan_MaDon (MaDon),
  KEY IDX_DatSan_KhachHang (MaKhachHang, TrangThai),
  KEY IDX_DatSan_LichCoDinh (MaLichCoDinh),
  KEY IDX_DatSan_NhomDat (MaNhomDat),
  KEY IDX_DatSan_Khung (MaSan, NgayChoi, GioBatDau, GioKetThuc),  -- kiểm tra trùng lịch
  KEY IDX_DatSan_GiuCho (TrangThai, HetHanGiuCho)                 -- job quét hết hạn giữ chỗ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. ThanhToan: thanh toán QR vào TK hệ thống, khách gửi ảnh, chủ sân xác nhận + hoàn tiền cho khách (gộp cho đơn giản)
--     TrangThai = trạng thái THANH TOÁN; TrangThaiHoanTien = trạng thái HOÀN TIỀN
--     pending: chờ khách chuyển khoản + gửi ảnh | confirming: khách đã gửi ảnh, ĐỢI CHỦ SÂN XÁC NHẬN
--     success: chủ sân đã xác nhận | late_payment: hết hạn giữ chỗ khi chủ sân chưa xác nhận, chờ admin duyệt hoàn
--     waiting_info: đã duyệt hoàn nhưng chờ khách nhập tài khoản nhận hoàn
--     Chỉ có dòng ThanhToan cho đơn Nguon = 'app'
CREATE TABLE ThanhToan (
  MaThanhToan           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan              INT UNSIGNED NOT NULL,
  SoTien                DECIMAL(12,0) NOT NULL,
  TrangThai             ENUM('pending','confirming','success','failed','expired','late_payment')
                        NOT NULL DEFAULT 'pending',
  NoiDungChuyenKhoan    VARCHAR(100) NULL COMMENT 'nội dung chuyển khoản để đối chiếu (dùng MaDon)',
  LyDoLoi               VARCHAR(255) NULL COMMENT 'lý do chủ sân từ chối ảnh / ghi chú khi xét',
  AnhChuyenKhoan        VARCHAR(255) NULL COMMENT 'đường dẫn tương đối ảnh chuyển khoản khách gửi: /tep-tai-len/<ms>-<hex>.<đuôi> (nằm ở gốc uploads/)',
  NgayGuiAnh            DATETIME NULL,
  HanXacNhan            DATETIME NULL COMMENT 'hạn chủ sân/Admin xác nhận sau khi khách gửi ảnh (G2); quá hạn không tự nhả slot',
  MaNguoiXacNhan        INT UNSIGNED NULL COMMENT 'chủ sân hoặc admin đã xác nhận thanh toán',
  VaiTroXacNhan         ENUM('owner','admin') NULL,
  NgayThanhToan         DATETIME NULL COMMENT 'thời điểm chủ sân xác nhận',
  TrangThaiHoanTien     ENUM('none','waiting_info','processing','refunded','received','failed') NOT NULL DEFAULT 'none',
  SoTienHoan            DECIMAL(12,0) NOT NULL DEFAULT 0,
  MaGiaoDichHoan        VARCHAR(100) NULL COMMENT 'mã giao dịch hoàn do admin nhập',
  NgayHoan              DATETIME NULL,
  TenNganHangHoan       VARCHAR(100) NULL COMMENT 'TK nhận hoàn (lấy từ giao dịch hoặc khách nhập)',
  MaNganHangHoan        VARCHAR(20)  NULL,
  SoTaiKhoanHoan        VARCHAR(30)  NULL,
  ChuTaiKhoanHoan       VARCHAR(100) NULL,
  MaQuanTriDuyetHoan    INT UNSIGNED NULL COMMENT 'admin duyệt hoàn',
  NgayTao               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_ThanhToan_DatSan  FOREIGN KEY (MaDatSan)           REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_ThanhToan_QuanTri FOREIGN KEY (MaQuanTriDuyetHoan) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_ThanhToan_NguoiXN FOREIGN KEY (MaNguoiXacNhan)     REFERENCES NguoiDung(MaNguoiDung),
  KEY IDX_ThanhToan_DatSan (MaDatSan),
  KEY IDX_ThanhToan_TrangThai (TrangThai),
  KEY IDX_ThanhToan_HoanTien (TrangThaiHoanTien)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11a. HoanTien (G4): mỗi khoản hoàn = 1 dòng. Chứng từ hoàn = ảnh chuyển khoản (AnhChungTu), không dùng mã giao dịch.
--      waiting_info → processing → refunded → received | not_received | escalated. Cột hoàn cũ trong ThanhToan được ghi đồng bộ.
CREATE TABLE HoanTien (
  MaHoanTien        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaThanhToan       INT UNSIGNED NOT NULL,
  MaDatSan          INT UNSIGNED NOT NULL COMMENT 'đơn gây ra khoản hoàn (đơn khách bấm hủy / đơn bị chủ sân hủy)',
  Loai              ENUM('cancel','owner_cancel','closure','incident','overpay','late_proof') NOT NULL,
  LyDo              VARCHAR(255) NULL,
  TyLe              TINYINT UNSIGNED NULL COMMENT 'phần trăm hoàn (100/50/0...)',
  SoTien            DECIMAL(12,0) NOT NULL,
  TrangThai         ENUM('waiting_info','processing','refunded','received','not_received','escalated') NOT NULL,
  TenNganHang       VARCHAR(100) NULL,
  MaNganHang        VARCHAR(20)  NULL,
  SoTaiKhoan        VARCHAR(30)  NULL,
  ChuTaiKhoan       VARCHAR(100) NULL,
  HanHoan           DATETIME NULL COMMENT 'hạn chuyển hoàn = lúc tạo + refund_deadline_hours (giờ máy chủ)',
  AnhChungTu        VARCHAR(255) NULL COMMENT 'ảnh chuyển khoản hoàn (bắt buộc khi đánh dấu đã hoàn): /tep-tai-len/<tên>',
  MaNguoiHoan       INT UNSIGNED NULL COMMENT 'chủ sân hoặc Admin bấm đã hoàn',
  VaiTroHoan        ENUM('owner','admin') NULL,
  NgayHoan          DATETIME NULL,
  NgayKhachXacNhan  DATETIME NULL,
  SoLanChuaNhan     TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'số lần khách bấm chưa nhận được',
  GhiChuKhach       VARCHAR(255) NULL,
  NgayNhacHan       DATETIME NULL COMMENT 'đã nhắc chủ sân quá hạn lúc nào (nhắc 1 lần)',
  NgayLeoThang      DATETIME NULL,
  NgayTao           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_HoanTien_ThanhToan FOREIGN KEY (MaThanhToan) REFERENCES ThanhToan(MaThanhToan),
  CONSTRAINT FK_HoanTien_DatSan    FOREIGN KEY (MaDatSan)    REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_HoanTien_NguoiHoan FOREIGN KEY (MaNguoiHoan) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  KEY IDX_HT_ThanhToan (MaThanhToan),
  KEY IDX_HT_TrangThai (TrangThai, HanHoan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 11b. ChungTuThanhToan: mỗi lần khách gửi ảnh chuyển khoản = 1 dòng (không xoá ảnh cũ). MaBamAnh = SHA-256 nội dung ảnh;
--      trùng hash với đơn khác chỉ là cảnh báo cho chủ sân/Admin, không tự từ chối (G2)
CREATE TABLE ChungTuThanhToan (
  MaChungTu       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaThanhToan     INT UNSIGNED NOT NULL,
  Loai            ENUM('main','topup','overpay','deducted','late','refund') NOT NULL DEFAULT 'main',
  SoTien          DECIMAL(12,0) NULL COMMENT 'số tiền khách phải chuyển của lần gửi này (backend lấy từ đơn, không nhận từ client)',
  ThoiDiemChuyen  DATETIME NULL COMMENT 'giờ chuyển khoản trên biên lai/sao kê (khách nhập, tuỳ chọn, ≤ giờ máy chủ)',
  NgayGui         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Anh             VARCHAR(255) NOT NULL COMMENT 'đường dẫn tương đối /tep-tai-len/<tên file>',
  MaBamAnh        CHAR(64) NOT NULL COMMENT 'SHA-256 nội dung ảnh',
  KetQua          ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  MaNguoiDuyet    INT UNSIGNED NULL,
  VaiTroDuyet     ENUM('owner','admin') NULL,
  NgayDuyet       DATETIME NULL,
  LyDo            VARCHAR(255) NULL COMMENT 'lý do từ chối',
  CONSTRAINT FK_ChungTu_ThanhToan  FOREIGN KEY (MaThanhToan)  REFERENCES ThanhToan(MaThanhToan),
  CONSTRAINT FK_ChungTu_NguoiDuyet FOREIGN KEY (MaNguoiDuyet) REFERENCES NguoiDung(MaNguoiDung),
  KEY IDX_ChungTu_ThanhToan (MaThanhToan),
  KEY IDX_ChungTu_Bam (MaBamAnh)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. DanhGia: đánh giá sau khi chơi, mỗi đơn đặt tối đa 1 đánh giá
CREATE TABLE DanhGia (
  MaDanhGia      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan       INT UNSIGNED NOT NULL,
  MaKhachHang    INT UNSIGNED NOT NULL,
  MaCoSo         INT UNSIGNED NOT NULL,
  SoSao          TINYINT UNSIGNED NOT NULL,
  NoiDung        VARCHAR(1000) NULL,
  BiAn           TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'admin ẩn đánh giá vi phạm',
  PhanHoiChuSan  VARCHAR(1000) NULL COMMENT '(tùy chọn) phản hồi của chủ sân',
  NgayPhanHoi    DATETIME NULL,
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_DanhGia_DatSan    FOREIGN KEY (MaDatSan)    REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_DanhGia_KhachHang FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_DanhGia_CoSo      FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  CONSTRAINT CHK_DanhGia_SoSao    CHECK (SoSao BETWEEN 1 AND 5),
  UNIQUE KEY UQ_DanhGia_DatSan (MaDatSan),
  KEY IDX_DanhGia_CoSo (MaCoSo, NgayTao),
  KEY IDX_DanhGia_BiAn (MaCoSo, BiAn, NgayTao)  -- điểm trung bình + danh sách công khai chỉ lấy BiAn=0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13. YeuThich: cơ sở yêu thích (khóa chính kép)
CREATE TABLE YeuThich (
  MaKhachHang  INT UNSIGNED NOT NULL,
  MaCoSo       INT UNSIGNED NOT NULL,
  NgayTao      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (MaKhachHang, MaCoSo),
  CONSTRAINT FK_YeuThich_KhachHang FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE,
  CONSTRAINT FK_YeuThich_CoSo      FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13b. KhieuNai: khách khiếu nại chủ sân (nút "Khiếu nại chủ sân" cạnh thanh toán thành công / hủy / sau hủy)
--      Admin đọc và quyết định: upheld (khiếu nại đúng) -> cộng 1 lần vi phạm cho chủ sân;
--      rejected (không hợp lệ) -> không tính. Tích lũy upheld: 1 = cảnh cáo, 2 = cảnh cáo nghiêm trọng
--      (sắp bị khóa), 3 = khóa tài khoản chủ sân. Mỗi đơn chỉ khiếu nại một lần.
CREATE TABLE KhieuNai (
  MaKhieuNai     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan       INT UNSIGNED NOT NULL,
  MaKhachHang    INT UNSIGNED NOT NULL,
  MaChuSan       INT UNSIGNED NOT NULL,
  MaCoSo         INT UNSIGNED NOT NULL,
  GiaiDoan       ENUM('after_payment','at_cancel','after_cancel') NOT NULL COMMENT 'khách bấm khiếu nại ở màn nào',
  NoiDung        VARCHAR(1000) NOT NULL,
  TrangThai      ENUM('pending','upheld','rejected') NOT NULL DEFAULT 'pending',
  GhiChuQuanTri  VARCHAR(500) NULL,
  MucXuLy        ENUM('none','warning','severe_warning','banned') NOT NULL DEFAULT 'none',
  MaQuanTri      INT UNSIGNED NULL,
  NgayXuLy       DATETIME NULL,
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_KhieuNai_DatSan   FOREIGN KEY (MaDatSan)    REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_KhieuNai_Khach    FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_ChuSan   FOREIGN KEY (MaChuSan)    REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_CoSo     FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  CONSTRAINT FK_KhieuNai_QuanTri  FOREIGN KEY (MaQuanTri)   REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_KhieuNai_DatSan (MaDatSan),
  KEY IDX_KhieuNai_TrangThai (TrangThai, NgayTao),
  KEY IDX_KhieuNai_ChuSan (MaChuSan, TrangThai),
  KEY IDX_KhieuNai_Khach (MaKhachHang, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- G3. QR check-in: LichSuQrSan (lịch sử đổi QR của sân) + CheckIn (mỗi đơn con tối đa 1 lần)
--     CheckIn.PhuongThuc: qr = khách quét QR tại sân; manual = chủ sân check-in thủ công (ghi người + lý do)
CREATE TABLE LichSuQrSan (
  MaLichSu     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaSan        INT UNSIGNED NOT NULL,
  PhienBan     INT UNSIGNED NOT NULL COMMENT 'phiên bản QR được tạo ở lần này',
  MaNguoiDoi   INT UNSIGNED NULL,
  NgayDoi      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_LichSuQr_San FOREIGN KEY (MaSan) REFERENCES San(MaSan) ON DELETE CASCADE,
  CONSTRAINT FK_LichSuQr_NguoiDoi FOREIGN KEY (MaNguoiDoi) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  KEY IDX_LichSuQr_San (MaSan, NgayDoi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE CheckIn (
  MaCheckIn       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan        INT UNSIGNED NOT NULL,
  MaKhachHang     INT UNSIGNED NULL COMMENT 'NULL với đơn khách vãng lai do chủ sân tạo',
  MaSan           INT UNSIGNED NOT NULL,
  ThoiDiem        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'giờ máy chủ, không lấy giờ thiết bị',
  PhuongThuc      ENUM('qr','manual') NOT NULL,
  PhienBanToken   INT UNSIGNED NULL,
  ViDo            DECIMAL(9,6) NULL,
  KinhDo          DECIMAL(9,6) NULL,
  MaNguoiXacNhan  INT UNSIGNED NULL COMMENT 'chủ sân bấm check-in thủ công',
  LyDo            VARCHAR(255) NULL COMMENT 'lý do check-in thủ công (QR lỗi, mất mạng, hết pin...)',
  CONSTRAINT FK_CheckIn_DatSan FOREIGN KEY (MaDatSan) REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_CheckIn_Khach FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_CheckIn_San FOREIGN KEY (MaSan) REFERENCES San(MaSan),
  CONSTRAINT FK_CheckIn_NguoiXN FOREIGN KEY (MaNguoiXacNhan) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  UNIQUE KEY UQ_CheckIn_DatSan (MaDatSan),
  KEY IDX_CheckIn_San (MaSan, ThoiDiem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14. ThongBao: thông báo cho khách, chủ sân và admin
--     KhoaChongTrung UNIQUE để chống gửi trùng
CREATE TABLE ThongBao (
  MaThongBao      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaNguoiDung     INT UNSIGNED NOT NULL,
  Loai            ENUM('booking_created','payment_success','payment_failed',
                       'booking_cancelled','new_booking_for_owner','system',
                       'refund_requested','refund_completed','complaint_received',
                       'complaint_resolved','owner_warning','owner_banned',
                       'review_received','review_replied','review_hidden','review_sent',
                       'review_reminder',
                       'refund_reminder','refund_escalated','refund_received','refund_not_received')
                  NOT NULL,
  TieuDe          VARCHAR(150) NOT NULL,
  NoiDung         VARCHAR(500) NOT NULL,
  LoaiThamChieu   ENUM('booking','payment','venue','complaint') NULL COMMENT 'để app/web điều hướng khi bấm vào',
  MaThamChieu     INT UNSIGNED NULL,
  DaDoc           TINYINT(1) NOT NULL DEFAULT 0,
  KhoaChongTrung  VARCHAR(100) NULL,
  NgayTao         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_ThongBao_NguoiDung FOREIGN KEY (MaNguoiDung) REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE,
  UNIQUE KEY UQ_ThongBao_ChongTrung (KhoaChongTrung),
  KEY IDX_ThongBao_NguoiDung (MaNguoiDung, DaDoc, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16. CauHinhHeThong: tham số cấu hình admin chỉnh trên web
CREATE TABLE CauHinhHeThong (
  KhoaCauHinh  VARCHAR(50) PRIMARY KEY,
  GiaTri       VARCHAR(255) NOT NULL,
  MoTa         VARCHAR(255) NULL,
  NgayCapNhat  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 17. NhatKyHeThong: nhật ký thao tác của admin / chủ sân với các việc nhạy cảm
--     vd HanhDong: duyet_chu_san, tu_choi_chu_san, khoa_co_so, khoa_tai_khoan, an_danh_gia,
--                  duyet_hoan_tien, huy_don_uu_tien
CREATE TABLE NhatKyHeThong (
  MaNhatKy          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaNguoiThucHien   INT UNSIGNED NULL,
  HanhDong          VARCHAR(50) NOT NULL,
  DoiTuong          VARCHAR(30) NOT NULL COMMENT 'tên bảng bị tác động, vd DatSan, CoSo, NguoiDung',
  MaDoiTuong        INT UNSIGNED NULL,
  ChiTiet           VARCHAR(500) NULL,
  DuLieuTruoc       TEXT NULL COMMENT 'dữ liệu trước khi đổi (JSON dạng chuỗi)',
  DuLieuSau         TEXT NULL COMMENT 'dữ liệu sau khi đổi (JSON dạng chuỗi)',
  NgayTao           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_NhatKy_NguoiThucHien FOREIGN KEY (MaNguoiThucHien) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  KEY IDX_NhatKy_DoiTuong (DoiTuong, MaDoiTuong),
  KEY IDX_NhatKy_NguoiThucHien (MaNguoiThucHien, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
