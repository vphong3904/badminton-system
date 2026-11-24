const { pool, thucHienGiaoDich } = require('../config/db');
const AppError = require('../utils/AppError');
const nhatKy = require('./nhatKyService');
const { guiThongBao } = require('./notificationService');
const { phatChoAdmin, phatChoPhong, phatChoNguoiDung, phatSauGiaoDich } = require('../realtime/phat');

const cauHinhDoiTuong = {
  player_post: { bang: 'BaiTimNguoi', id: 'MaBai', chu: 'MaNguoiTao', ten: 'TieuDe', ref: 'player_post', nhan: 'bài tìm người chơi' },
  team: { bang: 'DoiNhom', id: 'MaDoi', chu: 'MaTruongNhom', ten: 'TenNhom', ref: 'team', nhan: 'đội nhóm' },
};
const rutGon = (v, n = 500) => String(v || '').trim().slice(0, n);

async function taoBaoCao(maNguoiBaoCao, { loaiDoiTuong, maDoiTuong, lyDo, noiDung }) {
  if (!cauHinhDoiTuong[loaiDoiTuong]) throw AppError.duLieuKhongHopLe('Loại đối tượng báo cáo không hợp lệ');
  const cfg = cauHinhDoiTuong[loaiDoiTuong];
  const ketQua = await thucHienGiaoDich(async (c) => {
    const [[doiTuong]] = await c.query(`SELECT ${cfg.id} AS id, ${cfg.chu} AS chu, ${cfg.ten} AS ten, MaPhong AS maPhong, TrangThai AS trangThai FROM ${cfg.bang} WHERE ${cfg.id}=? FOR UPDATE`, [maDoiTuong]);
    if (!doiTuong || ['removed', 'hidden'].includes(doiTuong.trangThai)) throw AppError.khongTimThay('Nội dung không tồn tại hoặc không còn hiển thị');
    if (Number(doiTuong.chu) === Number(maNguoiBaoCao)) throw AppError.khongDuQuyen('Bạn không thể báo cáo nội dung của chính mình');
    const [[daBao]] = await c.query("SELECT MaBaoCao FROM BaoCaoViPham WHERE MaNguoiBaoCao=? AND LoaiDoiTuong=? AND MaDoiTuong=?", [maNguoiBaoCao, loaiDoiTuong, maDoiTuong]);
    if (daBao) throw AppError.biTrung('Bạn đã báo cáo nội dung này rồi', 'REPORT_ALREADY_EXISTS');
    const [r] = await c.query("INSERT INTO BaoCaoViPham (MaNguoiBaoCao,LoaiDoiTuong,MaDoiTuong,LyDo,NoiDung) VALUES (?,?,?,?,?)", [maNguoiBaoCao, loaiDoiTuong, maDoiTuong, lyDo, noiDung || null]);
    return { maBaoCao: Number(r.insertId), maDoiTuong: Number(maDoiTuong), maPhong: Number(doiTuong.maPhong), tieuDe: doiTuong.ten, loaiDoiTuong };
  });
  phatSauGiaoDich(() => phatChoAdmin('bao-cao:moi', { loaiDoiTuong, maDoiTuong: Number(maDoiTuong), maBaoCao: ketQua.maBaoCao }));
  return { maBaoCao: ketQua.maBaoCao, loaiDoiTuong, maDoiTuong: ketQua.maDoiTuong, trangThai: 'pending' };
}

