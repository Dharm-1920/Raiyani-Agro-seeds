const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { CounterBill, PaymentReminder } = require('../models');
const reminder = require('../services/payment-reminders');
const { DAYS_15 } = require('../services/bookkeeping');
const id = '000000000000000000000001', date = new Date('2026-10-16T10:00:00Z');
let bill, jobs, sends, failProvider;
const realFetch = global.fetch;
function matches(document, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(document, part));
    if (value instanceof Date) return new Date(document[key]).valueOf() === value.valueOf();
    if (value && typeof value === 'object') return Object.entries(value).every(([operator, bound]) => operator === '$in' ? bound.includes(document[key]) : operator === '$lte' ? document[key] != null && document[key] <= bound : operator === '$gte' ? document[key] >= bound : operator === '$lt' ? document[key] < bound : operator === '$ne' ? document[key] !== bound : false);
    return String(document[key]) === String(value);
  });
}
function apply(document, changes) {
  Object.assign(document, changes.$set || {}); for (const field of Object.keys(changes.$unset || {})) delete document[field];
  for (const [field, value] of Object.entries(changes.$inc || {})) document[field] = (document[field] || 0) + value;
}
CounterBill.find = query => ({ sort: () => ({ limit: async () => matches(bill, query) ? [structuredClone(bill)] : [] }) });
CounterBill.findById = async value => String(value) === id ? structuredClone(bill) : null;
CounterBill.updateOne = async (query, changes) => { if (matches(bill, query)) apply(bill, changes); };
PaymentReminder.updateOne = async (query, changes, options) => {
  let job = jobs.find(row => matches(row, query));
  if (!job && options?.upsert) { job = { _id: String(jobs.length + 1), ...changes.$setOnInsert, updatedAt: date }; jobs.push(job); }
  if (job) apply(job, changes);
};
PaymentReminder.findOne = async query => jobs.find(job => matches(job, query)) || null;
PaymentReminder.find = query => ({ limit: async () => jobs.filter(job => matches(job, query)).map(job => ({ ...job })) });
PaymentReminder.findOneAndUpdate = async (query, changes) => { const job = jobs.find(job => matches(job, query)); if (!job) return null; apply(job, changes); return { ...job }; };
beforeEach(() => {
  bill = { _id: id, totalAmount: 1000, paidCents: 25000, paymentStatus: 'partial', nextReminderAt: date, remindersEnabled: true, shipping: { name: 'Farmer', phone: '+919876543210' }, invoiceLanguage: 'en' };
  jobs = []; sends = []; failProvider = false;
  process.env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32); process.env.TWILIO_AUTH_TOKEN = 'private-test-token'; process.env.TWILIO_WHATSAPP_FROM = '+14155550123'; process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID = 'HX' + 'b'.repeat(32);
  global.fetch = async (url, options) => { sends.push({ url, body: options.body }); if (failProvider) throw Error('outage'); return { ok: true, json: async () => ({ sid: 'SM-test-' + sends.length }) }; };
});
after(() => { global.fetch = realFetch; });
test('no early reminder; sends the outstanding balance once due and schedules 15 days later', async () => {
  await reminder.retryPending(new Date(date.valueOf() - 1)); assert.equal(sends.length, 0); assert.equal(jobs.length, 0);
  await reminder.retryPending(date); assert.equal(sends.length, 1); assert.equal(jobs[0].status, 'accepted');
  assert.equal(sends[0].body.get('To'), 'whatsapp:+919876543210');
  assert.equal(JSON.parse(sends[0].body.get('ContentVariables'))['3'], 'INR 750.00');
  assert.equal(bill.nextReminderAt.valueOf(), date.valueOf() + DAYS_15);
  await reminder.retryPending(date); assert.equal(sends.length, 1);
  await reminder.retryPending(new Date(date.valueOf() + DAYS_15)); assert.equal(sends.length, 2);
});
test('a queued reminder rechecks partial payments and a paid or disabled bill is never sent', async () => {
  await reminder.queueDue(date); bill.paidCents = 90000;
  await reminder.retryPending(date);
  assert.equal(JSON.parse(sends[0].body.get('ContentVariables'))['3'], 'INR 100.00');
  jobs = []; sends = []; bill.nextReminderAt = date; await reminder.queueDue(date);
  bill.paidCents = 100000; bill.paymentStatus = 'paid'; bill.remindersEnabled = false; bill.nextReminderAt = null;
  await reminder.retryPending(date); assert.equal(sends.length, 0); assert.equal(jobs[0].status, 'cancelled');
});
test('missing configuration retains the due job without claiming it was sent', async () => {
  delete process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID;
  await reminder.retryPending(date); assert.equal(sends.length, 0); assert.equal(jobs[0].status, 'pending'); assert.equal(jobs[0].attempts, 0);
  assert.equal(bill.nextReminderAt.valueOf(), date.valueOf());
});
test('provider failure retries without changing the balance and recovery advances an accepted cycle', async () => {
  failProvider = true; await reminder.retryPending(date);
  assert.equal(jobs[0].status, 'pending'); assert.equal(bill.paidCents, 25000); assert.equal(jobs[0].attempts, 1);
  failProvider = false; await reminder.retryPending(new Date(date.valueOf() + 120000));
  assert.equal(jobs[0].status, 'accepted'); const accepted = jobs[0].acceptedAt;
  bill.nextReminderAt = date; await reminder.retryPending(new Date(date.valueOf() + 180000));
  assert.equal(bill.nextReminderAt.valueOf(), accepted.valueOf() + DAYS_15); assert.equal(sends.length, 2);
});
test('reminder text uses the unpaid balance and supports Gujarati', () => {
  assert.match(reminder.reminderText(bill), /750.00/); assert.doesNotMatch(reminder.reminderText(bill), /1000.00/);
  bill.invoiceLanguage = 'gu'; assert.match(reminder.reminderText(bill), /બાકી રકમ/);
});
test('a crashed final attempt leaves a failed cycle and a future reminder rather than a stuck job', async () => {
  await reminder.queueDue(date);
  Object.assign(jobs[0], { status: 'sending', attempts: 6, leaseUntil: new Date(date.valueOf() - 1) });
  await reminder.retryPending(date);
  assert.equal(sends.length, 0); assert.equal(jobs[0].status, 'failed');
  assert.equal(bill.nextReminderAt.valueOf(), date.valueOf() + DAYS_15);
});
