const dichVu = require('../services/customerService');
const dichVuKhieuNai = require('../services/complaintService');
const xuLyBatDongBo = require('../utils/asyncHandler');
const { thanhCong, daTao } = require('../utils/response');
const { phatCapNhatDatSan, phatNhieuCapNhatDatSan } = require('../realtime/datSan');

const xuLy = (hamXuLy, dinhDang = thanhCong) =>
  xuLyBatDongBo(async (yeuCau, phanHoi) => dinhDang(phanHoi, await hamXuLy(yeuCau)));

exports.timCoSo = xuLy((yeuCau) => dichVu.timCoSo(yeuCau.query));
exports.layDanhSachCoSo = xuLy(() => dichVu.layDanhSachCoSo());
exports.layChiTietCoSo = xuLy((yeuCau) => dichVu.layChiTietCoSo(yeuCau.params.maCoSo));
exports.layDanhSachDanhGia = xuLy((yeuCau) =>
  dichVu.layDanhSachDanhGia(yeuCau.params.maCoSo, yeuCau.query));
exports.layChiTietSan = xuLy((yeuCau) => dichVu.layChiTietSan(yeuCau.params.maSan));
exports.layLichNgay = xuLy((yeuCau) =>
  dichVu.layLichNgay(yeuCau.params.maCoSo, yeuCau.query.ngay));
exports.kiemTraTrong = xuLy((yeuCau) => dichVu.kiemTraTrong(yeuCau.params.maSan, yeuCau.query));
exports.datLe = xuLy(async (yeuCau) => { const r = await dichVu.taoDatSan(yeuCau.nguoiDung.maNguoiDung, yeuCau.body); await phatNhieuCapNhatDatSan((r.cacDon || []).map(x => x.maDatSan)); return r; }, daTao);
exports.datCoDinh = xuLy(async (yeuCau) => { const r = await dichVu.taoDatSan(yeuCau.nguoiDung.maNguoiDung, yeuCau.body, yeuCau.body.ngayKetThuc); await phatNhieuCapNhatDatSan((r.cacDon || []).map(x => x.maDatSan)); return r; }, daTao);
exports.datNhieu = xuLy(async (yeuCau) => { const r = await dichVu.taoDatNhieuSan(yeuCau.nguoiDung.maNguoiDung, yeuCau.body); await phatNhieuCapNhatDatSan((r.cacDon || []).map(x => x.maDatSan)); return r; }, daTao);
exports.lietKeDatSan = xuLy((yeuCau) => dichVu.lietKeDatSan(yeuCau.nguoiDung.maNguoiDung));
exports.layHoaDonNhap = xuLy((yeuCau) =>
  dichVu.layHoaDonNhap(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
exports.huyDatSan = xuLy(async (yeuCau) => { const r = await dichVu.huyDatSan(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body?.taiKhoanHoan ?? null); await phatCapNhatDatSan(yeuCau.params.maDatSan); return r; });
exports.xemTruocHuy = xuLy((yeuCau) =>
  dichVu.xemTruocHuy(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
exports.guiDanhGia = xuLy((yeuCau) =>
  dichVu.guiDanhGia(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body), daTao);
exports.suaDanhGia = xuLy((yeuCau) =>
  dichVu.suaDanhGia(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body));
exports.xoaDanhGia = xuLy((yeuCau) =>
  dichVu.xoaDanhGia(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan));
exports.capNhatTaiKhoanHoan = xuLy((yeuCau) =>
  dichVu.capNhatTaiKhoanHoan(
    yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body));
exports.layDanhSachYeuThich = xuLy((yeuCau) =>
  dichVu.layDanhSachYeuThich(yeuCau.nguoiDung.maNguoiDung));
exports.themYeuThich = xuLy((yeuCau) =>
  dichVu.themYeuThich(yeuCau.nguoiDung.maNguoiDung, yeuCau.body.maCoSo), daTao);
exports.boYeuThich = xuLy((yeuCau) =>
  dichVu.boYeuThich(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maCoSo));
exports.guiKhieuNai = xuLy((yeuCau) =>
  dichVuKhieuNai.guiKhieuNai(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maDatSan, yeuCau.body), daTao);
exports.khieuNaiHoanTien = xuLy((yeuCau) =>
  dichVuKhieuNai.guiKhieuNaiHoanTien(yeuCau.nguoiDung.maNguoiDung, yeuCau.params.maHoanTien, yeuCau.body), daTao);
exports.lietKeKhieuNai = xuLy((yeuCau) =>
  dichVuKhieuNai.lietKeKhieuNaiCuaKhach(yeuCau.nguoiDung.maNguoiDung));