async function lietKeBaoCao({ trangThai = 'pending', trang = 1, soLuong = 20, loaiDoiTuong } = {}) {
  const where = ["bp.LoaiDoiTuong IN ('player_post','team')"];
  const args = [];
  if (trangThai !== 'all') { where.push('bp.TrangThai=?'); args.push(trangThai); }
  if (loaiDoiTuong) { where.push('bp.LoaiDoiTuong=?'); args.push(loaiDoiTuong); }
  const offset = (Number(trang) - 1) * Number(soLuong);
  const [rows] = await pool.query(`SELECT bp.MaBaoCao AS maBaoCao,bp.MaNguoiBaoCao AS maNguoiBaoCao,nd.HoTen AS tenNguoiBaoCao,bp.LoaiDoiTuong AS loaiDoiTuong,bp.MaDoiTuong AS maDoiTuong,bp.LyDo AS lyDo,bp.NoiDung AS noiDung,bp.TrangThai AS trangThai,bp.HanhDong AS hanhDong,bp.GhiChuQuanTri AS ghiChuQuanTri,bp.MaQuanTriXuLy AS maQuanTriXuLy,qt.HoTen AS tenQuanTriXuLy,bp.NgayTao AS ngayTao,bp.NgayXuLy AS ngayXuLy,COALESCE(b.TieuDe,d.TenNhom) AS tieuDe,COALESCE(b.TrangThai,d.TrangThai) AS trangThaiNoiDung FROM BaoCaoViPham bp JOIN NguoiDung nd ON nd.MaNguoiDung=bp.MaNguoiBaoCao LEFT JOIN NguoiDung qt ON qt.MaNguoiDung=bp.MaQuanTriXuLy LEFT JOIN BaiTimNguoi b ON bp.LoaiDoiTuong='player_post' AND b.MaBai=bp.MaDoiTuong LEFT JOIN DoiNhom d ON bp.LoaiDoiTuong='team' AND d.MaDoi=bp.MaDoiTuong WHERE ${where.join(' AND ')} ORDER BY FIELD(bp.TrangThai,'pending','upheld','rejected','dismissed'),bp.NgayTao ASC LIMIT ? OFFSET ?`, [...args, Number(soLuong), offset]);
  const [[count]] = await pool.query(`SELECT COUNT(*) AS tong FROM BaoCaoViPham bp WHERE ${where.join(' AND ')}`, args);
  return { cacBaoCao: rows, tong: Number(count.tong), trang: Number(trang), soLuong: Number(soLuong) };
}

