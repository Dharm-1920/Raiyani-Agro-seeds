const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
const { Order, User, InvoiceDelivery } = require('../models');
const service = require('../services/invoice-delivery');
const mail = require('../services/mail');
const invoice = require('../services/invoice');
const oid = '000000000000000000000001', uid = '000000000000000000000002';
let order, user, jobs, sent, transport, server, base;
const realFetch = global.fetch;
function matches(document, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(document, part));
    if (value instanceof Date) return document[key]?.getTime() === value.getTime();
    if (value && typeof value === 'object') {
      if ('$in' in value) return value.$in.includes(document[key]);
      if ('$lt' in value) return document[key] < value.$lt;
      if ('$gte' in value) return document[key] >= value.$gte;
      if ('$lte' in value) return document[key] <= value.$lte;
    }
    return String(document[key]) === String(value);
  });
}
function update(document, changes) {
  Object.assign(document, changes.$set || {});
  for (const key of Object.keys(changes.$unset || {})) delete document[key];
  for (const [key, value] of Object.entries(changes.$inc || {})) document[key] = (document[key] || 0) + value;
}
InvoiceDelivery.updateOne = async (q, changes, options) => {
  let job = jobs.find(job => matches(job, q));
  if (!job && options?.upsert) { job = { _id: String(jobs.length + 10).padStart(24, '0'), ...changes.$setOnInsert }; jobs.push(job); }
  if (job) update(job, changes);
};
InvoiceDelivery.updateMany = async (q, changes) => { jobs.filter(job => matches(job, q)).forEach(job => update(job, changes)); };
InvoiceDelivery.findOneAndUpdate = async (q, changes) => { const job = jobs.find(job => matches(job, q)); if (!job) return null; update(job, changes); return { ...job }; };
InvoiceDelivery.findOne = async q => jobs.find(job => matches(job, q)) || null;
Order.updateOne = async (q, changes) => { if (matches(order, q)) update(order, changes); };
Order.find = q => ({ limit: async () => matches(order, q) ? [order] : [] });
Order.findById = id => ({ populate: async () => String(id) === oid ? { ...order, user: { ...user } } : null });
User.findById = async id => String(id) === uid ? user : null;
mail.send = async message => { sent.push(message); if (transport === 'fail') throw Error('provider outage'); return 'mail-provider-id'; };
before(async () => {
  process.env.JWT_SECRET = 'invoice-delivery-test-secret'; process.env.APP_URL = 'https://shop.example.com';
  const app = express(); app.use('/api/invoices', require('../routes/invoice-links'));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port;
});
after(() => { global.fetch = realFetch; server.close(); });
beforeEach(() => {
  jobs = []; sent = []; transport = 'success'; global.fetch = realFetch;
  user = { _id: uid, name: 'Farmer', email: 'farmer@example.com', emailVerified: true };
  order = { _id: oid, user: uid, createdAt: new Date(), invoiceNoticePending: true, invoiceEmail: user.email, invoicePhone: '+919876543210', invoiceWhatsApp: false, invoiceLanguage: 'en', items: [{ name: 'Seeds', price: 100, qty: 2 }], itemsTotal: 200, shippingFee: 40, totalAmount: 240, shipping: { name: 'Farmer', phone: '+919876543210', address: 'Gondal' }, paymentMethod: 'cod', paymentStatus: 'pending', orderStatus: 'confirmed' };
  process.env.BREVO_API_KEY = 'test-key'; process.env.MAIL_FROM = 'shop@example.com';
  delete process.env.SMTP_HOST; delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_WHATSAPP_FROM; delete process.env.TWILIO_WHATSAPP_CONTENT_SID;
});
test('one durable email job is queued per order; WhatsApp requires explicit consent', async () => {
  await Promise.all([service.queueOrder(order), service.queueOrder(order)]);
  assert.equal(jobs.length, 1); assert.equal(jobs[0].channel, 'email'); assert.equal(order.invoiceNoticePending, false);
  order.invoiceWhatsApp = true; await service.queueOrder(order); await service.queueOrder(order);
  assert.equal(jobs.length, 2); assert.equal(jobs[1].recipient, '+919876543210');
});
test('email sends an actual PDF only to its verified owner and does not claim pending payment was received', async () => {
  await service.retryPending();
  assert.equal(sent.length, 1); assert.equal(sent[0].to, user.email); assert.match(sent[0].text, /Payment status: pending/);
  assert.equal(sent[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.equal(jobs[0].status, 'accepted'); assert.equal(jobs[0].providerId, 'mail-provider-id');
  await service.retryPending(); assert.equal(sent.length, 1);
});
test('unverified and mismatched email recipients are held without sending private order details', async () => {
  user.emailVerified = false; await service.retryPending();
  assert.equal(sent.length, 0); assert.equal(jobs[0].lastError, 'VERIFY_EMAIL'); assert.equal(jobs[0].attempts, 0);
  user.emailVerified = true; user.email = 'different@example.com'; jobs[0].nextAttemptAt = new Date(0);
  await service.retryPending(); assert.equal(sent.length, 0);
});
test('missing email configuration retains the job and never reports successful sending', async () => {
  delete process.env.BREVO_API_KEY; await service.retryPending();
  assert.equal(sent.length, 0); assert.equal(jobs[0].status, 'pending'); assert.equal(jobs[0].attempts, 0);
});
test('delivery outages retry without changing the purchase or stock and eventually mark failed', async () => {
  transport = 'fail'; await service.retryPending();
  assert.equal(order.orderStatus, 'confirmed'); assert.equal(jobs[0].status, 'pending'); assert.equal(jobs[0].attempts, 1); assert.equal(jobs[0].lastError, 'DELIVERY_RETRY');
  jobs[0].attempts = 5; jobs[0].nextAttemptAt = new Date(0); await service.retryPending(); assert.equal(jobs[0].status, 'failed');
});
test('a crashed final attempt cannot remain stuck in sending forever', async () => {
  await service.queueOrder(order); Object.assign(jobs[0], { status: 'sending', attempts: 6, leaseUntil: new Date(0) });
  await service.retryPending(); assert.equal(jobs[0].status, 'failed'); assert.equal(sent.length, 0);
});
test('WhatsApp sends an approved document template with an expiring PDF path, after opt-in only', async () => {
  order.invoiceWhatsApp = true; await service.queueOrder(order);
  process.env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32); process.env.TWILIO_AUTH_TOKEN = 'private-token'; process.env.TWILIO_WHATSAPP_FROM = '+14155550123'; process.env.TWILIO_WHATSAPP_CONTENT_SID = 'HX' + 'b'.repeat(32);
  global.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/api.twilio.com\//); assert.equal(options.body.get('To'), 'whatsapp:+919876543210');
    const variables = JSON.parse(options.body.get('ContentVariables')); assert.equal(variables['2'], 'INR 240.00');
    assert.match(variables['3'], /\/purchase-invoice.pdf$/); assert.equal(options.body.get('MediaUrl'), null);
    const token = variables['3'].split('/')[3]; const data = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(data.purpose, 'invoice-delivery'); assert.equal(data.orderId, oid); assert.ok(data.exp > data.iat);
    return { ok: true, json: async () => ({ sid: 'SM-provider-id' }) };
  };
  const whatsapp = jobs.find(job => job.channel === 'whatsapp'); Object.assign(whatsapp, { status: 'sending', attempts: 1, leaseUntil: new Date(Date.now() + 60000) });
  await service.deliver({ ...whatsapp }); assert.equal(whatsapp.status, 'accepted');
});
test('shared PDF requires a valid, unexpired invoice token, matching owner and WhatsApp permission', async () => {
  order.invoiceWhatsApp = true; await service.queueOrder(order); const job = jobs.find(job => job.channel === 'whatsapp');
  const path = '/' + service.invoicePath(job);
  let response = await realFetch(base + path); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  for (const token of ['tampered', jwt.sign({ purpose: 'invoice-delivery', deliveryId: job._id, orderId: oid }, process.env.JWT_SECRET, { expiresIn: -1 }), jwt.sign({ purpose: 'google-state', deliveryId: job._id, orderId: oid }, process.env.JWT_SECRET)]) {
    assert.equal((await realFetch(base + `/api/invoices/shared/${token}/purchase-invoice.pdf`)).status, 404);
  }
  job.user = '000000000000000000000099'; assert.equal((await realFetch(base + path)).status, 404);
  job.user = uid; order.invoiceWhatsApp = false; assert.equal((await realFetch(base + path)).status, 404);
});
test('invoice generator failures stay out of the sender and are retryable', async () => {
  const createInvoice = invoice.createInvoice; invoice.createInvoice = async () => { throw Error('PDF unavailable'); };
  try { await service.retryPending(); assert.equal(sent.length, 0); assert.equal(jobs[0].status, 'pending'); }
  finally { invoice.createInvoice = createInvoice; }
});
