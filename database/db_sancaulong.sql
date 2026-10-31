-- =====================================================================
SET NAMES utf8mb4;
-- HỆ THỐNG ĐẶT SÂN CẦU LÔNG - SCHEMA HOÀN CHỈNH (khách + chủ sân + admin)
-- Quy ước: tên bảng, tên cột viết tiếng Việt không dấu, viết hoa chữ cái đầu mỗi từ (PascalCase)
-- Giá trị ENUM và khóa trong CauHinhHeThong giữ nguyên tiếng Anh
-- Yêu cầu: MySQL 8.0.16+ (để CHECK có hiệu lực)
-- =====================================================================
CREATE DATABASE IF NOT EXISTS db_sancaulong
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_sancaulong;

-- ---------------------------------------------------------------------
-- 1. NguoiDung: dùng chung cho khách / chủ sân / admin, phân biệt bằng VaiTro
--    (VaiTro do backend gán, KHÔNG nhận từ client)
--    TenDangNhap: dùng cho chủ sân đăng nhập web; khách mobile dùng Email (cột này có thể NULL)
CREATE TABLE NguoiDung (
  MaNguoiDung   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  TenDangNhap   VARCHAR(50)  NULL,
  HoTen         VARCHAR(100) NOT NULL,
  Email         VARCHAR(150) NOT NULL,
  SoDienThoai   VARCHAR(20),
  MatKhauMaHoa  VARCHAR(255) NOT NULL,
  AnhDaiDien    VARCHAR(500),
  VaiTro        ENUM('customer','owner','admin') NOT NULL DEFAULT 'customer',
  TrangThai     ENUM('active','locked') NOT NULL DEFAULT 'active',
  LyDoKhoa      VARCHAR(255) NULL COMMENT 'admin ghi khi khóa tài khoản',
  NgayTao       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY UQ_NguoiDung_Email (Email),
  UNIQUE KEY UQ_NguoiDung_TenDangNhap (TenDangNhap),
  KEY IDX_NguoiDung_VaiTro (VaiTro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. HoSoChuSan: thông tin riêng của chủ sân (1-1 với NguoiDung có VaiTro = owner)
--    TrangThaiDuyet: draft (đang điền form) -> pending (chờ admin duyệt, tối đa 3 ngày)
--                    -> approved / rejected (từ chối thì sửa và gửi lại về pending)
--    Thông tin ngân hàng là tài khoản nhận tiền khi rút
CREATE TABLE HoSoChuSan (
  MaNguoiDung     INT UNSIGNED PRIMARY KEY,
  TenDoanhNghiep  VARCHAR(150) NULL,
  TenNganHang     VARCHAR(100) NULL COMMENT 'tài khoản NHẬN tiền rút; bắt buộc điền trước khi gửi duyệt',
  MaNganHang      VARCHAR(20)  NULL COMMENT 'mã ngân hàng (BIN)',
  SoTaiKhoan      VARCHAR(30)  NULL,
  ChuTaiKhoan     VARCHAR(100) NULL,
  TrangThaiDuyet  ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
  NgayGuiDuyet    DATETIME NULL,
  NgayDuyet       DATETIME NULL,
  MaQuanTriDuyet  INT UNSIGNED NULL COMMENT 'admin duyệt hoặc từ chối',
  LyDoTuChoi      VARCHAR(255) NULL,
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
  SoDienThoai        VARCHAR(20)  NULL COMMENT 'SĐT liên hệ riêng của cơ sở',
  Zalo               VARCHAR(100) NULL COMMENT 'số Zalo hoặc link zalo.me/...',
  LinkBanDo          VARCHAR(500) NULL COMMENT 'link Google Map; NULL thì app tự tạo từ ViDo/KinhDo',
  TinhThanh          VARCHAR(80)  NOT NULL,
  QuanHuyen          VARCHAR(80)  NOT NULL,
  ViDo               DECIMAL(9,6),
  KinhDo             DECIMAL(9,6),
  MoTa               TEXT,
  TienIch            JSON NULL COMMENT 'vd: ["parking","toilet","locker_room"]',
  GioMoCua           TIME NOT NULL DEFAULT '06:00:00',
  GioDongCua         TIME NOT NULL DEFAULT '22:00:00',
  SoPhutDatToiThieu  SMALLINT UNSIGNED NOT NULL DEFAULT 60 COMMENT 'thời gian đặt tối thiểu do chủ sân chọn',
  GiaThapNhat        DECIMAL(12,0) NULL COMMENT 'giá vãng lai thấp nhất, cập nhật khi lưu bảng giá',
  TrangThai          ENUM('active','hidden','locked') NOT NULL DEFAULT 'hidden'
                     COMMENT 'hidden: đang soạn/tạm ẩn/chờ duyệt; locked: admin khóa',
  LyDoKhoa           VARCHAR(255) NULL COMMENT 'admin ghi khi khóa cơ sở',
  DiemTrungBinh      DECIMAL(2,1) NOT NULL DEFAULT 0.0 COMMENT 'cập nhật khi có đánh giá mới',
  SoDanhGia          INT UNSIGNED NOT NULL DEFAULT 0,
  NgayTao            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_CoSo_ChuSan FOREIGN KEY (MaChuSan) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT CHK_CoSo_Gio CHECK (GioDongCua > GioMoCua),
  CONSTRAINT CHK_CoSo_SoPhutToiThieu CHECK (SoPhutDatToiThieu >= 30),
  KEY IDX_CoSo_ChuSan (MaChuSan),
  KEY IDX_CoSo_KhuVuc (TinhThanh, QuanHuyen),
  KEY IDX_CoSo_TrangThai (TrangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. AnhCoSo: ảnh của cơ sở (gallery vuốt ngang)
CREATE TABLE AnhCoSo (
  MaAnh      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaCoSo     INT UNSIGNED NOT NULL,
  DuongDan   VARCHAR(500) NOT NULL,
  LaAnhBia   TINYINT(1) NOT NULL DEFAULT 0,
  ThuTu      INT NOT NULL DEFAULT 0,
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
  TrangThai  ENUM('active','maintenance') NOT NULL DEFAULT 'active',
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
  TenKhungGia  VARCHAR(50) NOT NULL DEFAULT 'Giá tiêu chuẩn' COMMENT 'Thấp điểm, Cao điểm...',
  LoaiNgay     ENUM('weekday','weekend') NOT NULL COMMENT 'T2-T6 / T7-CN',
  LoaiKhach    ENUM('walk_in','fixed') NOT NULL DEFAULT 'walk_in',
  GioBatDau    TIME NOT NULL,
  GioKetThuc   TIME NOT NULL,
  GiaMoiGio    DECIMAL(12,0) NOT NULL,
  CONSTRAINT FK_BangGia_CoSo FOREIGN KEY (MaCoSo) REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  CONSTRAINT CHK_BangGia_Gio CHECK (GioKetThuc > GioBatDau),
  CONSTRAINT CHK_BangGia_Gia CHECK (GiaMoiGio >= 0),
  KEY IDX_BangGia_CoSo (MaCoSo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. YeuCauRutTien: yêu cầu rút tiền của chủ sân (admin chuyển khoản thủ công)
--    Tài khoản nhận được CHỤP LẠI tại thời điểm rút
--    Chỉ đơn DatSan có Nguon = 'app' và TrangThai = 'completed' mới được đưa vào yêu cầu rút
CREATE TABLE YeuCauRutTien (
  MaYeuCau          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaChuSan          INT UNSIGNED NOT NULL,
  SoTien            DECIMAL(12,0) NOT NULL,
  TrangThai         ENUM('pending','paid','rejected') NOT NULL DEFAULT 'pending',
  TenNganHang       VARCHAR(100) NOT NULL,
  MaNganHang        VARCHAR(20)  NOT NULL,
  SoTaiKhoan        VARCHAR(30)  NOT NULL,
  ChuTaiKhoan       VARCHAR(100) NOT NULL,
  NgayYeuCau        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MaQuanTriXuLy     INT UNSIGNED NULL COMMENT 'admin xử lý',
  NgayXuLy          DATETIME NULL,
  MaGiaoDich        VARCHAR(100) NULL,
  LyDoTuChoi        VARCHAR(255) NULL,
  CONSTRAINT FK_RutTien_ChuSan   FOREIGN KEY (MaChuSan)      REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_RutTien_QuanTri  FOREIGN KEY (MaQuanTriXuLy) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT CHK_RutTien_SoTien  CHECK (SoTien > 0),
  KEY IDX_RutTien_ChuSan (MaChuSan, TrangThai),
  KEY IDX_RutTien_TrangThai (TrangThai)
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
  TrangThai           ENUM('pending_payment','confirmed','completed','cancelled','expired')
                      NOT NULL DEFAULT 'pending_payment',
  HetHanGiuCho        DATETIME NULL COMMENT 'hết hạn giữ chỗ (tạo + 10 phút), chỉ đơn app',
  NguoiHuy            ENUM('customer','owner','system') NULL,
  LyDoHuy             VARCHAR(255) NULL,
  NgayHuy             DATETIME NULL,
  MaYeuCauRutTien     INT UNSIGNED NULL COMMENT 'NULL = chưa rút tiền',
  NgayTao             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_DatSan_RutTien    FOREIGN KEY (MaYeuCauRutTien) REFERENCES YeuCauRutTien(MaYeuCau),
  CONSTRAINT FK_DatSan_KhachHang  FOREIGN KEY (MaKhachHang)     REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_DatSan_San        FOREIGN KEY (MaSan)           REFERENCES San(MaSan),
  CONSTRAINT FK_DatSan_LichCoDinh FOREIGN KEY (MaLichCoDinh)    REFERENCES LichCoDinh(MaLichCoDinh),
  CONSTRAINT CHK_DatSan_Gio       CHECK (GioKetThuc > GioBatDau),
  CONSTRAINT CHK_DatSan_SoPhut    CHECK (SoPhut >= 30),
  UNIQUE KEY UQ_DatSan_MaDon (MaDon),
  KEY IDX_DatSan_KhachHang (MaKhachHang, TrangThai),
  KEY IDX_DatSan_RutTien (MaYeuCauRutTien),
  KEY IDX_DatSan_LichCoDinh (MaLichCoDinh),
  KEY IDX_DatSan_Khung (MaSan, NgayChoi, GioBatDau, GioKetThuc),  -- kiểm tra trùng lịch
  KEY IDX_DatSan_GiuCho (TrangThai, HetHanGiuCho)                 -- job quét hết hạn giữ chỗ
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. ThanhToan: thanh toán QR vào TK hệ thống + hoàn tiền cho khách (gộp cho đơn giản)
--     TrangThai = trạng thái THANH TOÁN; TrangThaiHoanTien = trạng thái HOÀN TIỀN
--     late_payment: tiền về sau khi QR hết hạn, chờ admin duyệt hoàn
--     waiting_info: đã duyệt hoàn nhưng chờ khách nhập tài khoản nhận hoàn
--     Chỉ có dòng ThanhToan cho đơn Nguon = 'app'
CREATE TABLE ThanhToan (
  MaThanhToan           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDatSan              INT UNSIGNED NOT NULL,
  SoTien                DECIMAL(12,0) NOT NULL,
  PhuongThuc            ENUM('bank_qr') NOT NULL DEFAULT 'bank_qr',
  TrangThai             ENUM('pending','confirming','success','failed','expired','late_payment')
                        NOT NULL DEFAULT 'pending',
  NoiDungChuyenKhoan    VARCHAR(100) NULL COMMENT 'nội dung chuyển khoản để đối chiếu (dùng MaDon)',
  NoiDungQR             TEXT NULL,
  MaGiaoDichNganHang    VARCHAR(100) NULL COMMENT 'mã giao dịch từ ngân hàng/cổng thanh toán',
  LinkAnhChuyenKhoan    VARCHAR(500) NULL COMMENT 'ảnh khách đính kèm sau khi chuyển',
  NgayTaiAnh            DATETIME NULL,
  LyDoLoi               VARCHAR(255) NULL COMMENT 'lý do lỗi / admin ghi chú khi xét',
  NgayThanhToan         DATETIME NULL,
  TrangThaiHoanTien     ENUM('none','waiting_info','processing','refunded','failed') NOT NULL DEFAULT 'none',
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
  KEY IDX_ThanhToan_DatSan (MaDatSan),
  KEY IDX_ThanhToan_TrangThai (TrangThai),
  KEY IDX_ThanhToan_HoanTien (TrangThaiHoanTien)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GiaoDichSePay: lưu webhook theo ID giao dịch để chống SePay gửi lặp.
CREATE TABLE GiaoDichSePay (
  MaGiaoDichSePay     BIGINT UNSIGNED PRIMARY KEY,
  MaThanhToan         INT UNSIGNED NULL,
  MaGiaoDichNganHang  VARCHAR(100) NULL,
  SoTaiKhoan          VARCHAR(30) NULL,
  LoaiGiaoDich        ENUM('in','out') NOT NULL,
  SoTien              DECIMAL(12,0) NOT NULL,
  NoiDung             VARCHAR(500) NULL,
  MaDoiSoat           VARCHAR(100) NULL,
  NgayGiaoDich        DATETIME NULL,
  TrangThaiDoiSoat    ENUM('matched','unmatched','amount_mismatch','late') NOT NULL DEFAULT 'unmatched',
  DuLieuWebhook       JSON NOT NULL,
  NgayNhan             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_GiaoDichSePay_ThanhToan FOREIGN KEY (MaThanhToan)
    REFERENCES ThanhToan(MaThanhToan) ON DELETE SET NULL,
  KEY IDX_GiaoDichSePay_ThanhToan (MaThanhToan),
  KEY IDX_GiaoDichSePay_TrangThai (TrangThaiDoiSoat, NgayNhan)
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
  KEY IDX_DanhGia_CoSo (MaCoSo, NgayTao)
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
-- 14. ThongBao: thông báo cho khách, chủ sân và admin
--     KhoaChongTrung UNIQUE để chống gửi trùng
CREATE TABLE ThongBao (
  MaThongBao      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaNguoiDung     INT UNSIGNED NOT NULL,
  Loai            ENUM('booking_created','payment_success','payment_failed','hold_expiring',
                       'booking_cancelled','reminder','refund','new_booking_for_owner',
                       'payout_paid','payout_rejected','venue_locked','system','late_payment',
                       'owner_submitted','owner_approved','owner_rejected')
                  NOT NULL,
  TieuDe          VARCHAR(150) NOT NULL,
  NoiDung         VARCHAR(500) NOT NULL,
  LoaiThamChieu   ENUM('booking','payment','payout','venue','owner') NULL COMMENT 'để app/web điều hướng khi bấm vào',
  MaThamChieu     INT UNSIGNED NULL,
  DaDoc           TINYINT(1) NOT NULL DEFAULT 0,
  KhoaChongTrung  VARCHAR(100) NULL,
  NgayTao         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_ThongBao_NguoiDung FOREIGN KEY (MaNguoiDung) REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE,
  UNIQUE KEY UQ_ThongBao_ChongTrung (KhoaChongTrung),
  KEY IDX_ThongBao_NguoiDung (MaNguoiDung, DaDoc, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 15. ThietBi: token FCM để gửi push (khách dùng mobile)
CREATE TABLE ThietBi (
  MaThietBi    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaNguoiDung  INT UNSIGNED NOT NULL,
  TokenFcm     VARCHAR(255) NOT NULL,
  NenTang      ENUM('android','ios') NOT NULL,
  NgayCapNhat  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_ThietBi_NguoiDung FOREIGN KEY (MaNguoiDung) REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE,
  UNIQUE KEY UQ_ThietBi_Token (TokenFcm),
  KEY IDX_ThietBi_NguoiDung (MaNguoiDung)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16. CauHinhHeThong: tham số cấu hình admin chỉnh trên web
CREATE TABLE CauHinhHeThong (
  KhoaCauHinh  VARCHAR(50) PRIMARY KEY,
  GiaTri       VARCHAR(255) NOT NULL,
  MoTa         VARCHAR(255) NULL,
  NgayCapNhat  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO CauHinhHeThong (KhoaCauHinh, GiaTri, MoTa) VALUES
  ('commission_rate',          '10',     'Hoa hồng hệ thống (%) trên đơn app'),
  ('hold_minutes',             '10',     'Thời gian giữ chỗ (phút)'),
  ('min_payout',               '100000', 'Mức rút tối thiểu (đồng)'),
  ('cancel_free_hours',        '24',     'Khách hủy trước giờ chơi tối thiểu bao nhiêu giờ thì được hoàn 100%'),
  ('late_cancel_refund_percent','50',    'Tỷ lệ hoàn (%) khi khách hủy muộn hơn cancel_free_hours (chủ sân hủy luôn hoàn 100%)'),
  ('owner_approval_days',      '3',      'Số ngày cam kết duyệt hồ sơ chủ sân');

-- ---------------------------------------------------------------------
-- 17. NhatKyHeThong: nhật ký thao tác của admin / chủ sân với các việc nhạy cảm
--     vd HanhDong: duyet_chu_san, tu_choi_chu_san, khoa_co_so, khoa_tai_khoan, an_danh_gia,
--                  duyet_hoan_tien, xu_ly_rut_tien, huy_don_uu_tien
CREATE TABLE NhatKyHeThong (
  MaNhatKy          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaNguoiThucHien   INT UNSIGNED NULL,
  HanhDong          VARCHAR(50) NOT NULL,
  DoiTuong          VARCHAR(30) NOT NULL COMMENT 'tên bảng bị tác động, vd DatSan, CoSo, NguoiDung',
  MaDoiTuong        INT UNSIGNED NULL,
  ChiTiet           VARCHAR(500) NULL,
  NgayTao           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_NhatKy_NguoiThucHien FOREIGN KEY (MaNguoiThucHien) REFERENCES NguoiDung(MaNguoiDung) ON DELETE SET NULL,
  KEY IDX_NhatKy_DoiTuong (DoiTuong, MaDoiTuong),
  KEY IDX_NhatKy_NguoiThucHien (MaNguoiThucHien, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Seed: tài khoản admin (thay MatKhauMaHoa bằng hash bcrypt thật trước khi dùng)
-- ---------------------------------------------------------------------
INSERT INTO NguoiDung (TenDangNhap, HoTen, Email, MatKhauMaHoa, VaiTro)
VALUES ('admin', 'Quản trị viên', 'admin@badminton.local', 'CHANGE_ME_BCRYPT_HASH', 'admin');

-- ---------------------------------------------------------------------
-- TRUY VẤN GỢI Ý CHO CÁC HÀNG CHỜ (tham khảo, không chạy cùng file)
-- ---------------------------------------------------------------------
-- Hồ sơ chủ sân chờ duyệt:
--   SELECT * FROM HoSoChuSan WHERE TrangThaiDuyet = 'pending' ORDER BY NgayGuiDuyet;
-- Hàng chờ hoàn tiền của admin:
--   SELECT * FROM ThanhToan
--   WHERE (TrangThai = 'late_payment' AND TrangThaiHoanTien = 'none')
--      OR TrangThaiHoanTien IN ('waiting_info','processing');
-- Yêu cầu rút tiền chờ xử lý:
--   SELECT * FROM YeuCauRutTien WHERE TrangThai = 'pending' ORDER BY NgayYeuCau;
-- Tiền chủ sân có thể rút:
--   SELECT SUM(d.TienChuSan) FROM DatSan d
--   JOIN San s ON s.MaSan = d.MaSan JOIN CoSo c ON c.MaCoSo = s.MaCoSo
--   WHERE c.MaChuSan = ? AND d.Nguon = 'app' AND d.TrangThai = 'completed' AND d.MaYeuCauRutTien IS NULL;

-- =====================================================================
-- SEED DATA - HỆ THỐNG ĐẶT SÂN CẦU LÔNG
-- Chạy SAU khi đã import db_sancaulong.sql (schema đã tự tạo admin MaNguoiDung = 1)
-- Không seed: ThanhToan, GiaoDichSePay (theo yêu cầu)
-- Mật khẩu mọi tài khoản demo: "password"
--   (bcrypt hash dưới đây là hash phổ biến của chuỗi "password", chỉ dùng để dev/test)
-- Ngày "hiện tại" của dữ liệu mẫu: 2026-10-31 (thứ Bảy)
-- =====================================================================
SET NAMES utf8mb4;
USE db_sancaulong;

-- Cập nhật mật khẩu admin (seed trong schema đang là CHANGE_ME_BCRYPT_HASH)
UPDATE NguoiDung
SET MatKhauMaHoa = '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni'
WHERE MaNguoiDung = 1;

-- ---------------------------------------------------------------------
-- 1. NguoiDung: 4 chủ sân (id 2-5) + 6 khách (id 6-11)
-- ---------------------------------------------------------------------
INSERT INTO NguoiDung
  (MaNguoiDung, TenDangNhap, HoTen, Email, SoDienThoai, MatKhauMaHoa, AnhDaiDien, VaiTro, TrangThai, LyDoKhoa, NgayTao)
VALUES
  (2,  'chusan_khoa', 'Nguyễn Minh Khoa', 'khoa.owner@badminton.local', '0912345671', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', '/uploads/avatar/owner2.jpg', 'owner', 'active', NULL, '2026-07-30 09:00:00'),
  (3,  'chusan_lan',  'Trần Thị Lan',     'lan.owner@badminton.local',  '0912345672', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', '/uploads/avatar/owner3.jpg', 'owner', 'active', NULL, '2026-08-05 10:30:00'),
  (4,  'chusan_bao',  'Lê Quốc Bảo',      'bao.owner@badminton.local',  '0912345673', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', NULL,                          'owner', 'active', NULL, '2026-10-29 08:45:00'),
  (5,  'chusan_duc',  'Phạm Hữu Đức',     'duc.owner@badminton.local',  '0912345674', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', NULL,                          'owner', 'active', NULL, '2026-10-18 15:20:00'),
  (6,  NULL, 'Nguyễn Thị Mai',  'mai.nguyen@gmail.com',  '0901234561', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', '/uploads/avatar/kh6.jpg', 'customer', 'active', NULL, '2026-08-20 19:00:00'),
  (7,  NULL, 'Trần Văn Nam',    'nam.tran@gmail.com',    '0901234562', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', NULL,                      'customer', 'active', NULL, '2026-08-25 20:10:00'),
  (8,  NULL, 'Lê Hoàng Phúc',   'phuc.le@gmail.com',     '0901234563', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', NULL,                      'customer', 'active', NULL, '2026-09-02 08:30:00'),
  (9,  NULL, 'Phạm Thu Hà',     'ha.pham@gmail.com',     '0901234564', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', '/uploads/avatar/kh9.jpg', 'customer', 'active', NULL, '2026-09-10 21:00:00'),
  (10, NULL, 'Nguyễn Văn Hùng', 'hung.nguyen@gmail.com', '0903456789', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', NULL,                      'customer', 'active', NULL, '2026-09-15 18:00:00'),
  (11, NULL, 'Đỗ Quang Vinh',   'vinh.do@gmail.com',     '0901234566', '$2a$12$9q.owCBgiPzgWtDnNIs1uuDlXUAmQyAPaxIRDK1uRLY1pt0OV6.Ni', NULL,                      'customer', 'locked', 'Nhiều lần đặt sân nhưng không đến', '2026-09-20 12:00:00');

-- ---------------------------------------------------------------------
-- 2. HoSoChuSan: đủ 4 trạng thái approved / approved / pending / rejected
-- ---------------------------------------------------------------------
INSERT INTO HoSoChuSan
  (MaNguoiDung, TenDoanhNghiep, TenNganHang, MaNganHang, SoTaiKhoan, ChuTaiKhoan,
   TrangThaiDuyet, NgayGuiDuyet, NgayDuyet, MaQuanTriDuyet, LyDoTuChoi)
VALUES
  (2, 'Công ty TNHH Thể thao Thành Công', 'Vietcombank', '970436', '0071001234567', 'NGUYEN MINH KHOA',
      'approved', '2026-08-01 09:15:00', '2026-08-02 14:30:00', 1, NULL),
  (3, 'Hộ kinh doanh Lan Sport',          'MB Bank',     '970422', '8888012345',    'TRAN THI LAN',
      'approved', '2026-08-06 11:00:00', '2026-08-08 10:00:00', 1, NULL),
  (4, 'Cầu lông Bảo Long',                'Techcombank', '970407', '19036789012345', 'LE QUOC BAO',
      'pending',  '2026-10-30 16:20:00', NULL, NULL, NULL),
  (5, NULL,                               'ACB',         '970416', '245678901',     'PHAM HUU DUONG',
      'rejected', '2026-10-20 10:00:00', '2026-10-22 09:30:00', 1, 'Tên chủ tài khoản ngân hàng không khớp với hồ sơ đăng ký');

-- ---------------------------------------------------------------------
-- 3. CoSo (điểm đánh giá khớp với bảng DanhGia bên dưới)
-- ---------------------------------------------------------------------
INSERT INTO CoSo
  (MaCoSo, MaChuSan, TenCoSo, DiaChi, SoDienThoai, Zalo, LinkBanDo, TinhThanh, QuanHuyen, ViDo, KinhDo,
   MoTa, TienIch, GioMoCua, GioDongCua, SoPhutDatToiThieu, GiaThapNhat, TrangThai, LyDoKhoa, DiemTrungBinh, SoDanhGia, NgayTao)
VALUES
  (1, 2, 'Cầu Lông Thành Công', '123 Trường Chinh, Phường 13', '0912345671', '0912345671',
     'https://maps.google.com/?q=10.8012,106.6399', 'TP. Hồ Chí Minh', 'Tân Bình', 10.801200, 106.639900,
     'Nhà thi đấu 4 sân thảm PVC tiêu chuẩn, mái che thoáng mát, đèn LED chống chói.',
     JSON_ARRAY('parking','toilet','locker_room','water','wifi'), '06:00:00', '22:00:00', 60, 60000, 'active', NULL, 4.7, 3, '2026-08-03 15:00:00'),
  (2, 2, 'Cầu Lông Thành Công - Gò Vấp', '45 Quang Trung, Phường 10', '0912345679', 'https://zalo.me/0912345671',
     NULL, 'TP. Hồ Chí Minh', 'Gò Vấp', 10.838500, 106.665100,
     'Cơ sở 2 với 3 sân, có căng-tin phục vụ nước uống.',
     JSON_ARRAY('parking','toilet','canteen'), '05:30:00', '22:30:00', 60, 55000, 'active', NULL, 3.0, 1, '2026-08-10 09:00:00'),
  (3, 3, 'Lan Sport Arena', '88 Võ Văn Ngân, Phường Linh Chiểu', '0912345672', '0912345672',
     'https://maps.google.com/?q=10.8506,106.7719', 'TP. Hồ Chí Minh', 'Thủ Đức', 10.850600, 106.771900,
     'Khu liên hợp 4 sân cầu lông chất lượng cao gần các trường đại học, có chỗ để xe rộng.',
     JSON_ARRAY('parking','toilet','locker_room','shop','air_conditioner'), '06:00:00', '22:00:00', 60, 70000, 'active', NULL, 4.0, 1, '2026-08-12 10:00:00'),
  (4, 4, 'Bảo Long Badminton', '25 Điện Biên Phủ, Phường 25', '0912345673', NULL,
     NULL, 'TP. Hồ Chí Minh', 'Bình Thạnh', 10.797000, 106.710000,
     'Cơ sở mới đang chờ duyệt hồ sơ chủ sân.',
     JSON_ARRAY('parking','toilet'), '06:00:00', '22:00:00', 60, 50000, 'hidden', NULL, 0.0, 0, '2026-10-30 16:00:00'),
  (5, 3, 'Lan Sport Mini', '12 Kha Vạn Cân, Phường Linh Đông', '0912345675', NULL,
     NULL, 'TP. Hồ Chí Minh', 'Thủ Đức', 10.846000, 106.751000,
     'Cơ sở nhỏ 2 sân.',
     JSON_ARRAY('parking'), '06:00:00', '21:00:00', 60, 65000, 'locked', 'Nhiều báo cáo về thông tin giá không đúng thực tế', 0.0, 0, '2026-09-01 08:00:00');

-- ---------------------------------------------------------------------
-- 4. AnhCoSo
-- ---------------------------------------------------------------------
INSERT INTO AnhCoSo (MaAnh, MaCoSo, DuongDan, LaAnhBia, ThuTu) VALUES
  (1,  1, '/uploads/coso/1/bia.jpg', 1, 0),
  (2,  1, '/uploads/coso/1/san-1.jpg', 0, 1),
  (3,  1, '/uploads/coso/1/khu-thay-do.jpg', 0, 2),
  (4,  2, '/uploads/coso/2/bia.jpg', 1, 0),
  (5,  2, '/uploads/coso/2/canteen.jpg', 0, 1),
  (6,  3, '/uploads/coso/3/bia.jpg', 1, 0),
  (7,  3, '/uploads/coso/3/san-2.jpg', 0, 1),
  (8,  3, '/uploads/coso/3/bai-xe.jpg', 0, 2),
  (9,  4, '/uploads/coso/4/bia.jpg', 1, 0),
  (10, 5, '/uploads/coso/5/bia.jpg', 1, 0);

-- ---------------------------------------------------------------------
-- 5. San (id 1-4: CS1 | 5-7: CS2 | 8-11: CS3 | 12-13: CS4 | 14-15: CS5)
-- ---------------------------------------------------------------------
INSERT INTO San (MaSan, MaCoSo, TenSan, TrangThai) VALUES
  (1, 1, 'Sân 1', 'active'),
  (2, 1, 'Sân 2', 'active'),
  (3, 1, 'Sân 3', 'active'),
  (4, 1, 'Sân 4', 'active'),
  (5, 2, 'Sân 1', 'active'),
  (6, 2, 'Sân 2', 'active'),
  (7, 2, 'Sân 3', 'maintenance'),
  (8, 3, 'Sân A', 'active'),
  (9, 3, 'Sân B', 'active'),
  (10, 3, 'Sân C', 'active'),
  (11, 3, 'Sân D', 'active'),
  (12, 4, 'Sân 1', 'active'),
  (13, 4, 'Sân 2', 'active'),
  (14, 5, 'Sân 1', 'active'),
  (15, 5, 'Sân 2', 'active');

-- ---------------------------------------------------------------------
-- 6. KhoaSan
-- ---------------------------------------------------------------------
INSERT INTO KhoaSan (MaKhoa, MaSan, NgayKhoa, GioBatDau, GioKetThuc, LyDo) VALUES
  (1, 3,  '2026-11-10', '14:00:00', '18:00:00', 'Bảo trì mặt sân'),
  (2, 11, '2026-11-14', '06:00:00', '12:00:00', 'Tổ chức giải nội bộ'),
  (3, 11, '2026-11-14', '13:00:00', '17:00:00', 'Tổ chức giải nội bộ'),
  (4, 6,  '2026-11-12', '08:00:00', '10:00:00', 'Thay lưới và kẻ lại vạch');

-- ---------------------------------------------------------------------
-- 7. BangGia
-- ---------------------------------------------------------------------
INSERT INTO BangGia (MaCoSo, TenKhungGia, LoaiNgay, LoaiKhach, GioBatDau, GioKetThuc, GiaMoiGio) VALUES
  -- CS1
  (1, 'Thấp điểm', 'weekday', 'walk_in', '06:00:00', '16:00:00',  60000),
  (1, 'Cao điểm',  'weekday', 'walk_in', '16:00:00', '22:00:00', 100000),
  (1, 'Thấp điểm', 'weekend', 'walk_in', '06:00:00', '16:00:00',  90000),
  (1, 'Cao điểm',  'weekend', 'walk_in', '16:00:00', '22:00:00', 130000),
  (1, 'Thấp điểm', 'weekday', 'fixed',   '06:00:00', '16:00:00',  50000),
  (1, 'Cao điểm',  'weekday', 'fixed',   '16:00:00', '22:00:00',  80000),
  (1, 'Cả ngày',   'weekend', 'fixed',   '06:00:00', '22:00:00', 100000),
  -- CS2
  (2, 'Thấp điểm', 'weekday', 'walk_in', '05:30:00', '16:00:00',  55000),
  (2, 'Cao điểm',  'weekday', 'walk_in', '16:00:00', '22:30:00',  90000),
  (2, 'Thấp điểm', 'weekend', 'walk_in', '05:30:00', '16:00:00',  85000),
  (2, 'Cao điểm',  'weekend', 'walk_in', '16:00:00', '22:30:00', 120000),
  (2, 'Cả ngày',   'weekday', 'fixed',   '05:30:00', '22:30:00',  70000),
  (2, 'Cả ngày',   'weekend', 'fixed',   '05:30:00', '22:30:00',  95000),
  -- CS3
  (3, 'Thấp điểm', 'weekday', 'walk_in', '06:00:00', '16:00:00',  70000),
  (3, 'Cao điểm',  'weekday', 'walk_in', '16:00:00', '22:00:00', 110000),
  (3, 'Thấp điểm', 'weekend', 'walk_in', '06:00:00', '16:00:00', 100000),
  (3, 'Cao điểm',  'weekend', 'walk_in', '16:00:00', '22:00:00', 140000),
  (3, 'Thấp điểm', 'weekday', 'fixed',   '06:00:00', '16:00:00',  55000),
  (3, 'Cao điểm',  'weekday', 'fixed',   '16:00:00', '22:00:00',  90000),
  (3, 'Cả ngày',   'weekend', 'fixed',   '06:00:00', '22:00:00', 110000),
  -- CS4
  (4, 'Thấp điểm', 'weekday', 'walk_in', '06:00:00', '16:00:00',  50000),
  (4, 'Cao điểm',  'weekday', 'walk_in', '16:00:00', '22:00:00',  80000),
  (4, 'Cả ngày',   'weekend', 'walk_in', '06:00:00', '22:00:00', 100000),
  (4, 'Cả ngày',   'weekday', 'fixed',   '06:00:00', '22:00:00',  45000),
  -- CS5
  (5, 'Cả ngày',   'weekday', 'walk_in', '06:00:00', '21:00:00',  65000),
  (5, 'Cả ngày',   'weekend', 'walk_in', '06:00:00', '21:00:00',  90000);

-- ---------------------------------------------------------------------
-- 8. YeuCauRutTien (tài khoản nhận được chụp lại tại thời điểm rút)
-- ---------------------------------------------------------------------
INSERT INTO YeuCauRutTien
  (MaYeuCau, MaChuSan, SoTien, TrangThai, TenNganHang, MaNganHang, SoTaiKhoan, ChuTaiKhoan,
   NgayYeuCau, MaQuanTriXuLy, NgayXuLy, MaGiaoDich, LyDoTuChoi)
VALUES
  (1, 2, 495000, 'paid',     'Vietcombank', '970436', '0071001234567', 'NGUYEN MINH KHOA',
     '2026-10-27 09:00:00', 1, '2026-10-27 15:30:00', 'FT26300123456', NULL),
  (2, 3, 180000, 'pending',  'MB Bank',     '970422', '8888012345',    'TRAN THI LAN',
     '2026-10-30 10:15:00', NULL, NULL, NULL, NULL),
  (3, 2,  50000, 'rejected', 'Vietcombank', '970436', '0071001234567', 'NGUYEN MINH KHOA',
     '2026-10-15 08:00:00', 1, '2026-10-15 11:00:00', NULL, 'Số tiền thấp hơn mức rút tối thiểu 100.000đ');

-- ---------------------------------------------------------------------
-- 9. LichCoDinh
-- ---------------------------------------------------------------------
INSERT INTO LichCoDinh
  (MaLichCoDinh, MaSan, MaKhachHang, TenKhach, SoDienThoai, CacThu, NgayBatDau, NgayKetThuc,
   GioBatDau, GioKetThuc, SoPhut, DonGiaMoiBuoi, GhiChu, TrangThai, MaNguoiTao)
VALUES
  (1, 1, 10,   'Nguyễn Văn Hùng',        '0903456789', 'T3,T5', '2026-10-06', NULL,
     '19:00:00', '21:00:00', 120, 160000, 'Nhóm đồng nghiệp chơi cố định', 'active', 2),
  (2, 8, NULL, 'CLB Cầu Lông Sáng Sớm',  '0988777666', 'T7,CN', '2026-10-03', '2027-03-31',
     '06:00:00', '08:00:00', 120, 220000, 'Khách chưa có tài khoản app', 'active', 3);

-- ---------------------------------------------------------------------
-- 10. DatSan
--   Công thức: TongTien theo BangGia; PhiNenTang = 10% (đơn app), 0 (đơn owner)
--   Đơn 1,2,3 đã gộp vào yêu cầu rút 1 (paid); đơn 4 vào yêu cầu rút 2 (pending)
-- ---------------------------------------------------------------------
INSERT INTO DatSan
  (MaDatSan, MaDon, MaKhachHang, TenKhach, SoDienThoaiLienHe, GhiChu, Nguon, LoaiKhach, MaLichCoDinh,
   MaSan, NgayChoi, GioBatDau, GioKetThuc, SoPhut, TongTien, PhiNenTang, TienChuSan,
   TrangThaiThu, NgayThu, TrangThai, HetHanGiuCho, NguoiHuy, LyDoHuy, NgayHuy, MaYeuCauRutTien, NgayTao)
VALUES
  -- Đơn app đã hoàn thành
  (1,  'BK20261020001', 6, 'Nguyễn Thị Mai',  '0901234561', NULL, 'app', 'walk_in', NULL,
       1, '2026-10-20', '18:00:00', '20:00:00', 120, 200000, 20000, 180000,
       NULL, NULL, 'completed', NULL, NULL, NULL, NULL, 1, '2026-10-18 20:00:00'),
  (2,  'BK20261022001', 7, 'Trần Văn Nam',    '0901234562', NULL, 'app', 'walk_in', NULL,
       2, '2026-10-22', '07:00:00', '08:30:00', 90, 90000, 9000, 81000,
       NULL, NULL, 'completed', NULL, NULL, NULL, NULL, 1, '2026-10-21 21:00:00'),
  (3,  'BK20261024001', 8, 'Lê Hoàng Phúc',   '0901234563', 'Cần thêm 1 hộp cầu', 'app', 'walk_in', NULL,
       3, '2026-10-24', '17:00:00', '19:00:00', 120, 260000, 26000, 234000,
       NULL, NULL, 'completed', NULL, NULL, NULL, NULL, 1, '2026-10-22 09:30:00'),
  (4,  'BK20261025001', 9, 'Phạm Thu Hà',     '0901234564', NULL, 'app', 'walk_in', NULL,
       8, '2026-10-25', '09:00:00', '11:00:00', 120, 200000, 20000, 180000,
       NULL, NULL, 'completed', NULL, NULL, NULL, NULL, 2, '2026-10-23 18:00:00'),
  (5,  'BK20261026001', 6, 'Nguyễn Thị Mai',  '0901234561', NULL, 'app', 'walk_in', NULL,
       5, '2026-10-26', '19:00:00', '20:00:00', 60, 90000, 9000, 81000,
       NULL, NULL, 'completed', NULL, NULL, NULL, NULL, NULL, '2026-10-25 22:00:00'),
  -- Đơn owner: lịch cố định đã chơi
  (6,  'BK20261029001', 10, 'Nguyễn Văn Hùng', '0903456789', NULL, 'owner', 'fixed', 1,
       1, '2026-10-29', '19:00:00', '21:00:00', 120, 160000, 0, 160000,
       'paid', '2026-10-29 21:05:00', 'completed', NULL, NULL, NULL, NULL, NULL, '2026-10-06 09:00:00'),
  (7,  'BK20261031001', NULL, 'CLB Cầu Lông Sáng Sớm', '0988777666', NULL, 'owner', 'fixed', 2,
       8, '2026-10-31', '06:00:00', '08:00:00', 120, 220000, 0, 220000,
       'unpaid', NULL, 'completed', NULL, NULL, NULL, NULL, NULL, '2026-10-03 09:00:00'),
  -- Đơn owner: khách vãng lai tại chỗ
  (8,  'BK20261030001', NULL, 'Anh Tuấn', '0977123456', 'Khách đặt trực tiếp', 'owner', 'walk_in', NULL,
       2, '2026-10-30', '18:00:00', '19:30:00', 90, 150000, 0, 150000,
       'paid', '2026-10-30 19:35:00', 'completed', NULL, NULL, NULL, NULL, NULL, '2026-10-30 17:50:00'),
  -- Đơn owner: lịch cố định sắp tới
  (9,  'BK20261101001', NULL, 'CLB Cầu Lông Sáng Sớm', '0988777666', NULL, 'owner', 'fixed', 2,
       8, '2026-11-01', '06:00:00', '08:00:00', 120, 220000, 0, 220000,
       'unpaid', NULL, 'confirmed', NULL, NULL, NULL, NULL, NULL, '2026-10-03 09:00:00'),
  (10, 'BK20261103001', 10, 'Nguyễn Văn Hùng', '0903456789', NULL, 'owner', 'fixed', 1,
       1, '2026-11-03', '19:00:00', '21:00:00', 120, 160000, 0, 160000,
       'unpaid', NULL, 'confirmed', NULL, NULL, NULL, NULL, NULL, '2026-10-06 09:00:00'),
  (11, 'BK20261105001', 10, 'Nguyễn Văn Hùng', '0903456789', NULL, 'owner', 'fixed', 1,
       1, '2026-11-05', '19:00:00', '21:00:00', 120, 160000, 0, 160000,
       'unpaid', NULL, 'confirmed', NULL, NULL, NULL, NULL, NULL, '2026-10-06 09:00:00'),
  (12, 'BK20261107001', NULL, 'CLB Cầu Lông Sáng Sớm', '0988777666', NULL, 'owner', 'fixed', 2,
       8, '2026-11-07', '06:00:00', '08:00:00', 120, 220000, 0, 220000,
       'unpaid', NULL, 'confirmed', NULL, NULL, NULL, NULL, NULL, '2026-10-03 09:00:00'),
  -- Đơn app sắp tới đã thanh toán
  (13, 'BK20261102001', 7, 'Trần Văn Nam',    '0901234562', NULL, 'app', 'walk_in', NULL,
       3, '2026-11-02', '18:00:00', '20:00:00', 120, 200000, 20000, 180000,
       NULL, NULL, 'confirmed', NULL, NULL, NULL, NULL, NULL, '2026-10-30 21:00:00'),
  (14, 'BK20261107002', 8, 'Lê Hoàng Phúc',   '0901234563', NULL, 'app', 'walk_in', NULL,
       4, '2026-11-07', '15:00:00', '17:00:00', 120, 220000, 22000, 198000,
       NULL, NULL, 'confirmed', NULL, NULL, NULL, NULL, NULL, '2026-10-31 08:00:00'),
  (15, 'BK20261101002', 10, 'Nguyễn Văn Hùng', '0903456789', NULL, 'app', 'walk_in', NULL,
       6, '2026-11-01', '08:00:00', '10:00:00', 120, 170000, 17000, 153000,
       NULL, NULL, 'confirmed', NULL, NULL, NULL, NULL, NULL, '2026-10-31 09:30:00'),
  -- Đơn đang giữ chỗ (chưa thanh toán)
  (16, 'BK20261031002', 9, 'Phạm Thu Hà',     '0901234564', NULL, 'app', 'walk_in', NULL,
       9, '2026-11-02', '20:00:00', '21:00:00', 60, 110000, 11000, 99000,
       NULL, NULL, 'pending_payment', '2026-10-31 13:45:00', NULL, NULL, NULL, NULL, '2026-10-31 13:35:00'),
  -- Đơn bị hủy bởi khách (hủy sớm, hoàn 100%)
  (17, 'BK20261028001', 6, 'Nguyễn Thị Mai',  '0901234561', NULL, 'app', 'walk_in', NULL,
       1, '2026-11-04', '18:00:00', '19:00:00', 60, 100000, 10000, 90000,
       NULL, NULL, 'cancelled', NULL, 'customer', 'Khách bận đột xuất', '2026-10-28 20:00:00', NULL, '2026-10-28 09:00:00'),
  -- Đơn hết hạn giữ chỗ
  (18, 'BK20261029002', 7, 'Trần Văn Nam',    '0901234562', NULL, 'app', 'walk_in', NULL,
       2, '2026-11-01', '10:00:00', '11:00:00', 60, 90000, 9000, 81000,
       NULL, NULL, 'expired', '2026-10-29 10:10:00', 'system', 'Hết hạn giữ chỗ', '2026-10-29 10:10:00', NULL, '2026-10-29 10:00:00'),
  -- Đơn app bị chủ sân hủy (hoàn 100%)
  (19, 'BK20261027001', 8, 'Lê Hoàng Phúc',   '0901234563', NULL, 'app', 'walk_in', NULL,
       4, '2026-11-06', '19:00:00', '21:00:00', 120, 200000, 20000, 180000,
       NULL, NULL, 'cancelled', NULL, 'owner', 'Sân bảo trì đột xuất', '2026-10-30 08:00:00', NULL, '2026-10-27 19:00:00');

-- ---------------------------------------------------------------------
-- 11. DanhGia (đơn app đã completed) - khớp DiemTrungBinh/SoDanhGia của CoSo
-- ---------------------------------------------------------------------
INSERT INTO DanhGia (MaDanhGia, MaDatSan, MaKhachHang, MaCoSo, SoSao, NoiDung, BiAn, PhanHoiChuSan, NgayPhanHoi, NgayTao) VALUES
  (1, 1, 6, 1, 5, 'Sân đẹp, đèn sáng, chủ sân nhiệt tình.', 0, 'Cảm ơn bạn đã ủng hộ, hẹn gặp lại!', '2026-10-21 08:00:00', '2026-10-20 21:30:00'),
  (2, 2, 7, 1, 4, 'Sân sạch sẽ, buổi sáng mát mẻ. Hơi ít chỗ để xe máy.', 0, NULL, NULL, '2026-10-22 09:00:00'),
  (3, 3, 8, 1, 5, 'Chất lượng thảm tốt, chơi êm chân.', 0, 'Cảm ơn bạn!', '2026-10-25 09:00:00', '2026-10-24 19:30:00'),
  (4, 4, 9, 3, 4, 'Khu vực rộng rãi, có máy lạnh nhưng giá hơi cao.', 0, NULL, NULL, '2026-10-25 11:30:00'),
  (5, 5, 6, 2, 3, 'Sân tạm ổn nhưng đèn hơi tối ở góc sân.', 0, 'Cảm ơn góp ý, bên mình sẽ thay đèn trong tuần này.', '2026-10-27 09:00:00', '2026-10-26 20:30:00');

-- ---------------------------------------------------------------------
-- 12. YeuThich
-- ---------------------------------------------------------------------
INSERT INTO YeuThich (MaKhachHang, MaCoSo, NgayTao) VALUES
  (6,  1, '2026-09-01 10:00:00'),
  (6,  3, '2026-09-05 10:00:00'),
  (7,  1, '2026-09-03 18:00:00'),
  (8,  2, '2026-09-10 12:00:00'),
  (9,  3, '2026-10-01 09:00:00'),
  (10, 1, '2026-10-06 19:00:00'),
  (11, 2, '2026-09-25 08:00:00');

-- ---------------------------------------------------------------------
-- 13. ThietBi (FCM token mẫu)
-- ---------------------------------------------------------------------
INSERT INTO ThietBi (MaNguoiDung, TokenFcm, NenTang) VALUES
  (6,  'fcm_token_demo_user6_android_aaaaaaaaaaaaaaaaaaaaaaaa', 'android'),
  (7,  'fcm_token_demo_user7_ios_bbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'ios'),
  (8,  'fcm_token_demo_user8_android_cccccccccccccccccccccccc', 'android'),
  (9,  'fcm_token_demo_user9_ios_ddddddddddddddddddddddddddddd', 'ios'),
  (10, 'fcm_token_demo_user10_android_eeeeeeeeeeeeeeeeeeeeeee', 'android');

-- ---------------------------------------------------------------------
-- 14. ThongBao (đủ cho khách, chủ sân và admin)
-- ---------------------------------------------------------------------
INSERT INTO ThongBao (MaNguoiDung, Loai, TieuDe, NoiDung, LoaiThamChieu, MaThamChieu, DaDoc, KhoaChongTrung, NgayTao) VALUES
  -- Khách
  (6,  'booking_created',  'Đã giữ chỗ', 'Bạn đã giữ chỗ đơn BK20261020001, vui lòng thanh toán trong 10 phút.', 'booking', 1, 1, 'booking_created_1', '2026-10-18 20:00:00'),
  (6,  'payment_success',  'Thanh toán thành công', 'Đơn BK20261020001 đã được xác nhận.', 'booking', 1, 1, 'payment_success_1', '2026-10-18 20:02:00'),
  (7,  'payment_success',  'Thanh toán thành công', 'Đơn BK20261102001 đã được xác nhận.', 'booking', 13, 0, 'payment_success_13', '2026-10-30 21:03:00'),
  (7,  'reminder',         'Nhắc lịch chơi', 'Bạn có lịch chơi tại Cầu Lông Thành Công lúc 18:00 ngày 02/11.', 'booking', 13, 0, 'reminder_13', '2026-11-02 08:00:00'),
  (9,  'hold_expiring',    'Sắp hết hạn giữ chỗ', 'Đơn BK20261031002 sẽ hết hạn giữ chỗ lúc 13:45.', 'booking', 16, 0, 'hold_expiring_16', '2026-10-31 13:40:00'),
  (6,  'booking_cancelled','Hủy đơn thành công', 'Đơn BK20261028001 đã hủy, bạn được hoàn 100% số tiền.', 'booking', 17, 1, 'booking_cancelled_17', '2026-10-28 20:00:00'),
  (6,  'refund',           'Hoàn tiền', 'Vui lòng cung cấp tài khoản nhận hoàn tiền cho đơn BK20261028001.', 'booking', 17, 0, 'refund_17', '2026-10-28 20:05:00'),
  (8,  'booking_cancelled','Chủ sân hủy đơn', 'Đơn BK20261027001 bị chủ sân hủy do bảo trì sân, bạn được hoàn 100%.', 'booking', 19, 0, 'booking_cancelled_19', '2026-10-30 08:00:00'),
  (7,  'payment_failed',   'Hết hạn giữ chỗ', 'Đơn BK20261029002 đã hết hạn do chưa thanh toán.', 'booking', 18, 1, 'payment_failed_18', '2026-10-29 10:10:00'),
  (6,  'system',           'Chào mừng', 'Chào mừng bạn đến với hệ thống đặt sân cầu lông!', NULL, NULL, 1, 'system_welcome_6', '2026-08-20 19:00:00'),
  -- Chủ sân
  (2,  'owner_approved',   'Hồ sơ đã được duyệt', 'Hồ sơ chủ sân của bạn đã được duyệt. Bạn có thể bắt đầu đăng cơ sở.', 'owner', 2, 1, 'owner_approved_2', '2026-08-02 14:30:00'),
  (3,  'owner_approved',   'Hồ sơ đã được duyệt', 'Hồ sơ chủ sân của bạn đã được duyệt.', 'owner', 3, 1, 'owner_approved_3', '2026-08-08 10:00:00'),
  (5,  'owner_rejected',   'Hồ sơ bị từ chối', 'Lý do: Tên chủ tài khoản ngân hàng không khớp với hồ sơ đăng ký. Vui lòng chỉnh sửa và gửi lại.', 'owner', 5, 0, 'owner_rejected_5', '2026-10-22 09:30:00'),
  (2,  'new_booking_for_owner', 'Có đơn đặt mới', 'Đơn BK20261107002 vừa được đặt tại Sân 4.', 'booking', 14, 0, 'new_booking_14', '2026-10-31 08:00:00'),
  (3,  'new_booking_for_owner', 'Có đơn đặt mới', 'Đơn BK20261102001 vừa được đặt tại Cầu Lông Thành Công.', 'booking', 13, 1, 'new_booking_13', '2026-10-30 21:03:00'),
  (2,  'payout_paid',      'Đã chuyển tiền rút', 'Yêu cầu rút 495.000đ đã được chuyển khoản (mã FT26300123456).', 'payout', 1, 1, 'payout_paid_1', '2026-10-27 15:30:00'),
  (2,  'payout_rejected',  'Yêu cầu rút bị từ chối', 'Yêu cầu rút 50.000đ bị từ chối: dưới mức rút tối thiểu.', 'payout', 3, 1, 'payout_rejected_3', '2026-10-15 11:00:00'),
  (3,  'venue_locked',     'Cơ sở bị khóa', 'Cơ sở Lan Sport Mini đã bị khóa: Nhiều báo cáo về thông tin giá không đúng thực tế.', 'venue', 5, 0, 'venue_locked_5', '2026-10-10 09:00:00'),
  -- Admin
  (1,  'owner_submitted',  'Hồ sơ chủ sân mới', 'Chủ sân Lê Quốc Bảo vừa gửi hồ sơ chờ duyệt.', 'owner', 4, 0, 'owner_submitted_4', '2026-10-30 16:20:00'),
  (1,  'late_payment',     'Có giao dịch trễ', 'Có giao dịch chuyển khoản đến sau khi mã QR hết hạn, cần xem xét hoàn tiền.', 'payment', NULL, 0, 'late_payment_demo', '2026-10-29 10:30:00'),
  (1,  'payout_paid',      'Yêu cầu rút chờ xử lý', 'Chủ sân Trần Thị Lan gửi yêu cầu rút 180.000đ.', 'payout', 2, 0, 'payout_pending_2', '2026-10-30 10:15:00');

-- ---------------------------------------------------------------------
-- 15. NhatKyHeThong
-- ---------------------------------------------------------------------
INSERT INTO NhatKyHeThong (MaNguoiThucHien, HanhDong, DoiTuong, MaDoiTuong, ChiTiet, NgayTao) VALUES
  (1, 'duyet_chu_san',   'NguoiDung', 2, 'Duyệt hồ sơ chủ sân Nguyễn Minh Khoa', '2026-08-02 14:30:00'),
  (1, 'duyet_chu_san',   'NguoiDung', 3, 'Duyệt hồ sơ chủ sân Trần Thị Lan', '2026-08-08 10:00:00'),
  (1, 'tu_choi_chu_san', 'NguoiDung', 5, 'Từ chối: tên chủ tài khoản không khớp hồ sơ', '2026-10-22 09:30:00'),
  (1, 'khoa_co_so',      'CoSo',      5, 'Khóa cơ sở Lan Sport Mini: báo cáo sai thông tin giá', '2026-10-10 09:00:00'),
  (1, 'khoa_tai_khoan',  'NguoiDung', 11, 'Khóa tài khoản: nhiều lần đặt sân không đến', '2026-10-12 14:00:00'),
  (1, 'xu_ly_rut_tien',  'YeuCauRutTien', 1, 'Đã chuyển khoản 495.000đ, mã FT26300123456', '2026-10-27 15:30:00'),
  (1, 'xu_ly_rut_tien',  'YeuCauRutTien', 3, 'Từ chối: dưới mức rút tối thiểu', '2026-10-15 11:00:00'),
  (2, 'huy_don_uu_tien', 'DatSan',    19, 'Chủ sân hủy đơn BK20261027001, hoàn 100% cho khách', '2026-10-30 08:00:00');

-- ---------------------------------------------------------------------
-- Kiểm tra nhanh sau khi import
-- ---------------------------------------------------------------------
-- SELECT 'NguoiDung', COUNT(*) FROM NguoiDung UNION ALL
-- SELECT 'CoSo', COUNT(*) FROM CoSo UNION ALL
-- SELECT 'San', COUNT(*) FROM San UNION ALL
-- SELECT 'BangGia', COUNT(*) FROM BangGia UNION ALL
-- SELECT 'DatSan', COUNT(*) FROM DatSan UNION ALL
-- SELECT 'DanhGia', COUNT(*) FROM DanhGia;
-- Hoan tat import schema
SET FOREIGN_KEY_CHECKS = 1;
