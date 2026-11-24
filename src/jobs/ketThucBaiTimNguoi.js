const { ketThucBaiHetHan } = require('../services/communityService');
let timer=null;
function batDauJob(){
  if(timer)return;
  const chay=async()=>{try{const rows=await ketThucBaiHetHan();const {phatChoPhong}=require('../realtime/phat');for(const r of rows)phatChoPhong(r.maPhong,'chat:phong-doi',{maPhong:r.maPhong,trangThai:'readonly',lyDo:'Bài tìm người đã kết thúc'});}catch(e){console.error('[job-ket-thuc-bai-tim-nguoi]',e.message);}};
  chay();timer=setInterval(chay,5*60*1000);if(timer.unref)timer.unref();
}
module.exports={batDauJob};
