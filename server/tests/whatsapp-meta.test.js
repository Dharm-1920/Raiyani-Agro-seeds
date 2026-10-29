const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { WhatsAppPreference, InvoiceDelivery, PaymentReminder, RestockDelivery, StockSubscription, CounterBill } = require('../models');
const meta = require('../services/whatsapp-meta');
const invoice = require('../services/invoice-delivery');
const reminder = require('../services/payment-reminders');
let blocked, requests, changes, server, base;
const realFetch = global.fetch;
WhatsAppPreference.exists = async () => blocked;
WhatsAppPreference.updateOne = async (filter, update) => { changes.push({ model: 'preference', filter, update }); };
for (const [name, model] of Object.entries({ invoice: InvoiceDelivery, reminder: PaymentReminder, restock: RestockDelivery, subscription: StockSubscription, bill: CounterBill })) {
  model.updateMany = async (filter, update) => { changes.push({ model: name, filter, update }); };
}
before(async () => {
  const app = express(); app.use('/webhook', require('../routes/whatsapp-meta'));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { global.fetch = realFetch; server.close(); });
beforeEach(() => {
  Object.assign(process.env, { WHATSAPP_PROVIDER: 'meta', META_WHATSAPP_SEND_ENABLED: 'true', META_WHATSAPP_PHONE_NUMBER_ID: '123456789',
    META_WHATSAPP_ACCESS_TOKEN: 'private-test-token', META_WHATSAPP_API_VERSION: 'v23.0', META_WHATSAPP_APP_SECRET: 'private-app-secret',
    META_WHATSAPP_VERIFY_TOKEN: 'private-verify-token', META_WHATSAPP_INVOICE_TEMPLATE: 'raiyani_invoice',
    META_WHATSAPP_REMINDER_TEMPLATE: 'raiyani_reminder', META_WHATSAPP_RESTOCK_TEMPLATE: 'raiyani_restock', META_WHATSAPP_TEMPLATE_LANGUAGE: 'en_US',
    APP_URL: 'https://shop.example.com', JWT_SECRET: 'private-test-jwt' });
  delete process.env.META_WHATSAPP_INVOICE_TEMPLATE_GU;
  blocked = false; requests = []; changes = [];
  global.fetch = async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.test' }] }) }; };
});
const job = { _id: '000000000000000000000001', order: '000000000000000000000002', recipient: '+919876543210', language: 'gu' };
test('Meta invoice sends a template with secure expiring PDF header and positional body values', async () => {
  assert.equal(await invoice.sendWhatsApp(job, { _id: job.order, totalAmount: 2500 }), 'wamid.test');
  const request = requests[0];
  assert.equal(request.url, 'https://graph.facebook.com/v23.0/123456789/messages');
  assert.equal(request.options.headers.Authorization, 'Bearer private-test-token');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.body.to, '919876543210');
  assert.equal(request.body.template.language.code, 'en_US');
  const [header, body] = request.body.template.components;
  assert.equal(header.parameters[0].type, 'document');
  assert.match(header.parameters[0].document.link, /^https:\/\/shop.example.com\/api\/invoices\/shared\/.+\/purchase-invoice.pdf$/);
  assert.deepEqual(body.parameters.map(p => p.text), ['00000002', 'INR 2500.00']);
  assert.ok(!JSON.stringify(request.body).includes('private-test-token'));
});
test('approved Gujarati variants are selected, otherwise the English envelope is used', async () => {
  process.env.META_WHATSAPP_INVOICE_TEMPLATE_GU = 'raiyani_invoice_gu';
  await invoice.sendWhatsApp(job, { _id: job.order, totalAmount: 50 });
  assert.equal(requests[0].body.template.language.code, 'gu');
  assert.equal(requests[0].body.template.name, 'raiyani_invoice_gu');
});
test('missing settings, send-disabled state, bad recipient and opt-outs never send', async () => {
  const args = { kind: 'restock', recipient: job.recipient, values: ['Seeds', 'https://shop.example.com/product/1'] };
  process.env.META_WHATSAPP_SEND_ENABLED = 'false';
  assert.equal(meta.configured('restock'), false); await assert.rejects(meta.sendTemplate(args), e => e.code === 'WHATSAPP_CONFIG');
  process.env.META_WHATSAPP_SEND_ENABLED = 'true'; delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  await assert.rejects(meta.sendTemplate(args), e => e.code === 'WHATSAPP_CONFIG');
  process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';
  await assert.rejects(meta.sendTemplate({ ...args, recipient: 'invalid' }), e => e.code === 'WHATSAPP_CONFIG');
  blocked = true; await assert.rejects(meta.sendTemplate(args), e => e.code === 'WHATSAPP_OPT_OUT');
  assert.equal(requests.length, 0);
});
test('foreign document links and provider errors are rejected without exposing provider data', async () => {
  await assert.rejects(meta.sendTemplate({ kind: 'invoice', recipient: job.recipient, values: [], document: { link: 'https://evil.example/file.pdf' } }), e => e.code === 'WHATSAPP_CONFIG');
  await assert.rejects(meta.sendTemplate({ kind: 'restock', recipient: job.recipient, values: ['Seeds', 'url'] }, { fetcher: async () => ({ ok: false, json: async () => ({ error: { message: 'private provider details' } }) }) }), e => e.code === 'WHATSAPP_REJECTED' && !e.message.includes('private'));
});
test('Meta reminder uses the current outstanding balance and never sends a paid bill', async () => {
  const bill = { _id: job.order, totalAmount: 1000, paidCents: 25000, paymentStatus: 'partial', remindersEnabled: true, shipping: { name: 'Farmer', phone: job.recipient }, invoiceLanguage: 'en' };
  const result = await reminder.sendReminder(bill);
  assert.equal(result.amountCents, 75000);
  assert.deepEqual(requests[0].body.template.components[0].parameters.map(p => p.text), ['Farmer', 'CS-00000002', 'INR 750.00']);
  bill.paidCents = 100000; assert.equal(await reminder.sendReminder(bill), null); assert.equal(requests.length, 1);
});
test('webhook verification returns only a valid challenge and requires a configured token', async () => {
  assert.equal((await realFetch(base + '/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status, 403);
  const result = await realFetch(base + '/webhook?hub.mode=subscribe&hub.verify_token=private-verify-token&hub.challenge=123');
  assert.equal(result.status, 200); assert.equal(await result.text(), '123');
  delete process.env.META_WHATSAPP_VERIFY_TOKEN;
  assert.equal((await realFetch(base + '/webhook?hub.mode=subscribe')).status, 503);
});
function callback(value, signature = true) {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value }] }] });
  const hash = crypto.createHmac('sha256', process.env.META_WHATSAPP_APP_SECRET).update(body).digest('hex');
  return realFetch(base + '/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature ? 'sha256=' + hash : 'sha256=bad' }, body });
}
test('signed delivery callbacks update monotonic delivery state separately from acceptance', async () => {
  const value = { metadata: { phone_number_id: '123456789' }, statuses: [{ id: 'wamid.test', status: 'delivered', timestamp: '1790000000' }] };
  assert.equal((await callback(value, false)).status, 401); assert.equal(changes.length, 0);
  assert.equal((await callback({ ...value, metadata: { phone_number_id: 'other' } })).status, 200); assert.equal(changes.length, 0);
  assert.equal((await callback(value)).status, 200); assert.equal(changes.length, 3);
  assert.equal(changes[0].update.$set.deliveryStatus, 'delivered');
  assert.equal(changes[0].filter.$or[1].deliveryRank.$lt, 3);
  assert.equal(changes[0].update.$set.status, undefined);
});
test('signed STOP messages suppress later sends and stop reminders, ordinary messages do nothing', async () => {
  const value = { metadata: { phone_number_id: '123456789' }, messages: [{ from: '919876543210', text: { body: 'STOP' } }] };
  assert.equal((await callback(value)).status, 200);
  assert.equal(changes.find(x => x.model === 'preference').filter.phone, job.recipient);
  assert.equal(changes.find(x => x.model === 'preference').update.$set.optedOut, true);
  assert.equal(changes.find(x => x.model === 'bill').update.$set.remindersEnabled, false);
  changes = []; value.messages[0].text.body = 'Hello'; await callback(value); assert.equal(changes.length, 0);
});
