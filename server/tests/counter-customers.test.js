const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
const { CounterCustomer, CounterBill, User } = require('../models');
const admin = '000000000000000000000001', shopper = '000000000000000000000002';
let customers, bills, server, base;
function matches(document, query) {
  return Object.entries(query).every(([key, value]) => key === '$or' ? value.some(part => matches(document, part)) : value instanceof RegExp ? value.test(document[key] || '') : String(document[key]) === String(value));
}
CounterCustomer.findOne = async query => customers.find(customer => matches(customer, query)) || null;
CounterCustomer.findById = async id => customers.find(customer => String(customer._id) === String(id)) || null;
CounterCustomer.create = async data => {
  if (customers.some(customer => customer.requestKey === data.requestKey || data.phone && customer.phone === data.phone)) throw Object.assign(Error('Duplicate'), { code: 11000 });
  const customer = { ...data, _id: String(customers.length + 10).padStart(24, '0'), __v: 0, createdAt: new Date(), updatedAt: new Date() }; customers.push(customer); return customer;
};
CounterCustomer.find = query => ({ sort: () => ({ skip: offset => ({ limit: async limit => customers.filter(customer => matches(customer, query)).slice(offset, offset + limit) }) }) });
CounterCustomer.countDocuments = async query => customers.filter(customer => matches(customer, query)).length;
CounterCustomer.findOneAndUpdate = async (query, changes) => {
  const customer = customers.find(customer => matches(customer, query)); if (!customer) return null;
  if (changes.$set.phone && customers.some(row => row !== customer && row.phone === changes.$set.phone)) throw Object.assign(Error('Duplicate phone'), { code: 11000 });
  Object.assign(customer, changes.$set); for (const field of Object.keys(changes.$unset || {})) delete customer[field]; customer.__v++; customer.updatedAt = new Date(); return customer;
};
CounterBill.findOne = async query => bills.find(bill => matches(bill, query)) || null;
CounterBill.create = async data => { const bill = { ...data, _id: String(bills.length + 100).padStart(24, '0'), __v: 0 }; bills.push(bill); return bill; };
CounterBill.find = query => ({ lean: async () => bills.filter(bill => matches(bill, query)) });
User.findById = id => ({ select: async () => [admin, shopper].includes(String(id)) ? { _id: id, role: String(id) === admin ? 'admin' : 'user' } : null });
before(async () => {
  process.env.JWT_SECRET = 'saved-customer-tests';
  const app = express(); app.use(express.json()); app.use(require('cookie-parser')()); app.use('/customers', require('../routes/counter-customers')); app.use('/bills', require('../routes/counter-bills'));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close()); beforeEach(() => { customers = []; bills = []; });
const request = (path, user = admin, method = 'GET', body) => fetch(base + path, { method, headers: { ...(user ? { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET) } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const profile = () => ({ requestKey: 'save-customer-test-123', name: 'Repeat Farmer', phone: '9876543210', address: 'Old Gondal address', preferredLanguage: 'gu' });
const invoice = customer => ({ requestKey: 'linked-counter-bill-123', customerId: customer._id, customer: { name: customer.name, phone: customer.phone, address: customer.address }, items: [{ name: 'Seeds', qty: 1, price: 1000 }], discount: 0, paymentMethod: 'later', paymentStatus: 'pending', invoiceWhatsApp: false });
test('saved customer directory, statements, creation and edits reject guests and customer logins', async () => {
  for (const user of [null, shopper]) for (const [path, method] of [['/customers', 'GET'], ['/customers', 'POST'], ['/customers/000000000000000000000010', 'PUT'], ['/customers/000000000000000000000010/statement', 'GET']]) assert.equal((await request(path, user, method, method === 'GET' ? undefined : profile())).status, user ? 403 : 401);
});
test('a customer is saved once across simultaneous retries and can be found by name or normalized phone', async () => {
  const responses = await Promise.all([request('/customers', admin, 'POST', profile()), request('/customers', admin, 'POST', profile())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]); assert.equal(customers.length, 1); assert.equal(customers[0].phone, '+919876543210');
  const byName = await (await request('/customers?search=repeat')).json(); const byPhone = await (await request('/customers?search=98765')).json();
  assert.equal(byName.items[0]._id, byPhone.items[0]._id); assert.equal(byName.items[0].requestHash, undefined);
  assert.equal((await request('/customers', admin, 'POST', { ...profile(), name: 'Different name' })).status, 409);
  assert.equal((await request('/customers', admin, 'POST', { ...profile(), requestKey: 'duplicate-phone-key-123' })).status, 409);
});
test('selecting a saved customer links repeat bills and profile edits preserve earlier bill details', async () => {
  const customer = await (await request('/customers', admin, 'POST', profile())).json();
  assert.equal((await request('/bills', admin, 'POST', invoice(customer))).status, 201);
  const original = structuredClone(bills[0]);
  const updated = await (await request('/customers/' + customer._id, admin, 'PUT', { ...customer, address: 'New Gondal address', version: customer.__v })).json();
  assert.equal(updated.__v, 1); assert.equal(bills[0].shipping.address, 'Old Gondal address');
  // An exact bill retry remains safe even after its saved customer was edited.
  assert.equal((await request('/bills', admin, 'POST', invoice(customer))).status, 200);
  assert.equal((await request('/bills', admin, 'POST', { ...invoice(customer), requestKey: 'stale-snapshot-bill-123' })).status, 409);
  assert.equal((await request('/bills', admin, 'POST', { ...invoice(updated), requestKey: 'second-visit-bill-123' })).status, 201);
  assert.equal(bills.length, 2); assert.equal(bills[1].shipping.address, 'New Gondal address'); assert.equal(original.counterCustomer, updated._id);
  const statement = await (await request('/customers/' + customer._id + '/statement')).json();
  assert.equal(statement.debitCents, 200000); assert.equal(statement.currentDueCents, 200000); assert.equal(statement.totalRows, 2);
});
test('customers with the same name remain separate and phone-less profiles use stable IDs', async () => {
  const first = await (await request('/customers', admin, 'POST', { ...profile(), phone: '' })).json();
  const second = await (await request('/customers', admin, 'POST', { ...profile(), requestKey: 'second-customer-key-123', phone: '' })).json();
  assert.notEqual(first._id, second._id); assert.equal(customers.length, 2);
  await request('/bills', admin, 'POST', invoice(first));
  assert.equal((await (await request('/customers/' + second._id + '/statement')).json()).currentDueCents, 0);
});
test('customer edits enforce versions, statement exports are private, and invalid IDs are rejected', async () => {
  const customer = await (await request('/customers', admin, 'POST', profile())).json();
  assert.equal((await request('/customers/' + customer._id, admin, 'PUT', { ...customer, version: 99 })).status, 409);
  assert.equal((await request('/customers/' + customer._id, admin, 'PUT', { ...customer, phone: 'not-a-phone', version: 0 })).status, 400);
  const csv = await request('/customers/' + customer._id + '/statement?format=csv'); assert.equal(csv.status, 200); assert.equal(csv.headers.get('cache-control'), 'private, no-store'); assert.match(await csv.text(), /Opening balance/);
  assert.equal((await request('/customers/not-an-id/statement')).status, 404);
});