async function xuLyBaoCao(maAdmin, maBaoCao, { quyetDinh, hanhDong = 'none', ghiChu }) {
  const ketQua = await thucHienGiaoDich(async (c) => {
    const [[bc]] = await c.query("SELECT * FROM BaoCaoViPham WHERE MaBaoCao=? AND LoaiDoiTuong IN ('player_post','team') FOR UPDATE", [maBaoCao]);
    if (!bc) throw AppError.khongTimThay('Không tìm thấy báo cáo cộng đồng');
    if (bc.TrangThai !== 'pending') throw AppError.biTrung('Báo cáo đã được xử lý', 'REPORT_ALREADY_PROCESSED');
    const cfg = cauHinhDoiTuong[bc.LoaiDoiTuong];
    const [[obj]] = await c.query(`SELECT ${cfg.id} AS id,${cfg.chu} AS chu,${cfg.ten} AS ten,MaPhong AS maPhong,TrangThai AS trangThai,LyDoGo AS lyDoGo,MaNguoiGo AS maNguoiGo,NgayGo AS ngayGo FROM ${cfg.bang} WHERE ${cfg.id}=? FOR UPDATE`, [bc.MaDoiTuong]);
    if (!obj) throw AppError.khongTimThay('Nội dung được báo cáo không còn tồn tại');
    const hanhDongLuu = quyetDinh === 'upheld' ? hanhDong : 'none';
    if (quyetDinh === 'upheld' && !['hide', 'remove'].includes(hanhDongLuu)) throw AppError.duLieuKhongHopLe('Báo cáo được chấp nhận phải chọn ẩn hoặc xóa');
    if (quyetDinh === 'rejected' && hanhDong !== 'none') throw AppError.duLieuKhongHopLe('Báo cáo bị bác không được thay đổi nội dung');
    let trangThaiMoi = obj.trangThai;
    if (quyetDinh === 'upheld') {
      trangThaiMoi = hanhDongLuu === 'hide' ? 'hidden' : 'removed';
      await c.query(`UPDATE ${cfg.bang} SET TrangThai=?,LyDoGo=?,MaNguoiGo=?,NgayGo=NOW() WHERE ${cfg.id}=?`, [trangThaiMoi, rutGon(ghiChu), maAdmin, bc.MaDoiTuong]);
      await c.query("UPDATE PhongChat SET TrangThai='readonly' WHERE MaPhong=?", [obj.maPhong]);
    }
    await c.query("UPDATE BaoCaoViPham SET TrangThai=?,HanhDong=?,GhiChuQuanTri=?,MaQuanTriXuLy=?,NgayXuLy=NOW() WHERE MaBaoCao=?", [quyetDinh, hanhDongLuu, rutGon(ghiChu), maAdmin, maBaoCao]);
    await nhatKy.ghiNhatKy(c, { maNguoiThucHien: maAdmin, hanhDong: quyetDinh === 'rejected' ? 'tu_choi_bao_cao_cong_dong' : `${hanhDongLuu === 'hide' ? 'an' : 'xoa'}_${bc.LoaiDoiTuong === 'player_post' ? 'bai' : 'nhom'}`, doiTuong: cfg.bang, maDoiTuong: bc.MaDoiTuong, chiTiet: ghiChu, truoc: { trangThai: obj.trangThai }, sau: { trangThai: trangThaiMoi, lyDoGo: quyetDinh === 'upheld' ? rutGon(ghiChu) : null, maNguoiGo: quyetDinh === 'upheld' ? maAdmin : null } });
    const [members] = await c.query("SELECT MaNguoiDung FROM ThanhVienPhong WHERE MaPhong=? AND TrangThai='active'", [obj.maPhong]);
    const recipients = new Set([Number(obj.chu), Number(bc.MaNguoiBaoCao), ...members.map(x => Number(x.MaNguoiDung))]);
    for (const uid of recipients) await guiThongBao(c, { maNguoiDung: uid, loai: quyetDinh === 'rejected' ? 'report_processed' : hanhDongLuu === 'hide' ? 'community_hidden' : 'community_removed', tieuDe: quyetDinh === 'rejected' ? 'Báo cáo cộng đồng đã được xử lý' : hanhDongLuu === 'hide' ? 'Nội dung cộng đồng đã bị ẩn' : 'Nội dung cộng đồng đã bị gỡ', noiDung: quyetDinh === 'rejected' ? `Báo cáo về ${cfg.nhan} “${obj.ten}” đã được xem xét. Kết quả: không đủ căn cứ xử lý. Lý do: ${rutGon(ghiChu, 300)}` : `${cfg.nhan} “${obj.ten}” đã được quản trị viên ${hanhDongLuu === 'hide' ? 'ẩn' : 'gỡ'} khỏi cộng đồng. Lý do: ${rutGon(ghiChu, 300)}`, loaiThamChieu: cfg.ref, maThamChieu: Number(bc.MaDoiTuong), khoa: `community_report:${maBaoCao}:${uid}` });
    return { maBaoCao: Number(maBaoCao), loaiDoiTuong: bc.LoaiDoiTuong, maDoiTuong: Number(bc.MaDoiTuong), trangThai: quyetDinh, hanhDong: hanhDongLuu, maPhong: Number(obj.maPhong), recipients: [...recipients], trangThaiNoiDung: trangThaiMoi };
  });
  if (ketQua.trangThai !== 'rejected') phatSauGiaoDich(() => { phatChoPhong(ketQua.maPhong, 'chat:phong-doi', { maPhong: ketQua.maPhong, trangThai: 'readonly', daGo: ketQua.trangThaiNoiDung === 'removed', lyDo: ghiChu }); });
  phatSauGiaoDich(() => ketQua.recipients.forEach(uid => phatChoNguoiDung(uid, 'community:noi-dung-doi', { loaiDoiTuong: ketQua.loaiDoiTuong, maDoiTuong: ketQua.maDoiTuong, trangThai: ketQua.trangThaiNoiDung })));
  return { maBaoCao: ketQua.maBaoCao, loaiDoiTuong: ketQua.loaiDoiTuong, maDoiTuong: ketQua.maDoiTuong, trangThai: ketQua.trangThai, hanhDong: ketQua.hanhDong, trangThaiNoiDung: ketQua.trangThaiNoiDung };
}

