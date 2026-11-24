const dichVu=require('../services/communityService');
const xuLy=require('../utils/asyncHandler');
const {thanhCong}=require('../utils/response');
const {phatChoPhong,phatChoNguoiDung,xoaNguoiDungKhoiPhong}=require('../realtime/phat');
const uid=req=>req.nguoiDung.maNguoiDung;
const {luuAnh}=require('../middlewares/upload');
const AppError=require('../utils/AppError');
exports.taiAnh=xuLy(async(req,res)=>{
  if(!req.file)throw AppError.duLieuKhongHopLe('Thiếu file ảnh (trường tepAnh)');
  const duongDan=await luuAnh(req.file,'cong-dong',`cd${uid(req)}`);
  thanhCong(res,{duongDan},201);
});
// Bài tìm người chơi
exports.lietKeBai=xuLy(async(req,res)=>thanhCong(res,await dichVu.lietKeBai(req.query,uid(req))));
exports.cuaToiBai=xuLy(async(req,res)=>thanhCong(res,await dichVu.cuaToiBai(uid(req))));
exports.layBai=xuLy(async(req,res)=>thanhCong(res,await dichVu.layBai(uid(req),req.params.id)));
exports.taoBai=xuLy(async(req,res)=>thanhCong(res,await dichVu.taoBai(uid(req),req.body),201));
exports.suaBai=xuLy(async(req,res)=>thanhCong(res,await dichVu.suaBai(uid(req),req.params.id,req.body)));
exports.thamGiaBai=xuLy(async(req,res)=>{const r=await dichVu.thamGiaBai(uid(req),req.params.id);phatChoPhong(r.maPhong,'chat:thanh-vien-doi',{maPhong:r.maPhong});thanhCong(res,r,201);});
exports.roiBai=xuLy(async(req,res)=>{const r=await dichVu.roiBai(uid(req),req.params.id);const b=await dichVu.layBai(uid(req),req.params.id).catch(()=>null);if(b)phatChoPhong(b.maPhong,'chat:thanh-vien-doi',{maPhong:b.maPhong});thanhCong(res,r);});
exports.dongBai=xuLy(async(req,res)=>thanhCong(res,await dichVu.dongMoBai(uid(req),req.params.id,true)));
exports.moBai=xuLy(async(req,res)=>thanhCong(res,await dichVu.dongMoBai(uid(req),req.params.id,false)));
exports.huyBai=xuLy(async(req,res)=>{const r=await dichVu.huyBai(uid(req),req.params.id);phatChoPhong(r.maPhong,'chat:phong-doi',{maPhong:r.maPhong,trangThai:'readonly'});thanhCong(res,r);});
exports.xoaThanhVienBai=xuLy(async(req,res)=>{const r=await dichVu.xoaThanhVienBai(uid(req),req.params.id,req.params.maNguoiDung);const b=await dichVu.layBai(uid(req),req.params.id);phatChoPhong(b.maPhong,'chat:thanh-vien-doi',{maPhong:b.maPhong});phatChoNguoiDung(r.maNguoiDung,'chat:bi-xoa',{maPhong:b.maPhong});xoaNguoiDungKhoiPhong(r.maNguoiDung,b.maPhong);thanhCong(res,r);});
// Đội nhóm
exports.lietKeDoi=xuLy(async(req,res)=>thanhCong(res,await dichVu.lietKeDoi(req.query,uid(req))));
exports.cuaToiDoi=xuLy(async(req,res)=>thanhCong(res,await dichVu.cuaToiDoi(uid(req))));
exports.layDoi=xuLy(async(req,res)=>thanhCong(res,await dichVu.layDoi(uid(req),req.params.id)));
exports.taoDoi=xuLy(async(req,res)=>thanhCong(res,await dichVu.taoDoi(uid(req),req.body),201));
exports.suaDoi=xuLy(async(req,res)=>thanhCong(res,await dichVu.capNhatDoi(uid(req),req.params.id,req.body)));
exports.thamGiaDoi=xuLy(async(req,res)=>{const r=await dichVu.thamGiaDoi(uid(req),req.params.id);if(r.trangThai==='active'&&r.maPhong)phatChoPhong(r.maPhong,'chat:thanh-vien-doi',{maPhong:r.maPhong});thanhCong(res,r,201);});
exports.duyetYeuCau=xuLy(async(req,res)=>{const r=await dichVu.xuLyYeuCau(uid(req),req.params.id,req.params.maYeuCau,true);if(r.trangThai==='accepted')phatChoPhong(r.maPhong,'chat:thanh-vien-doi',{maPhong:r.maPhong});thanhCong(res,r);});
exports.tuChoiYeuCau=xuLy(async(req,res)=>thanhCong(res,await dichVu.xuLyYeuCau(uid(req),req.params.id,req.params.maYeuCau,false)));
exports.huyYeuCau=xuLy(async(req,res)=>thanhCong(res,await dichVu.huyYeuCau(uid(req),req.params.id)));
exports.roiDoi=xuLy(async(req,res)=>{const r=await dichVu.roiDoi(uid(req),req.params.id);const d=await dichVu.layDoi(uid(req),req.params.id).catch(()=>null);if(d)phatChoPhong(d.maPhong,'chat:thanh-vien-doi',{maPhong:d.maPhong});thanhCong(res,r);});
exports.xoaThanhVienDoi=xuLy(async(req,res)=>{const r=await dichVu.xoaThanhVienDoi(uid(req),req.params.id,req.params.maNguoiDung);const d=await dichVu.layDoi(uid(req),req.params.id);phatChoPhong(d.maPhong,'chat:thanh-vien-doi',{maPhong:d.maPhong});phatChoNguoiDung(r.maNguoiDung,'chat:bi-xoa',{maPhong:d.maPhong});xoaNguoiDungKhoiPhong(r.maNguoiDung,d.maPhong);thanhCong(res,r);});
exports.chuyenQuyen=xuLy(async(req,res)=>{const r=await dichVu.chuyenQuyen(uid(req),req.params.id,req.body.maNguoiDungMoi);const d=await dichVu.layDoi(uid(req),req.params.id);phatChoPhong(d.maPhong,'chat:thanh-vien-doi',{maPhong:d.maPhong});thanhCong(res,r);});
exports.giaiTan=xuLy(async(req,res)=>{const r=await dichVu.giaiTan(uid(req),req.params.id);phatChoPhong(r.maPhong,'chat:phong-doi',{maPhong:r.maPhong,trangThai:'readonly'});thanhCong(res,r);});
