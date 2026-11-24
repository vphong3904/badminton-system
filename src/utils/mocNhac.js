// Mốc nhắc theo phút còn lại (G9.C4 nhắc chủ sân duyệt thanh toán, G9.C5 nhắc hoàn tiền).
// Mỗi lượt job chọn MỐC NHỎ NHẤT `s` thoả conPhut <= s, bỏ các mốc lớn hơn tổng hạn của khoản đó.
// Chống trùng nhờ ThongBao.KhoaChongTrung = '<loai>:<ma>:<s>' (không thêm cột): mỗi mốc chỉ nhắc 1 lần; job đến trễ
// (vd 8 phút còn lại, mốc 20/10/5) thì nhắc theo mốc 10 rồi sau đó mốc 5.
//   conPhut      : số phút còn lại đến hạn (làm tròn lên, ≥ 1)
//   cacMoc       : mảng số phút (vd [20,10,5])
//   tongHanPhut  : tổng độ dài hạn (phút); null = không giới hạn
// Trả mốc (số phút) hoặc null nếu chưa tới mốc nào.
function chonMocNhac(conPhut, cacMoc, tongHanPhut = null) {
  const cacMocHopLe = (cacMoc || []).filter((moc) => tongHanPhut === null || tongHanPhut === undefined || moc <= tongHanPhut);
  const cacMocDat = cacMocHopLe.filter((moc) => conPhut <= moc);
  return cacMocDat.length ? Math.min(...cacMocDat) : null;
}

module.exports = { chonMocNhac };
