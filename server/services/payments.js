const QRCode = require('qrcode');
const { Order } = require('../models');
const paymentConfig=()=>{
  const upiId=String(process.env.SHOP_UPI_ID||'').trim(),name=String(process.env.SHOP_UPI_NAME||'Raiyani Agro Seeds').trim();
  const reason=!upiId?'missing_id':!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(upiId)?'invalid_id':!name?'missing_name':null;
  return {upiId,name,enabled:!reason,reason};
};
const configured=()=>paymentConfig().enabled;
const flagRefund = id => Order.updateOne({ _id: id, orderStatus: 'cancelled', paymentStatus: 'paid', refundStatus: { $ne: 'completed' } }, { $set: { refundStatus: 'pending_review' } });
async function checkoutData(order) {
  if (!configured()) throw Object.assign(new Error('UPI QR payment is not configured. Contact the shop.'), { status: 503 });
  const {upiId,name}=paymentConfig();
  const params={pa:upiId,pn:name,tr:String(order._id),am:Number(order.totalAmount).toFixed(2),cu:'INR',tn:'Order '+String(order._id)};
  // Encode spaces as %20 for UPI app compatibility.
  const uri='upi://pay?'+Object.entries(params).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  const qr=await QRCode.toDataURL(uri,{errorCorrectionLevel:'M',margin:4,width:360});
  return {order,upi:{uri,qr,upiId,name,amount:order.totalAmount}};
}
module.exports={configured,paymentConfig,flagRefund,checkoutData};
