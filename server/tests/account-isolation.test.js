// Exercise authenticated HTTP routes with isolated model doubles, without MongoDB.
const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express'),jwt=require('jsonwebtoken');
const {User,Product,Order}=require('../models');
require('../services/notifications').processOrderNotifications = async () => {};
const a='000000000000000000000001',b='000000000000000000000002',pid='000000000000000000000020',oid='000000000000000000000030';
let users,server,base,order,stock;
User.findById=id=>({select:async()=>users[id]});
User.updateOne=async(q,u)=>{users[q._id].cart=u.$set.cart;};
Product.find=async()=>[{_id:pid,name:'Seeds',stock:3,price:200,images:[]}];
Product.findOneAndUpdate=async(q,u)=>{stock+=u.$inc.stock;return {_id:pid,name:'Seeds',price:200};};
Order.create=async data=>(order={...data,_id:oid});
Order.find=q=>({sort:async()=>order && String(order.user)===String(q.user)?[order]:[]});
Order.findById=id=>({populate:async()=>order && id===order._id?{...order,user:{_id:order.user}}:null});
before(async()=>{process.env.JWT_SECRET='isolation-test-secret';const app=express();app.use(express.json());app.use((req,res,next)=>{req.cookies={};next();});app.use('/account',require('../routes/account'));app.use('/auth',require('../routes/auth'));app.use('/orders',require('../routes/orders'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;});
after(()=>server.close());
beforeEach(()=>{users={};for(const id of [a,b])users[id]={_id:id,name:id===a?'Alice':'Bob',email:id+'@example.com',phone:'',address:'',role:'user',cart:[],save:async()=>{}};order=null;stock=10;});
function req(path,id,method='GET',body){return fetch(base+path,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:'Bearer '+jwt.sign({id},process.env.JWT_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});}
test('guest cannot load a cart, update profile, read orders or place an order',async()=>{for(const [path,method]of [['/account/cart','GET'],['/auth/me','PUT'],['/orders/my','GET'],['/orders','POST']])assert.equal((await req(path,null,method,method==='GET'?undefined:{})).status,401);});
test('saved carts are private and survive repeat authenticated reads',async()=>{assert.equal((await req('/account/cart',a,'PUT',{accountId:a,items:[{productId:pid,qty:5}]})).status,200);let data=await(await req('/account/cart',a)).json();assert.equal(data.accountId,a);assert.equal(data.items[0].qty,3);assert.equal((await(await req('/account/cart',b)).json()).items.length,0);assert.equal((await(await req('/account/cart',a)).json()).items[0].name,'Seeds');});
test('stale account cart saves are rejected instead of writing to the new account',async()=>{assert.equal((await req('/account/cart',b,'PUT',{accountId:a,items:[{productId:pid,qty:2}]})).status,403);assert.deepEqual(users[b].cart,[]);assert.equal((await req('/account/cart',a,'PUT',{accountId:a,items:[null]})).status,400);});
test('profile saves affect only the authenticated account and cannot change privileges',async()=>{const payload={accountId:a,name:'Alice Updated',phone:'9876543210',address:'Gondal',role:'admin',email:'changed@example.com',user:b};assert.equal((await req('/auth/me',a,'PUT',payload)).status,200);assert.equal(users[a].name,'Alice Updated');assert.equal(users[a].role,'user');assert.equal(users[a].email,a+'@example.com');assert.equal(users[b].address,'');assert.equal((await req('/auth/me',b,'PUT',payload)).status,403);});
test('orders use the authenticated owner and another customer cannot read them or their invoices',async()=>{const payload={accountId:a,user:b,items:[{productId:pid,qty:2}],shipping:{name:'Alice',phone:'9876543210',address:'Gondal'},paymentMethod:'cod'};assert.equal((await req('/orders',a,'POST',payload)).status,201);assert.equal(order.user,a);assert.equal((await(await req('/orders/my',a)).json()).length,1);assert.equal((await(await req('/orders/my',b)).json()).length,0);assert.equal((await req('/orders/'+oid,b)).status,404);assert.equal((await req('/orders/'+oid+'/invoice',b)).status,404);assert.equal((await req('/orders',b,'POST',payload)).status,403);assert.equal(stock,8);});
test('owner downloads a real PDF invoice without the Python service; other customer and guest cannot',async()=>{
  order={_id:oid,user:a,createdAt:'2026-10-01T03:00:00Z',items:[{name:'Seeds',price:200,qty:2}],shipping:{name:'Alice',phone:'9876543210',address:'Gondal'},itemsTotal:400,shippingFee:40,totalAmount:440,paymentMethod:'cod',paymentStatus:'pending',orderStatus:'confirmed'};
  const response=await req('/orders/'+oid+'/invoice',a);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes('application/pdf'));assert.match(response.headers.get('content-disposition'),/attachment; filename="purchase-invoice/);assert.equal(response.headers.get('cache-control'),'private, no-store');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>1000);
  assert.equal((await req('/orders/'+oid+'/invoice',b)).status,404);assert.equal((await req('/orders/'+oid+'/invoice',null)).status,401);
  users[b].role='admin';assert.equal((await req('/orders/'+oid+'/invoice?lang=gu',b)).status,200);
});
