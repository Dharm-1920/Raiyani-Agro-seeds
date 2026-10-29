const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
const { User, Product, Order } = require('../models');
const { bookFor } = require('../services/address-book');
require('../services/notifications').processOrderNotifications = async () => {};
let users, server, base, order, deductions;
const a = '000000000000000000000001', b = '000000000000000000000002', pid = '000000000000000000000020';
const clone = value => structuredClone(value);
const matches = (doc, query) => Object.entries(query).every(([key, value]) => key === '$or' ? value.some(q => matches(doc, q)) : value && typeof value === 'object' && '$exists' in value ? (doc[key] !== undefined) === value.$exists : String(doc[key]) === String(value));
User.findById = id => ({ select: async () => users[id] ? clone(users[id]) : null });
User.updateOne = async (query, update) => { const user = Object.values(users).find(row => matches(row, query)); if (!user) return { matchedCount: 0 }; Object.assign(user, clone(update.$set)); return { matchedCount: 1 }; };
Product.findOneAndUpdate = async () => { deductions++; return { _id: pid, name: 'Seed', price: 100 }; };
Order.create = async data => { order = clone(data); return { ...order, _id: '000000000000000000000030' }; };
before(async () => {
  process.env.JWT_SECRET = 'address-test-secret';
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.cookies = {}; next(); });
  app.use('/account', require('../routes/account')); app.use('/orders', require('../routes/orders'));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  users = Object.fromEntries([a,b].map(id => [id,{ _id: id, name: id === a ? 'Alice' : 'Bob', email: id+'@example.com', phone:'+919876543210', address: id === a ? 'Original address, Gondal' : '', role:'user' }])); order = null; deductions = 0;
});
const address = (label = 'Work') => ({ label, name:'Delivery recipient', phone:'9876543210', line1:'12 Market Road', line2:'Near shop', landmark:'Temple', city:'Gondal', state:'Gujarat', postalCode:'360311' });
const req = (path, user = a, method = 'GET', body) => fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+jwt.sign({id:user},process.env.JWT_SECRET)}:{})},...(body?{body:JSON.stringify(body)}:{})});
const get = async (user = a) => (await req('/account/addresses',user)).json();
const create = async (data = address(), makeDefault = false) => req('/account/addresses',a,'POST',{accountId:a,version:bookFor(users[a]).version,address:data,makeDefault});
test('address book is private, supports legacy delivery details and rejects stale-account writes',async()=>{
  assert.equal((await req('/account/addresses',null)).status,401);
  const book=await get();assert.equal(book.addresses.length,1);assert.equal(book.addresses[0].line1,'Original address, Gondal');assert.equal(book.defaultId,a);
  assert.equal((await get(b)).addresses.length,0);
  assert.equal((await req('/account/addresses',b,'POST',{accountId:a,version:0,address:address()})).status,403);
  assert.equal(users[b].deliveryAddresses,undefined);
});
test('create, edit, select default and remove preserve multiple addresses and do not replace account identity',async()=>{
  let response=await create();assert.equal(response.status,201);let book=await response.json();const id=book.addresses[1]._id;
  assert.equal(book.addresses.length,2);assert.equal(book.defaultId,a);assert.equal(book.addresses[1].phone,'+919876543210');
  response=await req('/account/addresses/'+id,a,'PUT',{accountId:a,version:book.version,address:address('Other'),makeDefault:true});book=await response.json();assert.equal(book.defaultId,id);assert.equal(book.addresses[1].label,'Other');
  assert.equal(users[a].name,'Alice');assert.match(users[a].address,/12 Market Road/);
  response=await req('/account/addresses/'+a+'/default',a,'PUT',{accountId:a,version:book.version});book=await response.json();assert.equal(book.defaultId,a);
  response=await req('/account/addresses/'+a,a,'DELETE',{accountId:a,version:book.version});book=await response.json();assert.equal(book.defaultId,id);assert.equal(book.addresses.length,1);
  response=await req('/account/addresses/'+id,a,'DELETE',{accountId:a,version:book.version});book=await response.json();assert.equal(book.defaultId,null);assert.equal((await get()).addresses.length,0);assert.equal(users[a].address,'');
});
test('another customer cannot edit, delete or make an address default even with its ID',async()=>{
  const book=await(await create()).json(),id=book.addresses[1]._id;
  for(const [path,method] of [[id,'PUT'],[id,'DELETE'],[id+'/default','PUT']])assert.equal((await req('/account/addresses/'+path,b,method,{accountId:b,version:0,address:address()})).status,404);
  assert.equal((await get()).addresses.length,2);
});
test('address validation rejects invalid or injected fields, missing PIN and excess addresses',async()=>{
  for(const value of [{...address(),postalCode:'123'},{...address(),phone:'invalid'},{...address(),city:''},{...address(),name:{$ne:null}},{...address(),line1:'x'.repeat(1001)}])assert.equal((await create(value)).status,400);
  assert.equal(users[a].deliveryAddresses,undefined);
  users[a].deliveryAddresses=Array.from({length:20},(_,i)=>({_id:String(i),...address()}));assert.equal((await create()).status,400);
});
test('simultaneous writes using the same version cannot overwrite each other',async()=>{
  const body={accountId:a,version:0,address:address()};
  const results=await Promise.all([req('/account/addresses',a,'POST',body),req('/account/addresses',a,'POST',body)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal((await get()).addresses.length,2);
});
test('checkout snapshots the selected owned address; later edits do not change historical shipping',async()=>{
  const book=await(await create()).json(),id=book.addresses[1]._id;
  const response=await req('/orders',a,'POST',{accountId:a,items:[{productId:pid,qty:1}],addressId:id,addressBookVersion:book.version,shipping:{name:'forged',phone:'wrong',address:'ignored'},paymentMethod:'cod'});
  assert.equal(response.status,201);assert.equal(order.shipping.name,'Delivery recipient');assert.match(order.shipping.address,/Gondal/);
  const snapshot=clone(order.shipping);
  await req('/account/addresses/'+id,a,'PUT',{accountId:a,version:book.version,address:{...address(),line1:'Changed road'}});
  assert.deepEqual(order.shipping,snapshot);
});
test('checkout refuses foreign or stale saved addresses before deducting inventory',async()=>{
  const book=await(await create()).json(),id=book.addresses[1]._id;
  const draft={items:[{productId:pid,qty:1}],addressId:id,addressBookVersion:book.version,paymentMethod:'cod'};
  assert.equal((await req('/orders',b,'POST',{...draft,addressBookVersion:0,accountId:b})).status,404);
  assert.equal((await req('/orders',a,'POST',{...draft,addressBookVersion:0,accountId:a})).status,409);
  assert.equal(deductions,0);
});
