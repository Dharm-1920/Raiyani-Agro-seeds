const {test}=require('node:test');const assert=require('node:assert/strict');const {createInvoice}=require('../services/invoice');
const sample={_id:'000000000000000000000123',createdAt:'2026-10-01T03:00:00Z',shipping:{name:'Customer',phone:'9876543210',address:'Gondal, Gujarat'},items:[{name:'Seeds',qty:2,price:200}],itemsTotal:400,shippingFee:40,totalAmount:440,paymentMethod:'cod',paymentStatus:'pending',orderStatus:'confirmed'};
const pages=buffer=>(buffer.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
test('short purchase invoice generates one page without empty footer pages',async()=>{const pdf=await createInvoice(sample);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.equal(pages(pdf),1);});
test('Gujarati invoice embeds its font and supports customer/product text',async()=>{const pdf=await createInvoice({...sample,shipping:{...sample.shipping,name:'ધર્મ રૈયાણી',address:'ગોંડલ, ગુજરાત'},items:[{name:'મગફળીનું બિયારણ',qty:2,price:200}]},{lang:'gu'});assert.equal(pages(pdf),1);assert.match(pdf.toString('latin1'),/FontFile2/);});
test('large purchase invoice paginates instead of dropping line items',async()=>{const items=Array.from({length:70},(_,i)=>({name:'Farm product '+(i+1)+' long specification of the purchased farm essential',qty:1,price:100}));const pdf=await createInvoice({...sample,items,itemsTotal:7000,shippingFee:0,totalAmount:7000});assert.ok(pages(pdf)>1);assert.ok(pages(pdf)<20);});
for(const lang of ['en','gu'])for(const [paymentStatus,paidCents]of [['pending',0],['partial',100000],['paid',250000]]){
  test(`counter bill PDF renders ${paymentStatus} credit and balance labels in ${lang}`,async()=>{
    const pdf=await createInvoice({...sample,source:'counter',items:[{name:'Groundnut seed',nameGu:'મગફળીનું બિયારણ',qty:2,price:1250,unit:'kg'}],itemsTotal:2500,shippingFee:0,totalAmount:2500,paymentMethod:'later',paymentStatus,paidCents},{lang});
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pages(pdf)>=1&&pages(pdf)<=2);assert.match(pdf.toString('latin1'),/FontFile2/);
  });
}
