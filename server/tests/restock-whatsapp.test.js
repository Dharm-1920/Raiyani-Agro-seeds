const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { Product, StockSubscription, RestockDelivery } = require('../models');
const meta = require('../services/whatsapp-meta');
const service = require('../services/restock-whatsapp');
let subscription, product, jobs, sends, enabled, failure;
const originalConfigured = meta.configured, originalSend = meta.sendTemplate;
const sid = '000000000000000000000001', pid = '000000000000000000000002', uid = '000000000000000000000003';
const matches = (doc, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(part => matches(doc, part));
  if (value instanceof Date) return new Date(doc[key]).valueOf() === value.valueOf();
  if (value && typeof value === 'object') return Object.entries(value).every(([op, bound]) => op === '$lt' ? doc[key] < bound : op === '$lte' ? doc[key] != null && doc[key] <= bound : op === '$gte' ? doc[key] >= bound : op === '$gt' ? doc[key] > bound : op === '$ne' ? doc[key] !== bound : false);
  return String(doc[key]) === String(value);
});
const apply = (doc, changes) => { Object.assign(doc, changes.$set || {}); for (const key of Object.keys(changes.$unset || {})) delete doc[key]; for (const [key, value] of Object.entries(changes.$inc || {})) doc[key] = (doc[key] || 0) + value; };
RestockDelivery.updateOne = async (query, update, options) => {
  let job = jobs.find(job => matches(job, query));
  if (!job && options?.upsert) { job = { _id: 'job-' + jobs.length, ...structuredClone(update.$setOnInsert) }; jobs.push(job); }
  if (job) apply(job, update);
};
RestockDelivery.updateMany = async (query, update) => jobs.filter(job => matches(job, query)).forEach(job => apply(job, update));
RestockDelivery.findOneAndUpdate = async (query, update) => { const job = jobs.find(job => matches(job, query)); if (!job) return null; apply(job, update); return { ...job }; };
StockSubscription.findById = async () => subscription;
Product.findOne = async query => product && matches(product, query) ? product : null;
beforeEach(() => {
  process.env.APP_URL = 'https://shop.example.com';
  subscription = { _id: sid, product: pid, user: uid, whatsapp: true, whatsappPhone: '+919876543210', whatsappConsentAt: new Date(), language: 'gu', active: false };
  product = { _id: pid, name: 'Pump', nameGu: 'પંપ', isActive: true, isDeleted: false, stock: 1 };
  jobs = []; sends = []; enabled = true; failure = null;
  meta.configured = () => enabled;
  meta.sendTemplate = async args => { if (failure) throw Object.assign(new Error('Provider failed'), { code: failure }); sends.push(args); return 'wamid.restock'; };
});
after(() => { meta.configured = originalConfigured; meta.sendTemplate = originalSend; });
test('one durable job per consented subscription, Gujarati name and public product link', async () => {
  await service.queue(subscription); await service.queue(subscription); assert.equal(jobs.length, 1);
  await service.retryPending(); await service.retryPending();
  assert.equal(sends.length, 1); assert.equal(jobs[0].status, 'accepted');
  assert.deepEqual(sends[0].values, ['પંપ', 'https://shop.example.com/product/' + pid]);
  assert.equal(sends[0].recipient, subscription.whatsappPhone);
});
test('legacy website-only subscriptions and absent consent never enter WhatsApp outbox', async () => {
  subscription.whatsapp = false; await service.queue(subscription); assert.equal(jobs.length, 0);
  subscription.whatsapp = true; delete subscription.whatsappConsentAt; await service.queue(subscription); assert.equal(jobs.length, 0);
});
test('worker rechecks cancellation, consent, recipient, owner, availability and visibility', async () => {
  for (const change of [() => subscription.cancelledAt = new Date(), () => subscription.whatsapp = false, () => subscription.whatsappPhone = '+919999999999', () => subscription.user = 'different', () => product.stock = 0, () => product.isActive = false, () => product.isDeleted = true]) {
    subscription = { _id: sid, product: pid, user: uid, whatsapp: true, whatsappPhone: '+919876543210', whatsappConsentAt: new Date() };
    product = { _id: pid, name: 'Pump', stock: 1, isActive: true, isDeleted: false }; jobs = [];
    await service.queue(subscription); change(); await service.retryPending();
    assert.equal(jobs[0].status, 'cancelled');
  }
  assert.equal(sends.length, 0);
});
test('disabled sending leaves jobs pending; temporary errors retry and opt-outs cancel', async () => {
  await service.queue(subscription); enabled = false; await service.retryPending(); assert.equal(jobs[0].attempts, 0);
  enabled = true; failure = 'WHATSAPP_REJECTED'; await service.retryPending(); assert.equal(jobs[0].status, 'pending'); assert.equal(jobs[0].attempts, 1);
  jobs[0].nextAttemptAt = new Date(0); failure = null; await service.retryPending(); assert.equal(jobs[0].status, 'accepted'); assert.equal(sends.length, 1);
  jobs = []; await service.queue(subscription); failure = 'WHATSAPP_OPT_OUT'; await service.retryPending(); assert.equal(jobs[0].status, 'cancelled');
});
test('crashed final attempt is released as failed instead of remaining stuck', async () => {
  await service.queue(subscription); Object.assign(jobs[0], { status: 'sending', attempts: 6, leaseUntil: new Date(0) });
  await service.retryPending(); assert.equal(jobs[0].status, 'failed'); assert.equal(sends.length, 0);
});
