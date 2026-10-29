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
Object.assign(labels, { partial: 'ભાગની ચુકવણી', 'Pay later': 'પછી ચુકવણી', 'Received': 'મળેલી રકમ', 'Balance due': 'બાકી રકમ', 'Part payment received; balance remains due.': 'ચુકવણીનો એક ભાગ મળ્યો છે; બાકી રકમ ચૂકવવાની છે.' });
function createInvoice(order,{lang='en'}={}){
  return new Promise((resolve,reject)=>{
    const gu=lang==='gu',t=s=>gu?(labels[s]||s):s;
    const id=String(order._id),invoiceNumber=(order.source==='counter'?'CS-':'RA-')+id.toUpperCase();
    const doc=new PDFDocument({size:'A4',margins:{top:44,left:48,right:48,bottom:52},bufferPages:true,info:{Title:'Purchase invoice '+invoiceNumber,Author:'Raiyani Agro Seeds'}});
    const chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
    try{
      const assets=path.join(__dirname,'../assets');
      doc.registerFont('Regular',path.join(assets,'gujarati-400.ttf'));doc.registerFont('Bold',path.join(assets,'gujarati-700.ttf'));
      const x=48,w=doc.page.width-96,bottom=doc.page.height-76;
      const money=value=>'INR '+Number(value || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
      const safe=value=>String(value ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g,'').slice(0,4000);
      const shop=process.env.SHOP_NAME || (gu?'રૈયાણી એગ્રો સીડ્સ':'Raiyani Agro Seeds');
      const address=process.env.SHOP_ADDRESS || 'Shop No 2, New Marketing Yard, Gondal, Gujarat 360311, India';
      const phone=process.env.SHOP_PHONE || '+91 97146 23500';
      const email=process.env.SHOP_EMAIL || 'raiyaniagroseeds.support@gmail.com';
      let y;
      function header(){
        doc.rect(0,0,doc.page.width,7).fill('#244f3b');
        doc.image(path.join(assets,gu?'logo-gu.png':'logo-en.png'),x,36,{width:58,height:58});
        doc.font('Bold').fontSize(15).fillColor('#214b32').text(safe(shop),x+72,38,{width:245,height:36});
        doc.font('Regular').fontSize(8.5).fillColor('#617063').text(safe(address),x+72,76,{width:w-72,height:30});
        doc.fontSize(8).text(safe(phone)+'  |  '+safe(email),x+72,110,{width:w-72,height:15});
        doc.font('Bold').fontSize(12).fillColor('#214b32').text(t('Purchase invoice'),386,38,{width:162,align:'right'});
        doc.roundedRect(x,140,w,48,8).fill('#f1f4ec');
        doc.font('Regular').fontSize(7.5).fillColor('#617063').text(t('Invoice'),x+12,148,{width:340});
        doc.font('Bold').fontSize(9).fillColor('#263a2e').text(invoiceNumber,x+12,164,{width:340});
        const date=order.createdAt?new Date(order.createdAt):null;
        doc.font('Regular').fontSize(7.5).fillColor('#617063').text(t('Date'),425,148,{width:110,align:'right'});
        doc.font('Bold').fontSize(9).fillColor('#263a2e').text(date&&!Number.isNaN(date.valueOf())?date.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'-',425,164,{width:110,align:'right'});
        y=207;
      }
      function next(){doc.addPage();header();}
      function ensure(height){if(y+height>bottom)next();}
      function block(text,{bold=false,size=10,color='#263a2e'}={}){
        for(const part of safe(text).match(/.{1,350}(?:\s|$)|.{1,350}/gs)||['']){
          doc.font(bold?'Bold':'Regular').fontSize(size);const height=doc.heightOfString(part,{width:w,lineGap:2});ensure(height+8);
          doc.font(bold?'Bold':'Regular').fontSize(size).fillColor(color).text(part,x,y,{width:w,lineGap:2});y+=height+7;
        }
      }
      header();
      const state=order.orderStatus || 'placed',payment=order.paymentStatus || 'pending';
      const notice=state==='cancelled'?'Cancelled order - do not pay this invoice.':payment==='paid'?'Payment recorded as received by the shop.':payment==='partial'?'Part payment received; balance remains due.':payment==='refunded'?'Refund recorded as completed by the shop.':'Payment pending - this invoice is not a payment receipt.';
      doc.font('Bold').fontSize(9);
      const noticeHeight=doc.heightOfString(t(notice),{width:w-24,lineGap:2})+22;
      doc.roundedRect(x,y,w,noticeHeight,7).fill(state==='cancelled'?'#fbede7':payment==='paid'?'#eaf2e5':'#f7f2e4');
      doc.fillColor(state==='cancelled'?'#a73522':'#214b32').text(t(notice),x+12,y+10,{width:w-24,lineGap:2});
      y+=noticeHeight+15;
      const method=order.paymentMethod==='later'?'Pay later':order.paymentMethod==='cash'?(gu?'રોકડ':'Cash'):order.paymentMethod==='card'?(gu?'કાર્ડ':'Card'):order.paymentMethod==='upi'?(order.source==='counter'?'UPI':'UPI QR'):order.paymentMethod==='cod'?'Cash on Delivery':'Online';
      block(t('Payment')+': '+t(method)+' / '+t(payment));
      block(t('Order status')+': '+t(state));
      if(order.transactionId||order.paymentReference)block(t('Bank reference')+': '+safe(order.transactionId||order.paymentReference));
      y+=6;block(t('Bill to'),{bold:true,size:9,color:'#617063'});
      block(order.shipping?.name || order.user?.name || '-',{bold:true,size:11});
      if(order.user?.email)block(order.user.email);
      if(order.shipping?.phone)block(t('Phone')+': '+safe(order.shipping.phone));
      if(order.shipping?.address)block(order.shipping.address);
      y+=9;
      function tableHeader(){
        ensure(44);doc.roundedRect(x,y,w,32,5).fill('#244f3b');doc.font('Bold').fontSize(8.5).fillColor('#fffdf4');
        for(const [label,left,width,align]of [['Item',x+12,224,'left'],['Qty',292,34,'right'],['Unit price',338,90,'right'],['Amount',442,94,'right']])doc.text(t(label),left,y+9,{width,align,lineBreak:false});
        y+=36;
      }
      tableHeader();
      let row=0;
      for(const item of order.items || []){
        const name=(gu && item.nameGu ? item.nameGu : item.name)+(item.unit?' ('+item.unit+')':'');
        const parts=safe(name).match(/.{1,220}(?:\s|$)|.{1,220}/gs)||['-'];
        for(let n=0;n<parts.length;n++){
          doc.font('Regular').fontSize(9);
          const lineAmount=order.source==='counter'?Math.round(Math.round(Number(item.price)*100)*Number(item.qty))/100:Number(item.price)*Number(item.qty);
          const values=n===0?[[String(item.qty),292,34],[money(item.price),338,90],[money(lineAmount),442,94]]:[];
          const height=Math.max(34,doc.heightOfString(parts[n],{width:224,lineGap:2})+20,...values.map(([text,,width])=>doc.heightOfString(text,{width,lineGap:2})+20));
          if(y+height>bottom){next();tableHeader();}
          if(row++%2===0)doc.rect(x,y,w,height).fill('#f7f8f3');
          doc.font('Regular').fontSize(9).fillColor('#263a2e').text(parts[n],x+12,y+9,{width:224,lineGap:2});
          for(const [text,left,width]of values)doc.text(text,left,y+9,{width,align:'right',lineGap:2});
          y+=height;doc.strokeColor('#e1e7da').moveTo(x,y).lineTo(x+w,y).stroke();
        }
      }
      ensure(170);y+=18;
      const totals=[['Items total',order.itemsTotal,false],...(order.source==='counter'?[]:[['Delivery',order.shippingFee,false]]),...(order.discount?[['Discount',-order.discount,false]]:[]),['Total',order.totalAmount,true]];
      if(order.source==='counter'){
        const amounts=require('./bookkeeping').financials(order);
        totals.push(['Received',amounts.paidCents/100,false],['Balance due',amounts.balanceCents/100,true]);
      }
      for(const [label,amount,bold]of totals){
        doc.font(bold?'Bold':'Regular').fontSize(bold?12:9);
        const labelText=label==='Discount'&&gu?'છૂટ':t(label);
        const height=Math.max(bold?42:28,doc.heightOfString(money(amount),{width:112})+18,doc.heightOfString(labelText,{width:105})+18);
        ensure(height+18);
        doc.font(bold?'Bold':'Regular').fontSize(bold?12:9);
        doc.roundedRect(300,y,w-252,height,5).fill(bold?'#244f3b':'#f1f4ec');
        doc.fillColor(bold?'#fffdf4':'#214b32').text(labelText,312,y+9,{width:105});
        doc.text(money(amount),423,y+9,{width:112,align:'right'});y+=height+3;
      }
      y+=14;
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
