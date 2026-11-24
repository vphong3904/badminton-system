-- =====================================================================
-- HỆ THỐNG ĐẶT SÂN CẦU LÔNG - db_sancaulong (CHỈ CẤU TRÚC)
-- File này chỉ chứa CREATE DATABASE + CREATE TABLE (đã gộp toàn bộ migration).
-- Dữ liệu (cấu hình hệ thống, tài khoản admin, dữ liệu mẫu) nằm ở: db_sancaulong_data.sql
-- Thứ tự chạy: 1) db_sancaulong.sql   2) db_sancaulong_data.sql
-- Quy ước: tên bảng, tên cột viết tiếng Việt không dấu, PascalCase
-- Giá trị ENUM và khóa trong CauHinhHeThong giữ nguyên tiếng Anh
-- Yêu cầu: MySQL 8.0.16+ (để CHECK có hiệu lực) hoặc MariaDB 10.2.1+ (cột sinh STORED + CHECK; khuyến nghị 10.6+)
-- Bảng (29): NguoiDung, HoSoChuSan, CoSo, AnhCoSo, San, SuKien, KhoaSan, BangGia, LichCoDinh,
--   DatSan, ThanhToan, HoanTien, ChungTuThanhToan, DanhGia, YeuThich, KhieuNai, Gay, KhangNghi,
--   LichSuQrSan, CheckIn, HangMucSuKien, DangKySuKien, ThanhToanSuKien, ChungTuSuKien,
--   BaoCaoViPham, ThongBao, CauHinhHeThong, NhatKyHeThong
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
  GioiTinh      ENUM('male','female') NULL COMMENT 'male = Nam, female = Nữ; NULL = chưa khai (tài khoản cũ/khách chưa chọn). App bắt buộc chọn khi đăng ký tài khoản và khi đăng ký sự kiện',
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
  KhoaDatMoi      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = chặn khách đặt mới vào cơ sở của chủ sân; lịch đã đặt giữ nguyên. Admin đặt/gỡ, ghi nhật ký (G5)',
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
  DaXoa      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = đã xoá mềm (G9.F); sân đã xoá không hiện ở truy vấn hiện hành, vẫn giữ để hiện tên cũ trong lịch sử',
  NgayXoa    DATETIME NULL COMMENT 'thời điểm xoá mềm; NULL = chưa xoá',
  TenDangDung VARCHAR(50) GENERATED ALWAYS AS (IF(DaXoa = 0, TenSan, NULL)) STORED COMMENT 'cột sinh: tên đang dùng (NULL khi đã xoá) — UNIQUE chỉ áp cho sân chưa xoá; STORED để chạy cả MySQL lẫn MariaDB',
  CONSTRAINT FK_San_CoSo FOREIGN KEY (MaCoSo) REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  UNIQUE KEY UQ_San_TenDangDung (MaCoSo, TenDangDung)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- G7. SuKien: Loai social = Giao lưu (sức chứa ở SoLuongToiDa) · tournament = Giải đấu (sức chứa theo HangMucSuKien)
