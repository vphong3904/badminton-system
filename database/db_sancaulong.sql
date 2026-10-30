-- =====================================================================
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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 13. YeuThich: cơ sở yêu thích (khóa chính kép)
CREATE TABLE YeuThich (
  MaKhachHang  INT UNSIGNED NOT NULL,
  MaCoSo       INT UNSIGNED NOT NULL,
  NgayTao      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (MaKhachHang, MaCoSo),
  CONSTRAINT FK_YeuThich_KhachHang FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE,
  CONSTRAINT FK_YeuThich_CoSo      FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo) ON DELETE CASCADE
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 16. CauHinhHeThong: tham số cấu hình admin chỉnh trên web
CREATE TABLE CauHinhHeThong (
  KhoaCauHinh  VARCHAR(50) PRIMARY KEY,
  GiaTri       VARCHAR(255) NOT NULL,
  MoTa         VARCHAR(255) NULL,
  NgayCapNhat  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
