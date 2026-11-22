const AppError = require('./AppError');

function doiGioRaPhut(gio) {
  const [gioTrongNgay, phutTrongGio] = String(gio).split(':');
  return Number(gioTrongNgay) * 60 + Number(phutTrongGio);
}

function doiPhutRaGio(phut) {
  return `${String(Math.floor(phut / 60)).padStart(2, '0')}:${String(phut % 60).padStart(2, '0')}`;
}

function kiemTraKhungGia(cacKhungGia, gioMoCua, gioDongCua) {
  const phutMoCua = doiGioRaPhut(gioMoCua);
  const phutDongCua = doiGioRaPhut(gioDongCua);
  const khungGiaDaSapXep = [...cacKhungGia].sort(
    (khungGiaA, khungGiaB) => doiGioRaPhut(khungGiaA.gioBatDau) - doiGioRaPhut(khungGiaB.gioBatDau));
  let phutKetThucTruoc = -1;
  for (const khungGia of khungGiaDaSapXep) {
    const phutBatDau = doiGioRaPhut(khungGia.gioBatDau);
    const phutKetThuc = doiGioRaPhut(khungGia.gioKetThuc);
    if (phutKetThuc <= phutBatDau) {
      throw AppError.duLieuKhongHopLe(`Khung giờ ${khungGia.gioBatDau}-${khungGia.gioKetThuc} không hợp lệ`);
    }
    if (phutBatDau < phutMoCua || phutKetThuc > phutDongCua) {
      throw AppError.duLieuKhongHopLe(
        `Khung giờ ${khungGia.gioBatDau}-${khungGia.gioKetThuc} nằm ngoài giờ mở cửa ${gioMoCua}-${gioDongCua}`);
    }
    if (phutBatDau < phutKetThucTruoc) {
      throw AppError.duLieuKhongHopLe('Các khung giờ giá bị chồng nhau');
    }
    phutKetThucTruoc = phutKetThuc;
  }
}

module.exports = { doiGioRaPhut, doiPhutRaGio, kiemTraKhungGia };