--    Giờ VN, bội 30 phút. Phi = 0 là miễn phí. Sân tham gia = các dòng KhoaSan có MaSuKien (mọi sân cùng một cơ sở).
--    TrangThai: open → closed → finished | cancelled. BiAn là cờ riêng do Admin, không đổi TrangThai.
CREATE TABLE SuKien (
  MaSuKien        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaCoSo          INT UNSIGNED NOT NULL,
  MaChuSan        INT UNSIGNED NOT NULL,
  Loai            ENUM('social','tournament') NOT NULL,
  TieuDe          VARCHAR(150) NOT NULL,
  MoTa            TEXT NULL,
  DieuLe          TEXT NULL COMMENT 'điều lệ / thể thức (chủ yếu cho giải đấu)',
  AnhBia          VARCHAR(255) NULL COMMENT 'đường dẫn tương đối ảnh bìa',
  NgaySuKien      DATE NOT NULL,
  GioBatDau       TIME NOT NULL,
  GioKetThuc      TIME NOT NULL,
  HanDangKy       DATETIME NOT NULL COMMENT 'hạn đăng ký; phải trước giờ bắt đầu',
  SoLuongToiDa    SMALLINT UNSIGNED NULL COMMENT 'sức chứa của Giao lưu; NULL với Giải đấu (dùng HangMucSuKien.SoLuongToiDa)',
  TrinhDoTu       TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1–8: Y, TBY, TB-, TB, TB+, K, BC, CN',
  TrinhDoDen      TINYINT UNSIGNED NOT NULL DEFAULT 8,
  CheDoDuyet      ENUM('auto','manual') NOT NULL DEFAULT 'auto' COMMENT 'auto = đăng ký vào thẳng accepted; manual = chủ sân duyệt',
  Phi             DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT '0 = miễn phí; có phí thì thu qua hệ thống như đặt sân (ThanhToanSuKien)',
  GhiChuPhi       VARCHAR(255) NULL COMMENT 'ghi chú thêm về khoản phí (tùy chọn)',
  TrangThai       ENUM('open','closed','finished','cancelled') NOT NULL DEFAULT 'open',
  NguoiHuy        ENUM('owner','system') NULL,
  LyDoHuy         VARCHAR(255) NULL,
  NgayHuy         DATETIME NULL,
  BiAn            TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = Admin ẩn khỏi khách; bỏ ẩn thì TrangThai cũ giữ nguyên',
  LyDoAn          VARCHAR(255) NULL,
  MaQuanTriAn     INT UNSIGNED NULL,
  NgayAn          DATETIME NULL,
  NgayTao         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_SuKien_CoSo    FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo),
  CONSTRAINT FK_SuKien_ChuSan  FOREIGN KEY (MaChuSan)    REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_SuKien_QuanTri FOREIGN KEY (MaQuanTriAn) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT CHK_SuKien_Gio     CHECK (GioKetThuc > GioBatDau),
  CONSTRAINT CHK_SuKien_TrinhDo CHECK (TrinhDoTu BETWEEN 1 AND 8 AND TrinhDoDen BETWEEN 1 AND 8 AND TrinhDoTu <= TrinhDoDen),
  CONSTRAINT CHK_SuKien_Phi     CHECK (Phi >= 0),
  CONSTRAINT CHK_SuKien_SoLuong CHECK (SoLuongToiDa IS NULL OR SoLuongToiDa >= 1),
  KEY IDX_SuKien_ChuSan (MaChuSan, TrangThai),
  KEY IDX_SuKien_CoSo (MaCoSo, TrangThai, NgaySuKien),
  KEY IDX_SuKien_Ngay (TrangThai, BiAn, NgaySuKien),           -- danh sách khách + job finished
  KEY IDX_SuKien_HanDangKy (TrangThai, HanDangKy)              -- job đóng quá hạn đăng ký
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
  MaSuKien    INT UNSIGNED NULL COMMENT 'có giá trị = khóa do sự kiện (G7) tạo; không xóa tay ở màn Khóa sân',
  CONSTRAINT FK_KhoaSan_San FOREIGN KEY (MaSan) REFERENCES San(MaSan) ON DELETE CASCADE,
  CONSTRAINT FK_KhoaSan_SuKien FOREIGN KEY (MaSuKien) REFERENCES SuKien(MaSuKien) ON DELETE CASCADE,
  CONSTRAINT CHK_KhoaSan_Gio CHECK (GioKetThuc > GioBatDau),
  KEY IDX_KhoaSan_SuKien (MaSuKien),
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
  MaSanCu             INT UNSIGNED NULL COMMENT 'sân trước khi chủ sân chuyển sân (G9.E); NULL = chưa chuyển',
  NgayChuyenSan       DATETIME NULL COMMENT 'thời điểm chuyển sân gần nhất (G9.E); NULL = chưa chuyển',
  NgayKhachDongYChuyen DATETIME NULL COMMENT 'khách bấm Đồng ý chuyển sân (G9.H); NULL = chưa phản hồi; chủ sân chuyển lại thì reset NULL',
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
  CONSTRAINT FK_DatSan_SanCu      FOREIGN KEY (MaSanCu)         REFERENCES San(MaSan),
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
  HanHoan           DATETIME NULL COMMENT 'hạn chuyển hoàn = lúc tạo + refund_deadline_minutes_* theo HoanTien.Loai (phút, giờ máy chủ)',
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
  Loai           ENUM('service','refund') NOT NULL DEFAULT 'service' COMMENT 'service = chủ sân chậm duyệt thanh toán; refund = chưa nhận được tiền hoàn (khi HanHoan đã qua)',
  MaHoanTien     INT UNSIGNED NULL COMMENT 'khoản hoàn bị khiếu nại (Loai=refund)',
  GiaiDoan       ENUM('after_payment','at_cancel','after_cancel') NOT NULL COMMENT 'khách bấm khiếu nại ở màn nào',
  NoiDung        VARCHAR(1000) NOT NULL,
  TrangThai      ENUM('pending','upheld','rejected') NOT NULL DEFAULT 'pending',
  PhanHoiChuSan  VARCHAR(1000) NULL COMMENT 'chủ sân giải trình (1 lần, trong complaint_owner_reply_hours kể từ NgayTao)',
  NgayPhanHoi    DATETIME NULL,
  HanPhanHoi     DATETIME NULL COMMENT 'hạn chủ sân giải trình = NgayTao + complaint_owner_reply_hours; NULL = dòng cũ',
  GhiChuQuanTri  VARCHAR(500) NULL,
  BangChungQuanTri VARCHAR(1500) NULL COMMENT 'JSON mảng ảnh bằng chứng Admin đính kèm khi quyết định (tối đa 3)',
  MucXuLy        ENUM('none','warning','severe_warning','banned') NOT NULL DEFAULT 'none',
  MaQuanTri      INT UNSIGNED NULL,
  NgayXuLy       DATETIME NULL,
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  DaXoa          TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = Admin đã thu hồi (xoá mềm), ẩn khỏi mọi danh sách (G9.D)',
  NgayXoa        DATETIME NULL,
  LyDoXoa        VARCHAR(255) NULL,
  MaQuanTriXoa   INT UNSIGNED NULL,
  CONSTRAINT FK_KhieuNai_DatSan   FOREIGN KEY (MaDatSan)    REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_KhieuNai_Khach    FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_ChuSan   FOREIGN KEY (MaChuSan)    REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_CoSo     FOREIGN KEY (MaCoSo)      REFERENCES CoSo(MaCoSo) ON DELETE CASCADE,
  CONSTRAINT FK_KhieuNai_QuanTri  FOREIGN KEY (MaQuanTri)   REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_QuanTriXoa FOREIGN KEY (MaQuanTriXoa) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhieuNai_HoanTien FOREIGN KEY (MaHoanTien)  REFERENCES HoanTien(MaHoanTien) ON DELETE SET NULL,
  UNIQUE KEY UQ_KhieuNai_DatSan_Loai (MaDatSan, Loai),
  KEY IDX_KhieuNai_TrangThai (TrangThai, NgayTao),
  KEY IDX_KhieuNai_ChuSan (MaChuSan, TrangThai),
  KEY IDX_KhieuNai_Khach (MaKhachHang, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13c. Gay: gậy vi phạm của chủ sân. Mỗi khiếu nại upheld = tối đa 1 gậy.
--      active = có hiệu lực; appealed = đang kháng nghị; revoked = đã thu hồi (không tính vào HoSoChuSan.SoLanViPham)
CREATE TABLE Gay (
  MaGay          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaChuSan       INT UNSIGNED NOT NULL,
  MaKhieuNai     INT UNSIGNED NULL COMMENT 'Nguồn vi phạm từ khiếu nại đặt sân; NULL nếu từ báo cáo sự kiện',
  MaBaoCao       INT UNSIGNED NULL COMMENT 'Nguồn vi phạm từ báo cáo sự kiện; NULL nếu từ khiếu nại đặt sân',
  TrangThai      ENUM('active','appealed','revoked') NOT NULL DEFAULT 'active',
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  HetHieuLuc     DATETIME NULL COMMENT 'tùy chọn: gậy tự hết hiệu lực; NULL = không hết hạn',
  NgayThuHoi     DATETIME NULL,
  LyDoThuHoi     VARCHAR(500) NULL,
  MaQuanTriThuHoi INT UNSIGNED NULL,
  CONSTRAINT FK_Gay_ChuSan    FOREIGN KEY (MaChuSan)        REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_Gay_KhieuNai  FOREIGN KEY (MaKhieuNai)      REFERENCES KhieuNai(MaKhieuNai),
  CONSTRAINT FK_Gay_QuanTri   FOREIGN KEY (MaQuanTriThuHoi) REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_Gay_KhieuNai (MaKhieuNai),
  UNIQUE KEY UQ_Gay_BaoCao (MaBaoCao),
  CONSTRAINT CHK_Gay_Nguon CHECK (
    (MaKhieuNai IS NOT NULL AND MaBaoCao IS NULL) OR
    (MaKhieuNai IS NULL AND MaBaoCao IS NOT NULL)
  ),
  KEY IDX_Gay_ChuSan (MaChuSan, TrangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13d. KhangNghi: chủ sân kháng nghị quyết định chấp nhận khiếu nại (trong appeal_hours = 24h); mỗi khiếu nại 1 lần, kèm 1–3 ảnh bằng chứng (BangChung).
--      accepted = Admin thu hồi gậy; rejected = giữ gậy; cancelled = khiếu nại gốc bị Admin thu hồi (G9.D)
CREATE TABLE KhangNghi (
  MaKhangNghi    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaKhieuNai     INT UNSIGNED NOT NULL,
  MaGay          INT UNSIGNED NOT NULL,
  MaChuSan       INT UNSIGNED NOT NULL,
  NoiDung        VARCHAR(1000) NOT NULL,
  BangChung      VARCHAR(1500) NULL COMMENT 'JSON mảng đường dẫn 1–3 ảnh bằng chứng chủ sân đính kèm khi kháng nghị (G9.C)',
  TrangThai      ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  GhiChuQuanTri  VARCHAR(500) NULL,
  MaQuanTri      INT UNSIGNED NULL,
  NgayXuLy       DATETIME NULL,
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_KhangNghi_KhieuNai FOREIGN KEY (MaKhieuNai) REFERENCES KhieuNai(MaKhieuNai),
  CONSTRAINT FK_KhangNghi_Gay      FOREIGN KEY (MaGay)      REFERENCES Gay(MaGay),
  CONSTRAINT FK_KhangNghi_ChuSan   FOREIGN KEY (MaChuSan)   REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_KhangNghi_QuanTri  FOREIGN KEY (MaQuanTri)  REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_KhangNghi_KhieuNai (MaKhieuNai),
  KEY IDX_KhangNghi_TrangThai (TrangThai, NgayTao)
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
-- G7. HangMucSuKien: hạng mục của Giải đấu (vd "Đơn nam", "Đôi nam nữ"); LaDoi = 1 thì đăng ký phải có đồng đội
CREATE TABLE HangMucSuKien (
  MaHangMuc     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaSuKien      INT UNSIGNED NOT NULL,
  TenHangMuc    VARCHAR(100) NOT NULL,
  LaDoi         TINYINT(1) NOT NULL DEFAULT 0,
  SoLuongToiDa  SMALLINT UNSIGNED NOT NULL,
  NgayTao       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_HangMuc_SuKien FOREIGN KEY (MaSuKien) REFERENCES SuKien(MaSuKien) ON DELETE CASCADE,
  CONSTRAINT CHK_HangMuc_SoLuong CHECK (SoLuongToiDa >= 1),
  UNIQUE KEY UQ_HangMuc_Ten (MaSuKien, TenHangMuc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- G7. DangKySuKien: 1 khách × 1 sự kiện (Giao lưu) hoặc × 1 hạng mục (Giải đấu), dùng lại dòng cũ khi đăng ký lại.
--    KhoaHangMuc = IFNULL(MaHangMuc,0) để UNIQUE chặn trùng cả khi MaHangMuc NULL (MySQL coi NULL ≠ NULL).
--    TrangThai: pending (chế độ duyệt, chưa chiếm chỗ) → accepted (chiếm chỗ) → cancelled | rejected.
--    Sự kiện có phí: accepted nhưng chưa trả vẫn chiếm chỗ đến hết ThanhToanSuKien.HanThanhToan, quá hạn thì job hủy (system).
CREATE TABLE DangKySuKien (
  MaDangKy       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaSuKien       INT UNSIGNED NOT NULL,
  MaHangMuc      INT UNSIGNED NULL,
  KhoaHangMuc    INT UNSIGNED AS (IFNULL(MaHangMuc, 0)) STORED,
  MaKhachHang    INT UNSIGNED NOT NULL,
  TenKhach       VARCHAR(100) NOT NULL COMMENT 'lưu cứng tên lúc đăng ký',
  SoDienThoai    VARCHAR(20)  NOT NULL COMMENT 'SĐT khách nhập lúc đăng ký',
  GioiTinh       ENUM('male','female') NULL COMMENT 'giới tính khách khai lúc đăng ký (lưu cứng); NULL chỉ với dữ liệu cũ, đăng ký mới luôn có',
  TrinhDoKhai    TINYINT UNSIGNED NULL COMMENT '1–8, khách tự khai; ngoài khoảng sự kiện chỉ cảnh báo',
  TenDongDoi     VARCHAR(100) NULL COMMENT 'bắt buộc với hạng mục đôi',
  SdtDongDoi     VARCHAR(20)  NULL,
  TrangThai      ENUM('pending','accepted','cancelled','rejected') NOT NULL,
  NguoiHuy       ENUM('customer','owner','system') NULL,
  LyDo           VARCHAR(255) NULL COMMENT 'lý do từ chối / loại / hủy',
  SoLanRut       TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'số lần rút đăng ký của khách ở sự kiện này (tối đa 3)',
  NgayDangKy     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayXuLy       DATETIME NULL COMMENT 'lúc chủ sân chấp nhận / từ chối',
  NgayHuy        DATETIME NULL,
  NgayNhacNho    DATETIME NULL COMMENT 'đã gửi nhắc trước giờ diễn ra (chống gửi lặp)',
  NgayTao        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_DangKySK_SuKien   FOREIGN KEY (MaSuKien)    REFERENCES SuKien(MaSuKien) ON DELETE CASCADE,
  CONSTRAINT FK_DangKySK_HangMuc  FOREIGN KEY (MaHangMuc)   REFERENCES HangMucSuKien(MaHangMuc),
  CONSTRAINT FK_DangKySK_Khach    FOREIGN KEY (MaKhachHang) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT CHK_DangKySK_TrinhDo CHECK (TrinhDoKhai IS NULL OR TrinhDoKhai BETWEEN 1 AND 8),
  UNIQUE KEY UQ_DangKySK_Khach (MaSuKien, KhoaHangMuc, MaKhachHang),
  KEY IDX_DangKySK_SuKien (MaSuKien, TrangThai),
  KEY IDX_DangKySK_HangMuc (MaHangMuc, TrangThai),
  KEY IDX_DangKySK_Khach (MaKhachHang, TrangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- G7. ThanhToanSuKien: phí sự kiện thu như đặt sân (QR vào TK chủ sân, khách gửi ảnh, chủ sân xác nhận đã nhận tiền).
--    Chỉ có dòng cho đăng ký của sự kiện có phí, tạo khi đăng ký thành accepted. Nền tảng không giữ/chuyển tiền.
--    pending: chờ khách chuyển + gửi ảnh | confirming: đã gửi ảnh, đợi chủ sân | success: chủ sân đã xác nhận
--    expired: quá HanThanhToan | cancelled: đăng ký/sự kiện bị hủy khi chưa trả
--    TrangThaiHoan: none | pending (đã trả mà đăng ký/sự kiện bị hủy: chủ sân tự chuyển khoản hoàn) | refunded
CREATE TABLE ThanhToanSuKien (
  MaThanhToan         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDangKy            INT UNSIGNED NOT NULL,
  SoTien              DECIMAL(12,0) NOT NULL COMMENT 'lưu cứng = SuKien.Phi lúc chấp nhận',
  PhiNenTang          DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT 'hoa hồng hệ thống theo event_commission_rate, lưu cứng (mặc định 0)',
  TienChuSan          DECIMAL(12,0) NOT NULL DEFAULT 0 COMMENT '= SoTien - PhiNenTang',
  TrangThai           ENUM('pending','confirming','success','expired','cancelled') NOT NULL DEFAULT 'pending',
  NoiDungChuyenKhoan  VARCHAR(100) NULL COMMENT 'nội dung chuyển khoản để đối chiếu',
  HanThanhToan        DATETIME NULL COMMENT 'hạn khách chuyển + gửi ảnh (event_payment_hold_minutes, mặc định 10 phút)',
  HanXacNhan          DATETIME NULL COMMENT 'hạn chủ sân xác nhận sau khi khách gửi ảnh',
  NgayBatDauThanhToan DATETIME NULL COMMENT 'lúc khách bấm Xác nhận & thanh toán: bắt đầu đếm ngược event_payment_hold_minutes (10 phút); NULL = chưa bắt đầu',
  LyDoLoi             VARCHAR(255) NULL COMMENT 'lý do chủ sân từ chối ảnh',
  NgayGuiAnh          DATETIME NULL,
  MaNguoiXacNhan      INT UNSIGNED NULL,
  NgayThanhToan       DATETIME NULL COMMENT 'thời điểm chủ sân xác nhận',
  TrangThaiHoan       ENUM('none','pending','refunded') NOT NULL DEFAULT 'none',
  SoTienHoan          DECIMAL(12,0) NULL COMMENT 'số tiền chủ sân cần hoàn khi khách tự hủy theo chính sách hoàn tiền; NULL = hoàn toàn bộ SoTien',
  MaNganHangHoan      VARCHAR(20)  NULL COMMENT 'mã VietQR ngân hàng khách nhận hoàn (bắt buộc nhập khi khách hủy có hoàn)',
  TenNganHangHoan     VARCHAR(100) NULL,
  SoTaiKhoanHoan      VARCHAR(30)  NULL,
  ChuTaiKhoanHoan     VARCHAR(100) NULL,
  NgayHoan            DATETIME NULL,
  NgayTao             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_TTSK_DangKy   FOREIGN KEY (MaDangKy)       REFERENCES DangKySuKien(MaDangKy) ON DELETE CASCADE,
  CONSTRAINT FK_TTSK_NguoiXN  FOREIGN KEY (MaNguoiXacNhan) REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_TTSK_DangKy (MaDangKy),
  KEY IDX_TTSK_TrangThai (TrangThai, HanThanhToan),
  KEY IDX_TTSK_Hoan (TrangThaiHoan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- G7. ChungTuSuKien: ảnh chuyển khoản khách gửi (mỗi lần gửi 1 dòng, tối đa 5 ảnh/đăng ký), cùng dạng ChungTuThanhToan
CREATE TABLE ChungTuSuKien (
  MaChungTu       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaThanhToan     INT UNSIGNED NOT NULL,
  SoTien          DECIMAL(12,0) NULL COMMENT 'số tiền phải chuyển của lần gửi này (backend lấy từ ThanhToanSuKien)',
  ThoiDiemChuyen  DATETIME NULL COMMENT 'giờ chuyển khoản trên biên lai (khách nhập, tùy chọn, ≤ giờ máy chủ)',
  NgayGui         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Anh             VARCHAR(255) NOT NULL COMMENT 'đường dẫn tương đối /tep-tai-len/<tên file>',
  MaBamAnh        CHAR(64) NOT NULL COMMENT 'SHA-256 nội dung ảnh',
  KetQua          ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  MaNguoiDuyet    INT UNSIGNED NULL,
  NgayDuyet       DATETIME NULL,
  LyDo            VARCHAR(255) NULL COMMENT 'lý do từ chối',
  CONSTRAINT FK_ChungTuSK_ThanhToan  FOREIGN KEY (MaThanhToan)  REFERENCES ThanhToanSuKien(MaThanhToan) ON DELETE CASCADE,
  CONSTRAINT FK_ChungTuSK_NguoiDuyet FOREIGN KEY (MaNguoiDuyet) REFERENCES NguoiDung(MaNguoiDung),
  KEY IDX_ChungTuSK_ThanhToan (MaThanhToan),
  KEY IDX_ChungTuSK_Bam (MaBamAnh)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- G7. BaoCaoViPham: khách báo cáo vi phạm; mỗi người báo mỗi đối tượng 1 lần. Hiện chỉ LoaiDoiTuong = 'event'.
--    HanhDong (khi upheld): none | hide (ẩn) | cancel (hủy sự kiện). CongViPham = 1: cộng vào SoLanViPham của chủ sân (chờ chốt #4).
CREATE TABLE BaoCaoViPham (
  MaBaoCao         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaNguoiBaoCao    INT UNSIGNED NOT NULL,
  LoaiDoiTuong     ENUM('event') NOT NULL DEFAULT 'event',
  MaDoiTuong       INT UNSIGNED NOT NULL,
  LyDo             ENUM('misleading','fraud','inappropriate','other','slow_approval') NOT NULL COMMENT 'slow_approval = khách khiếu nại chủ sân duyệt chậm phí sự kiện',
  NoiDung          VARCHAR(500) NULL,
  TrangThai        ENUM('pending','upheld','dismissed') NOT NULL DEFAULT 'pending',
  HanhDong         ENUM('none','hide','cancel') NULL,
  CongViPham       TINYINT(1) NOT NULL DEFAULT 0,
  GhiChuQuanTri    VARCHAR(500) NULL,
  MaQuanTriXuLy    INT UNSIGNED NULL,
  NgayXuLy         DATETIME NULL,
  NgayTao          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_BaoCao_NguoiBao FOREIGN KEY (MaNguoiBaoCao) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_BaoCao_QuanTri  FOREIGN KEY (MaQuanTriXuLy) REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_BaoCao_Moi (MaNguoiBaoCao, LoaiDoiTuong, MaDoiTuong),
  KEY IDX_BaoCao_TrangThai (TrangThai, NgayTao),
  KEY IDX_BaoCao_DoiTuong (LoaiDoiTuong, MaDoiTuong)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE Gay
  ADD CONSTRAINT FK_Gay_BaoCao FOREIGN KEY (MaBaoCao) REFERENCES BaoCaoViPham(MaBaoCao);

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
                       'refund_reminder','refund_escalated','refund_received','refund_not_received',
                       'hold_expiring','confirm_expiring','checkin_success',
                       'event_registered','event_accepted','event_rejected','event_removed',
                       'event_updated','event_cancelled','event_reminder','event_hidden',
                       'event_payment_submitted','event_payment_confirmed','event_payment_rejected',
                       'event_payment_expired',
                       'refund_expiring','booking_moved','payment_auto_confirmed')
                  NOT NULL,
  TieuDe          VARCHAR(150) NOT NULL,
  NoiDung         VARCHAR(500) NOT NULL,
  LoaiThamChieu   ENUM('booking','payment','venue','complaint','event','registration') NULL COMMENT 'để app/web điều hướng khi bấm vào',
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

-- G8.1: schema Cộng đồng (bài tìm người chơi, đội nhóm, phòng chat).
-- Chạy sau db_sancaulong.sql hiện tại. Có thể chạy lại an toàn.
USE db_sancaulong;

CREATE TABLE IF NOT EXISTS PhongChat (
  MaPhong INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  Loai ENUM('player_post','team') NOT NULL,
  TrangThai ENUM('open','readonly') NOT NULL DEFAULT 'open',
  NgayTao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY IDX_PhongChat_LoaiTrangThai (Loai, TrangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ThanhVienPhong (
  MaPhong INT UNSIGNED NOT NULL,
  MaNguoiDung INT UNSIGNED NOT NULL,
  VaiTro ENUM('owner','member') NOT NULL DEFAULT 'member',
  TrangThai ENUM('active','left','removed') NOT NULL DEFAULT 'active',
  NgayVao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayRoi DATETIME NULL,
  PRIMARY KEY (MaPhong, MaNguoiDung),
  KEY IDX_ThanhVienPhong_NguoiDung (MaNguoiDung, TrangThai),
  CONSTRAINT FK_ThanhVienPhong_Phong FOREIGN KEY (MaPhong) REFERENCES PhongChat(MaPhong) ON DELETE CASCADE,
  CONSTRAINT FK_ThanhVienPhong_NguoiDung FOREIGN KEY (MaNguoiDung) REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS TinNhan (
  MaTin INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaPhong INT UNSIGNED NOT NULL,
  MaNguoiGui INT UNSIGNED NOT NULL,
  NoiDung VARCHAR(1000) NOT NULL,
  NgayTao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT FK_TinNhan_Phong FOREIGN KEY (MaPhong) REFERENCES PhongChat(MaPhong) ON DELETE CASCADE,
  CONSTRAINT FK_TinNhan_NguoiGui FOREIGN KEY (MaNguoiGui) REFERENCES NguoiDung(MaNguoiDung),
  KEY IDX_TinNhan_PhongMaTin (MaPhong, MaTin),
  KEY IDX_TinNhan_NguoiGui (MaNguoiGui, NgayTao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BaiTimNguoi (
  MaBai INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaNguoiTao INT UNSIGNED NOT NULL,
  MaPhong INT UNSIGNED NOT NULL,
  TieuDe VARCHAR(150) NOT NULL,
  MoTa TEXT NULL,
  TrinhDoTu TINYINT UNSIGNED NOT NULL DEFAULT 1,
  TrinhDoDen TINYINT UNSIGNED NOT NULL DEFAULT 8,
  SoNguoiCan TINYINT UNSIGNED NOT NULL,
  NgayChoi DATE NOT NULL,
  GioBatDau TIME NOT NULL,
  GioKetThuc TIME NOT NULL,
  KhuVuc VARCHAR(150) NOT NULL,
  ChiPhi VARCHAR(100) NULL,
  MaDatSan INT UNSIGNED NULL,
  AnhBia VARCHAR(255) NULL,
  TrangThai ENUM('open','full','closed','ended','cancelled','hidden','removed') NOT NULL DEFAULT 'open',
  LyDoGo VARCHAR(500) NULL,
  MaNguoiGo INT UNSIGNED NULL,
  NgayGo DATETIME NULL,
  NgayTao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_BaiTimNguoi_NguoiTao FOREIGN KEY (MaNguoiTao) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_BaiTimNguoi_Phong FOREIGN KEY (MaPhong) REFERENCES PhongChat(MaPhong),
  CONSTRAINT FK_BaiTimNguoi_DatSan FOREIGN KEY (MaDatSan) REFERENCES DatSan(MaDatSan),
  CONSTRAINT FK_BaiTimNguoi_NguoiGo FOREIGN KEY (MaNguoiGo) REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_BaiTimNguoi_Phong (MaPhong),
  KEY IDX_BaiTimNguoi_DanhSach (TrangThai, NgayChoi, NgayTao),
  KEY IDX_BaiTimNguoi_NguoiTao (MaNguoiTao, TrangThai),
  CONSTRAINT CHK_BaiTimNguoi_TrinhDo CHECK (TrinhDoTu BETWEEN 1 AND 8 AND TrinhDoDen BETWEEN 1 AND 8 AND TrinhDoTu <= TrinhDoDen),
  CONSTRAINT CHK_BaiTimNguoi_SoNguoi CHECK (SoNguoiCan BETWEEN 1 AND 20),
  CONSTRAINT CHK_BaiTimNguoi_Gio CHECK (GioKetThuc > GioBatDau)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS DoiNhom (
  MaDoi INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaTruongNhom INT UNSIGNED NOT NULL,
  MaPhong INT UNSIGNED NOT NULL,
  TenNhom VARCHAR(120) NOT NULL,
  AnhDaiDien VARCHAR(255) NULL,
  MoTa TEXT NULL,
  KhuVuc VARCHAR(150) NULL,
  TrinhDoTu TINYINT UNSIGNED NOT NULL DEFAULT 1,
  TrinhDoDen TINYINT UNSIGNED NOT NULL DEFAULT 8,
  SoThanhVienToiDa SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  CheDoThamGia ENUM('free','approval') NOT NULL DEFAULT 'free',
  NoiQuy TEXT NULL,
  TrangThai ENUM('active','disbanded','hidden','removed') NOT NULL DEFAULT 'active',
  LyDoGo VARCHAR(500) NULL,
  MaNguoiGo INT UNSIGNED NULL,
  NgayGo DATETIME NULL,
  NgayTao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayCapNhat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT FK_DoiNhom_TruongNhom FOREIGN KEY (MaTruongNhom) REFERENCES NguoiDung(MaNguoiDung),
  CONSTRAINT FK_DoiNhom_Phong FOREIGN KEY (MaPhong) REFERENCES PhongChat(MaPhong),
  CONSTRAINT FK_DoiNhom_NguoiGo FOREIGN KEY (MaNguoiGo) REFERENCES NguoiDung(MaNguoiDung),
  UNIQUE KEY UQ_DoiNhom_Phong (MaPhong),
  KEY IDX_DoiNhom_DanhSach (TrangThai, NgayTao),
  KEY IDX_DoiNhom_TruongNhom (MaTruongNhom, TrangThai),
  CONSTRAINT CHK_DoiNhom_TrinhDo CHECK (TrinhDoTu BETWEEN 1 AND 8 AND TrinhDoDen BETWEEN 1 AND 8 AND TrinhDoTu <= TrinhDoDen),
  CONSTRAINT CHK_DoiNhom_SoThanhVien CHECK (SoThanhVienToiDa >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS YeuCauVaoDoi (
  MaYeuCau INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MaDoi INT UNSIGNED NOT NULL,
  MaNguoiDung INT UNSIGNED NOT NULL,
  TrangThai ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  MaNguoiDungPending INT UNSIGNED AS (CASE WHEN TrangThai='pending' THEN MaNguoiDung ELSE NULL END) STORED,
  NgayTao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  NgayXuLy DATETIME NULL,
  CONSTRAINT FK_YeuCauVaoDoi_Doi FOREIGN KEY (MaDoi) REFERENCES DoiNhom(MaDoi) ON DELETE CASCADE,
  CONSTRAINT FK_YeuCauVaoDoi_NguoiDung FOREIGN KEY (MaNguoiDung) REFERENCES NguoiDung(MaNguoiDung) ON DELETE CASCADE,
  UNIQUE KEY UQ_YeuCauVaoDoi_Pending (MaDoi, MaNguoiDungPending),
  KEY IDX_YeuCauVaoDoi_DoiTrangThai (MaDoi, TrangThai, NgayTao),
  KEY IDX_YeuCauVaoDoi_NguoiTrangThai (MaNguoiDung, TrangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mỗi người chỉ được một báo cáo trên mỗi đối tượng; UNIQUE hiện hữu được giữ nguyên.
ALTER TABLE BaoCaoViPham
  MODIFY LoaiDoiTuong ENUM('event','player_post','team') NOT NULL DEFAULT 'event',
  MODIFY TrangThai ENUM('pending','upheld','dismissed','rejected') NOT NULL DEFAULT 'pending',
  MODIFY HanhDong ENUM('none','hide','cancel','remove') NULL;


DELIMITER $$
DROP PROCEDURE IF EXISTS migration_g8_community_unique_report$$
CREATE PROCEDURE migration_g8_community_unique_report()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='BaoCaoViPham' AND INDEX_NAME='UQ_BaoCao_Moi'
  ) THEN
    ALTER TABLE BaoCaoViPham
      ADD UNIQUE KEY UQ_BaoCao_Moi (MaNguoiBaoCao, LoaiDoiTuong, MaDoiTuong);
  END IF;
END$$
CALL migration_g8_community_unique_report()$$
DROP PROCEDURE migration_g8_community_unique_report$$
DELIMITER ;

ALTER TABLE ThongBao
  MODIFY Loai ENUM(
    'booking_created','payment_success','payment_failed','booking_cancelled','new_booking_for_owner','system',
    'refund_requested','refund_completed','complaint_received','complaint_resolved','owner_warning','owner_banned',
    'review_received','review_replied','review_hidden','review_sent','review_reminder',
    'refund_reminder','refund_escalated','refund_received','refund_not_received','hold_expiring','confirm_expiring','checkin_success',
    'event_registered','event_accepted','event_rejected','event_removed','event_updated','event_cancelled','event_reminder','event_hidden',
    'event_payment_submitted','event_payment_confirmed','event_payment_rejected','event_payment_expired',
    'post_joined','post_left','post_cancelled','post_ended','member_removed',
    'team_request','team_accepted','team_rejected','team_disbanded','team_owner_changed',
    'community_hidden','community_removed','report_processed'
  ) NOT NULL,
  MODIFY LoaiThamChieu ENUM('booking','payment','venue','complaint','event','registration','player_post','team') NULL;

INSERT INTO CauHinhHeThong (KhoaCauHinh, GiaTri, MoTa) VALUES
 ('community_max_open_posts','5','Số bài tìm người đang mở tối đa mỗi người'),
 ('community_max_owned_teams','3','Số đội nhóm tối đa một người đang làm trưởng nhóm'),
 ('community_post_max_days','60','Số ngày tối đa từ hôm nay đến ngày chơi của bài tìm người')
ON DUPLICATE KEY UPDATE MoTa=VALUES(MoTa);