async function lietKeNoiDung(loaiDoiTuong, { trangThai = 'all', trang = 1, soLuong = 20 } = {}) {
  const cfg = cauHinhDoiTuong[loaiDoiTuong];
  if (!cfg) throw AppError.duLieuKhongHopLe('Loại nội dung không hợp lệ');
  const where = trangThai === 'all' ? '' : 'WHERE x.TrangThai=?';
  const args = trangThai === 'all' ? [] : [trangThai];
  const [rows] = await pool.query(`SELECT x.*,x.${cfg.id} AS maDoiTuong,x.${cfg.chu} AS maChuSoHuu,x.${cfg.ten} AS tieuDe,x.TrangThai AS trangThai FROM ${cfg.bang} x ${where} ORDER BY x.NgayTao DESC LIMIT ? OFFSET ?`, [...args, Number(soLuong), (Number(trang)-1)*Number(soLuong)]);
  return { [loaiDoiTuong === 'player_post' ? 'baiTimNguoi' : 'doiNhom']: rows, trang: Number(trang), soLuong: Number(soLuong) };
}

async function thayDoiNoiDung(maAdmin, loaiDoiTuong, maDoiTuong, hanhDong, lyDo) {
  const cfg = cauHinhDoiTuong[loaiDoiTuong];
  if (!cfg) throw AppError.duLieuKhongHopLe('Loại nội dung không hợp lệ');
  const ketQua = await thucHienGiaoDich(async c => {
    const [[obj]] = await c.query(`SELECT ${cfg.id} AS id,${cfg.chu} AS chu,${cfg.ten} AS ten,MaPhong AS maPhong,TrangThai AS trangThai,LyDoGo AS lyDoGo,MaNguoiGo AS maNguoiGo,NgayGo AS ngayGo FROM ${cfg.bang} WHERE ${cfg.id}=? FOR UPDATE`, [maDoiTuong]);
    if (!obj) throw AppError.khongTimThay('Không tìm thấy nội dung');
    if (hanhDong === 'bo-an' && obj.trangThai !== 'hidden') throw AppError.biTrung('Chỉ có thể bỏ ẩn nội dung đang bị ẩn');
    if (hanhDong === 'an' && obj.trangThai === 'hidden') throw AppError.biTrung('Nội dung đã bị ẩn');
    if (hanhDong === 'an' && obj.trangThai === 'removed') throw AppError.biTrung('Nội dung đã bị gỡ, không thể ẩn lại');
    if (hanhDong === 'xoa' && obj.trangThai === 'removed') throw AppError.biTrung('Nội dung đã bị gỡ');
    let trangThaiKhoiPhuc = loaiDoiTuong === 'player_post' ? 'open' : 'active';
    if (hanhDong === 'bo-an') {
      const actionAn = loaiDoiTuong === 'player_post' ? 'an_bai' : 'an_nhom';
      const [[logAn]] = await c.query('SELECT DuLieuTruoc FROM NhatKyHeThong WHERE DoiTuong=? AND MaDoiTuong=? AND HanhDong=? ORDER BY MaNhatKy DESC LIMIT 1', [cfg.bang, maDoiTuong, actionAn]);
      try { const before = JSON.parse(logAn?.DuLieuTruoc || '{}'); if (['open','full','closed','active'].includes(before.trangThai)) trangThaiKhoiPhuc = before.trangThai; } catch (_) { /* giữ trạng thái mặc định an toàn */ }
    }
    const next = hanhDong === 'bo-an' ? trangThaiKhoiPhuc : hanhDong === 'an' ? 'hidden' : 'removed';
    await c.query(`UPDATE ${cfg.bang} SET TrangThai=?,LyDoGo=?,MaNguoiGo=?,NgayGo=? WHERE ${cfg.id}=?`, [next, hanhDong === 'bo-an' ? null : rutGon(lyDo), hanhDong === 'bo-an' ? null : maAdmin, hanhDong === 'bo-an' ? null : new Date(), maDoiTuong]);
    await c.query("UPDATE PhongChat SET TrangThai=? WHERE MaPhong=?", [hanhDong === 'bo-an' ? 'open' : 'readonly', obj.maPhong]);
    await nhatKy.ghiNhatKy(c, { maNguoiThucHien: maAdmin, hanhDong: `${hanhDong === 'bo-an' ? 'bo_an' : hanhDong === 'an' ? 'an' : 'xoa'}_${loaiDoiTuong === 'player_post' ? 'bai' : 'nhom'}`, doiTuong: cfg.bang, maDoiTuong, chiTiet: lyDo, truoc: { trangThai: obj.trangThai, lyDoGo: obj.lyDoGo }, sau: { trangThai: next, lyDoGo: hanhDong === 'bo-an' ? null : lyDo, maNguoiGo: hanhDong === 'bo-an' ? null : maAdmin } });
    const [members] = await c.query("SELECT MaNguoiDung FROM ThanhVienPhong WHERE MaPhong=? AND TrangThai='active'", [obj.maPhong]);
    const [reporters] = await c.query('SELECT DISTINCT MaNguoiBaoCao FROM BaoCaoViPham WHERE LoaiDoiTuong=? AND MaDoiTuong=?', [loaiDoiTuong, maDoiTuong]);
    const recipients = new Set([Number(obj.chu), ...members.map(x => Number(x.MaNguoiDung)), ...reporters.map(x => Number(x.MaNguoiBaoCao))]);
    for (const uid of recipients) if (hanhDong !== 'bo-an') await guiThongBao(c, { maNguoiDung: uid, loai: hanhDong === 'an' ? 'community_hidden' : 'community_removed', tieuDe: hanhDong === 'an' ? 'Nội dung cộng đồng đã bị ẩn' : 'Nội dung cộng đồng đã bị gỡ', noiDung: `${cfg.nhan} “${obj.ten}” đã bị quản trị viên ${hanhDong === 'an' ? 'ẩn' : 'gỡ'}. Lý do: ${rutGon(lyDo, 300)}`, loaiThamChieu: cfg.ref, maThamChieu: Number(maDoiTuong), khoa: `community_moderation:${loaiDoiTuong}:${maDoiTuong}:${next}:${Date.now()}:${uid}` });
    return { maDoiTuong: Number(maDoiTuong), maPhong: Number(obj.maPhong), recipients: [...recipients], trangThai: next };
  });
  phatSauGiaoDich(() => { phatChoPhong(ketQua.maPhong, 'chat:phong-doi', { maPhong: ketQua.maPhong, trangThai: hanhDong === 'bo-an' ? 'open' : 'readonly', daGo: hanhDong === 'xoa', lyDo: lyDo || null }); ketQua.recipients.forEach(uid => phatChoNguoiDung(uid, 'community:noi-dung-doi', { loaiDoiTuong, maDoiTuong: ketQua.maDoiTuong, trangThai: ketQua.trangThai })); });
  return { maDoiTuong: ketQua.maDoiTuong, trangThai: ketQua.trangThai };
}
module.exports = { taoBaoCao, lietKeBaoCao, xuLyBaoCao, lietKeNoiDung, thayDoiNoiDung };
