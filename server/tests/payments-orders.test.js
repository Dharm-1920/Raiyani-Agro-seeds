// In-memory model doubles: no MongoDB or real bank transfers.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Order, Product, User } = require('../models');
require('../services/notifications').processOrderNotifications = async () => {};
const customer = { _id: '000000000000000000000001', role: 'user' };
const other = { _id: '000000000000000000000002', role: 'user' };
const admin = { _id: '000000000000000000000003', role: 'admin' };
const orderId = '000000000000000000000010', productId = '000000000000000000000020';
let order, product, failRestock, server, base;
const copy = o => o == null ? o : structuredClone(o);
function matches(doc, q) {
  return Boolean(doc) && Object.entries(q).every(([k,v]) => {
    if (k === '$or') return v.some(x => matches(doc,x));
    if (v && typeof v === 'object') {
      if ('$in' in v) return v.$in.includes(doc[k]);
      if ('$exists' in v) return (doc[k] !== undefined) === v.$exists;
      if ('$ne' in v) return Array.isArray(doc[k]) ? !doc[k].includes(String(v.$ne)) : doc[k] !== v.$ne;
      if ('$gte' in v) return doc[k] >= v.$gte;
    }
    return v === null ? doc[k] == null : String(doc[k]) === String(v);
  });
}
function update(doc, changes) { Object.assign(doc, changes.$set || {});for(const [k,v] of Object.entries(changes.$inc || {}))doc[k]=(doc[k]||0)+v;for(const [k,v]of Object.entries(changes.$addToSet||{})){doc[k]||=[];if(!doc[k].includes(String(v)))doc[k].push(String(v));} }
Order.findOne = async q => matches(order,q) ? copy(order) : null;
Order.findById = async id => String(id)===order._id ? copy(order) : null;
Order.findOneAndUpdate = async(q,u) => {if(!matches(order,q))return null;update(order,u);return copy(order)};
Order.updateOne = async(q,u) => {if(matches(order,q))update(order,u);return {acknowledged:true}};
Product.updateOne = async(q,u) => {if(failRestock){failRestock=false;throw Error('simulated temporary database outage')}if(matches(product,q))update(product,u);return {acknowledged:true}};
Product.findOneAndUpdate = async(q,u)=>{if(!matches(product,q))return null;update(product,u);return copy(product)};
Order.create=async data=>{order={...copy(data),_id:orderId};return copy(order)};
User.findById=id=>({select:async()=>[customer,other,admin].find(u=>u._id===id)});
const { cancelOrder } = require('../services/cancellation');
const { checkoutData } = require('../services/payments');
before(async()=>{
  Object.assign(process.env,{JWT_SECRET:'test-session-secret',SHOP_UPI_ID:'shop@bank',SHOP_UPI_NAME:'Raiyani Agro Seeds'});
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.cookies={};next()});app.use('/api/orders',require('../routes/orders'));app.use('/api/admin',require('../routes/admin'));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
});
after(()=>server.close());
beforeEach(()=>{
  failRestock=false;
  product={_id:productId,name:'Groundnut',price:200,stock:8,isActive:true,isDeleted:false,cancellationRestocks:[]};
  order={_id:orderId,user:customer._id,items:[{product:productId,qty:2}],orderStatus:'confirmed',paymentMethod:'cod',paymentStatus:'pending',totalAmount:400,stockRestored:false};
});
function req(path,actor=customer,body={},method='PUT') {return fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt.sign({id:actor._id},process.env.JWT_SECRET)},...(method==='GET'?{}:{body:JSON.stringify(body)})});}
test('customer cancellation restores stock once across repeated/concurrent requests',async()=>{
  await Promise.all(Array.from({length:5},()=>cancelOrder(orderId,customer)));assert.equal(order.orderStatus,'cancelled');assert.equal(order.cancelledBy,'customer');assert.equal(product.stock,10);assert.equal(order.stockRestored,true);
});
test('duplicate product lines are restored together once',async()=>{order.items.push({product:productId,qty:3});await cancelOrder(orderId,admin);assert.equal(product.stock,13);assert.equal(product.cancellationRestocks.length,1)});
test('temporary restock failure is recoverable by retry',async()=>{failRestock=true;await assert.rejects(cancelOrder(orderId,customer));assert.equal(order.orderStatus,'cancelled');await cancelOrder(orderId,customer);assert.equal(product.stock,10)});
test('legacy cancelled orders are not restocked again',async()=>{order.orderStatus='cancelled';product.stock=10;await cancelOrder(orderId,customer);assert.equal(product.stock,10)});
test('ownership and shipment rules apply to customer and admin cancellation',async()=>{
  let r=await req('/api/orders/'+orderId+'/cancel',other);assert.equal(r.status,404);assert.equal(product.stock,8);
  r=await req('/api/admin/orders/'+orderId+'/cancel',customer);assert.equal(r.status,403);
  for(const state of ['shipped','delivered']){order.orderStatus=state;r=await req('/api/admin/orders/'+orderId+'/cancel',admin);assert.equal(r.status,409);assert.equal(product.stock,8)}
  order.orderStatus='confirmed';r=await req('/api/admin/orders/'+orderId+'/cancel',admin);assert.equal(r.status,200);assert.equal(order.cancelledBy,'admin');assert.equal(product.stock,10);
});
test('paid cancellation is flagged for review, not falsely refunded',async()=>{order.paymentMethod='upi';order.paymentStatus='paid';await cancelOrder(orderId,customer);assert.equal(order.refundStatus,'pending_review');assert.equal(order.paymentStatus,'paid')});
test('QR uses shop payee, stored order total and order reference',async()=>{order.paymentMethod='upi';const data=await checkoutData(order);const url=new URL(data.upi.uri);assert.equal(url.searchParams.get('pa'),'shop@bank');assert.equal(url.searchParams.get('pn'),'Raiyani Agro Seeds');assert.equal(url.searchParams.get('am'),'400.00');assert.equal(url.searchParams.get('tr'),orderId);assert.ok(data.upi.qr.startsWith('data:image/png;base64,'));assert.equal(order.paymentStatus,'pending');});
test('QR retrieval is owned, rejects paid/cancelled orders and never decrements stock again',async()=>{order.paymentMethod='upi';let r=await req('/api/orders/'+orderId+'/qr',other,{},'GET');assert.equal(r.status,404);for(let n=0;n<2;n++){r=await req('/api/orders/'+orderId+'/qr',customer,{},'GET');assert.equal(r.status,200);}assert.equal(product.stock,8);order.paymentStatus='paid';assert.equal((await req('/api/orders/'+orderId+'/qr',customer,{},'GET')).status,409);order.paymentStatus='pending';order.orderStatus='cancelled';assert.equal((await req('/api/orders/'+orderId+'/qr',customer,{},'GET')).status,409);});
test('UPI order calculates prices on server and starts pending',async()=>{const r=await req('/api/orders',customer,{items:[{productId,qty:2,price:1}],shipping:{name:'Customer',phone:'9876543210',address:'Gondal'},paymentMethod:'upi'},'POST');assert.equal(r.status,201);const data=await r.json();assert.equal(data.upi.amount,440);assert.equal(new URL(data.upi.uri).searchParams.get('am'),'440.00');assert.equal(product.stock,6);assert.equal(order.orderStatus,'placed');});
test('payment reference is a claim and never marks the order paid',async()=>{order.paymentMethod='upi';assert.equal((await req('/api/orders/'+orderId+'/payment-reference',customer,{reference:'bad'},'POST')).status,400);assert.equal((await req('/api/orders/'+orderId+'/payment-reference',other,{reference:'123456789012'},'POST')).status,409);assert.equal((await req('/api/orders/'+orderId+'/payment-reference',customer,{reference:'123456789012'},'POST')).status,200);assert.equal(order.paymentReference,'123456789012');assert.equal(order.paymentStatus,'pending');});
test('only admin confirms receipt and unpaid UPI cannot ship',async()=>{order.paymentMethod='upi';assert.equal((await req('/api/admin/orders/'+orderId+'/payment-confirm',customer,{reference:'123456789012'},'POST')).status,403);assert.equal((await req('/api/admin/orders/'+orderId+'/status',admin,{orderStatus:'shipped'})).status,409);assert.equal((await req('/api/admin/orders/'+orderId+'/payment-confirm',admin,{reference:'123456789012'},'POST')).status,200);assert.equal(order.paymentStatus,'paid');assert.equal(order.paymentVerifiedBy,admin._id);assert.equal(order.orderStatus,'confirmed');assert.equal((await req('/api/admin/orders/'+orderId+'/payment-confirm',admin,{reference:'123456789012'},'POST')).status,409);});
test('late manually confirmed payment stays cancelled and requires refund review',async()=>{order.paymentMethod='upi';await cancelOrder(orderId,customer);assert.equal((await req('/api/admin/orders/'+orderId+'/payment-confirm',admin,{reference:'123456789012'},'POST')).status,200);assert.equal(order.orderStatus,'cancelled');assert.equal(order.refundStatus,'pending_review');assert.equal(product.stock,10);});
test('admin records completed manual refund only on paid cancelled order',async()=>{order.paymentMethod='upi';order.paymentStatus='paid';assert.equal((await req('/api/admin/orders/'+orderId+'/refund-confirm',admin,{reference:'987654321012'},'POST')).status,409);await cancelOrder(orderId,customer);assert.equal((await req('/api/admin/orders/'+orderId+'/refund-confirm',customer,{reference:'987654321012'},'POST')).status,403);assert.equal((await req('/api/admin/orders/'+orderId+'/refund-confirm',admin,{reference:'987654321012'},'POST')).status,200);assert.equal(order.paymentStatus,'refunded');assert.equal(order.refundStatus,'completed');assert.equal(order.refundReference,'987654321012');});
test('missing UPI payee blocks QR ordering before reserving stock',async()=>{const saved=process.env.SHOP_UPI_ID;delete process.env.SHOP_UPI_ID;try{const r=await req('/api/orders',customer,{items:[{productId,qty:2}],shipping:{name:'Customer',phone:'9876543210',address:'Gondal'},paymentMethod:'upi'},'POST');assert.equal(r.status,400);assert.equal(product.stock,8);}finally{process.env.SHOP_UPI_ID=saved;}});
test('invalid fractional quantities do not reserve stock',async()=>{const r=await req('/api/orders',customer,{items:[{productId,qty:1.5}],shipping:{name:'Customer',phone:'9876543210',address:'Gondal'},paymentMethod:'cod'},'POST');assert.equal(r.status,400);assert.equal(product.stock,8)});
test('payment configuration distinguishes missing/invalid UPI IDs and uses a default receiver name',()=>{
 const {paymentConfig}=require('../services/payments');const id=process.env.SHOP_UPI_ID,name=process.env.SHOP_UPI_NAME;
 try {delete process.env.SHOP_UPI_ID;assert.equal(paymentConfig().reason,'missing_id');process.env.SHOP_UPI_ID='YOUR_REAL_UPI_ID';assert.equal(paymentConfig().reason,'invalid_id');process.env.SHOP_UPI_ID=' shop@bank ';delete process.env.SHOP_UPI_NAME;assert.equal(paymentConfig().enabled,true);assert.equal(paymentConfig().upiId,'shop@bank');assert.equal(paymentConfig().name,'Raiyani Agro Seeds');}finally{process.env.SHOP_UPI_ID=id;process.env.SHOP_UPI_NAME=name;}
});
test('only admins can view payment setup diagnostics',async()=>{
 assert.equal((await req('/api/admin/payment-config',customer,{},'GET')).status,403);
 const r=await req('/api/admin/payment-config',admin,{},'GET');assert.equal(r.status,200);assert.equal((await r.json()).enabled,true);
});
