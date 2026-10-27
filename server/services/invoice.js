const PDFDocument=require('pdfkit');
const path=require('path');
const labels={
  'Purchase invoice':'ખરીદીનું બિલ','Invoice':'બિલ','Order':'ઓર્ડર','Date':'તારીખ','Bill to':'ગ્રાહકની વિગતો','Phone':'ફોન','Item':'વસ્તુ','Qty':'જથ્થો','Unit price':'એકમ કિંમત','Amount':'રકમ','Items total':'વસ્તુઓનું કુલ','Delivery':'ડિલિવરી','Total':'કુલ','Payment':'ચુકવણી','Order status':'ઓર્ડરની સ્થિતિ','Bank reference':'બેંક સંદર્ભ','UPI QR':'UPI QR','Cash on Delivery':'ડિલિવરી સમયે રોકડ','Online':'ઓનલાઈન','pending':'બાકી','paid':'ચૂકવાયેલો','failed':'નિષ્ફળ','refunded':'રિફંડ થયેલો','placed':'મૂકાયેલો','confirmed':'ખાતરી થયેલો','shipped':'મોકલાયેલો','delivered':'પહોંચાડાયેલો','cancelled':'રદ થયેલો',
  'Payment pending - this invoice is not a payment receipt.':'ચુકવણી બાકી છે - આ બિલ ચુકવણીની રસીદ નથી.',
  'Cancelled order - do not pay this invoice.':'ઓર્ડર રદ થયો છે - આ બિલની ચુકવણી કરશો નહીં.',
  'Payment recorded as received by the shop.':'દુકાને ચુકવણી મળ્યાની નોંધ કરી છે.',
  'Refund recorded as completed by the shop.':'દુકાને રિફંડ પૂર્ણ થયાની નોંધ કરી છે.',
  'Order purchase record. Tax is not itemized.':'ઓર્ડરની ખરીદીની નોંધ. કરની અલગ ગણતરી દર્શાવેલી નથી.',
  'Thank you for shopping with us.':'અમારી પાસેથી ખરીદી કરવા બદલ આભાર.', 'Page':'પાનું','of':'માંથી','Continued':'આગળ ચાલુ'
};
function createInvoice(order,{lang='en'}={}){
  return new Promise((resolve,reject)=>{
    const gu=lang==='gu',t=s=>gu?(labels[s]||s):s;
    const id=String(order._id),invoiceNumber='RA-'+id.toUpperCase();
    const doc=new PDFDocument({size:'A4',margins:{top:44,left:48,right:48,bottom:52},bufferPages:true,info:{Title:'Purchase invoice '+invoiceNumber,Author:'Raiyani Agro Seeds'}});
    const chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
    try{
      const assets=path.join(__dirname,'../assets');
      doc.registerFont('Regular',path.join(assets,'gujarati-400.ttf'));doc.registerFont('Bold',path.join(assets,'gujarati-700.ttf'));
      const x=48,w=doc.page.width-96,bottom=doc.page.height-76;
      const money=value=>'INR '+Number(value || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
      const safe=value=>String(value ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g,'').slice(0,4000);
      const shop=process.env.SHOP_NAME || (gu?'રૈયાણી એગ્રો સીડ્સ':'Raiyani Agro Seeds');
      const address=process.env.SHOP_ADDRESS || 'Gondal, Gujarat';
      let y;
      function header(){
        doc.image(path.join(assets,gu?'logo-gu.png':'logo-en.png'),x,40,{width:66,height:66});
        doc.font('Bold').fontSize(15).fillColor('#214b32').text(shop,x+80,42,{width:260});
        doc.font('Regular').fontSize(9).fillColor('#617063').text(safe(address),x+80,70,{width:260,height:30});
        doc.font('Bold').fontSize(13).fillColor('#214b32').text(t('Purchase invoice'),386,42,{width:162,align:'right'});
        doc.font('Regular').fontSize(8).fillColor('#405448').text(t('Invoice')+': '+invoiceNumber,x,120,{width:w});
        const date=order.createdAt?new Date(order.createdAt):null;
        doc.text(t('Date')+': '+(date&&!Number.isNaN(date.valueOf())?date.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'-'),x,138,{width:w});
        doc.strokeColor('#ccd5c7').moveTo(x,160).lineTo(x+w,160).stroke();y=177;
      }
      function next(){doc.addPage();header();}
      function ensure(height){if(y+height>bottom)next();}
      function block(text,{bold=false,size=10,color='#263a2e'}={}){
        for(const part of safe(text).match(/.{1,350}(?:\s|$)|.{1,350}/gs)||['']){
          doc.font(bold?'Bold':'Regular').fontSize(size);const height=doc.heightOfString(part,{width:w,lineGap:2});ensure(height+8);
          doc.fillColor(color).text(part,x,y,{width:w,lineGap:2});y+=height+7;
        }
      }
      header();
      const state=order.orderStatus || 'placed',payment=order.paymentStatus || 'pending';
      const notice=state==='cancelled'?'Cancelled order - do not pay this invoice.':payment==='paid'?'Payment recorded as received by the shop.':payment==='refunded'?'Refund recorded as completed by the shop.':'Payment pending - this invoice is not a payment receipt.';
      block(t(notice),{bold:true,color:state==='cancelled'?'#a73522':'#214b32'});
      block(t('Payment')+': '+t(order.paymentMethod==='upi'?'UPI QR':order.paymentMethod==='cod'?'Cash on Delivery':'Online')+' / '+t(payment));
      block(t('Order status')+': '+t(state));
      if(order.transactionId||order.paymentReference)block(t('Bank reference')+': '+safe(order.transactionId||order.paymentReference));
      y+=5;block(t('Bill to'),{bold:true});
      block(order.shipping?.name || order.user?.name || '-');
      if(order.user?.email)block(order.user.email);
      if(order.shipping?.phone)block(t('Phone')+': '+safe(order.shipping.phone));
      if(order.shipping?.address)block(order.shipping.address);
      y+=9;
      function tableHeader(){
        ensure(36);doc.rect(x,y,w,27).fill('#edf2e5');doc.font('Bold').fontSize(9).fillColor('#214b32');
        for(const [label,left,width,align]of [['Item',x+9,266,'left'],['Qty',330,38,'right'],['Unit price',379,73,'right'],['Amount',463,76,'right']])doc.text(t(label),left,y+7,{width,align,lineBreak:false});
        y+=32;
      }
      tableHeader();
      for(const item of order.items || []){
        const parts=safe(gu && item.nameGu ? item.nameGu : item.name).match(/.{1,220}(?:\s|$)|.{1,220}/gs)||['-'];
        for(let n=0;n<parts.length;n++){
          doc.font('Regular').fontSize(9);const height=Math.max(26,doc.heightOfString(parts[n],{width:266,lineGap:2})+15);
          if(y+height>bottom){next();tableHeader();}
          doc.fillColor('#263a2e').text(parts[n],x+9,y+5,{width:266,lineGap:2});
          if(n===0){doc.text(String(item.qty),330,y+5,{width:38,align:'right'});doc.text(money(item.price),379,y+5,{width:73,align:'right'});doc.text(money(Number(item.price)*Number(item.qty)),463,y+5,{width:76,align:'right'});}
          y+=height;doc.strokeColor('#e1e7da').moveTo(x,y).lineTo(x+w,y).stroke();
        }
      }
      ensure(140);y+=17;
      for(const [label,amount,bold]of [['Items total',order.itemsTotal,false],['Delivery',order.shippingFee,false],['Total',order.totalAmount,true]]){
        doc.font(bold?'Bold':'Regular').fontSize(bold?13:10).fillColor('#214b32');
        doc.text(t(label),310,y,{width:124});doc.text(money(amount),440,y,{width:108,align:'right'});y+=bold?32:24;
      }
      block(t('Order purchase record. Tax is not itemized.'),{size:8,color:'#617063'});
      const range=doc.bufferedPageRange();
      for(let i=0;i<range.count;i++){
        doc.switchToPage(i);const previousBottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Regular').fontSize(8).fillColor('#617063');
        doc.text(t('Thank you for shopping with us.'),x,doc.page.height-44,{width:370,lineBreak:false});
        doc.text(t('Page')+' '+(i+1)+' '+t('of')+' '+range.count,440,doc.page.height-44,{width:108,align:'right',lineBreak:false});
        doc.page.margins.bottom=previousBottom;
      }
      doc.end();
    }catch(e){doc.destroy();reject(e);}
  });
}
module.exports={createInvoice};
