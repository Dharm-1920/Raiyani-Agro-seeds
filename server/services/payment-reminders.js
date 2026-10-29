const { CounterBill, PaymentReminder } = require('../models');
const { normalizePhone } = require('./identity');
const { financials, DAYS_15 } = require('./bookkeeping');
function configured() {
  return Boolean(/^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || '') && process.env.TWILIO_AUTH_TOKEN && normalizePhone((process.env.TWILIO_WHATSAPP_FROM || '').replace(/^whatsapp:/, '')) && /^HX[a-f0-9]{32}$/i.test(process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID || ''));
}
function reminderText(bill) {
  const amount = (financials(bill).balanceCents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reference = 'CS-' + String(bill._id).slice(-8).toUpperCase();
  return bill.invoiceLanguage === 'gu'
    ? `નમસ્તે ${bill.shipping.name}, રૈયાણી એગ્રો સીડ્સના બિલ ${reference} ની બાકી રકમ INR ${amount} છે. કૃપા કરીને ચુકવણી માટે દુકાનનો સંપર્ક કરો. ચુકવણી કરી હોય તો અમને જણાવો જેથી અમે નોંધ સુધારી શકીએ. આભાર.`
    : `Hello ${bill.shipping.name}, INR ${amount} remains due on your Raiyani Agro Seeds bill ${reference}. Please contact the shop to arrange payment. If you have already paid, let us know so we can update our records. Thank you.`;
}
async function sendReminder(bill) {
  if (!configured()) throw Object.assign(new Error('Reminder service unavailable.'), { code: 'REMINDER_CONFIG' });
  const amountCents = financials(bill).balanceCents;
  const phone = normalizePhone(bill.shipping?.phone);
  if (!bill.remindersEnabled || amountCents <= 0 || !phone) return null;
  const account = process.env.TWILIO_ACCOUNT_SID;
  const body = new URLSearchParams({ From: 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM.replace(/^whatsapp:/, ''), To: 'whatsapp:' + phone,
    ContentSid: process.env.TWILIO_WHATSAPP_REMINDER_CONTENT_SID,
    ContentVariables: JSON.stringify({ '1': bill.shipping.name, '2': 'CS-' + String(bill._id).slice(-8).toUpperCase(), '3': 'INR ' + (amountCents / 100).toFixed(2) }),
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`, {
    method: 'POST', signal: AbortSignal.timeout(20000), headers: { Authorization: 'Basic ' + Buffer.from(`${account}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.sid) throw new Error('Reminder provider did not accept the message.');
  return { providerId: result.sid, amountCents };
}
async function queueDue(now) {
  const bills = await CounterBill.find({ remindersEnabled: true, paymentStatus: { $in: ['pending', 'partial'] }, nextReminderAt: { $lte: now, $ne: null } }).sort({ nextReminderAt: 1 }).limit(100);
  for (const bill of bills) {
    if (financials(bill).balanceCents <= 0) continue;
    try { await PaymentReminder.updateOne({ bill: bill._id, scheduledFor: bill.nextReminderAt }, { $setOnInsert: { bill: bill._id, scheduledFor: bill.nextReminderAt, status: 'pending', attempts: 0, nextAttemptAt: now } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    const cycle = await PaymentReminder.findOne({ bill: bill._id, scheduledFor: bill.nextReminderAt });
    if (cycle && ['accepted', 'failed'].includes(cycle.status)) await advance(cycle, cycle.acceptedAt || cycle.updatedAt || now);
  }
}
async function advance(job, now) {
  await CounterBill.updateOne({ _id: job.bill, remindersEnabled: true, paymentStatus: { $in: ['pending', 'partial'] }, nextReminderAt: job.scheduledFor }, { $set: { nextReminderAt: new Date(now.valueOf() + DAYS_15) } });
}
async function processJob(job, now = new Date()) {
  const claim = { _id: job._id, status: 'sending', leaseUntil: job.leaseUntil };
  const bill = await CounterBill.findById(job.bill);
  if (!bill || !bill.remindersEnabled || financials(bill).balanceCents <= 0 || !bill.nextReminderAt || new Date(bill.nextReminderAt).valueOf() !== new Date(job.scheduledFor).valueOf()) {
    await PaymentReminder.updateOne(claim, { $set: { status: 'cancelled', lastError: '' }, $unset: { leaseUntil: 1 } }); return;
  }
  try {
    // Re-read immediately before sending, so partial payments use the latest balance.
    const result = await sendReminder(bill);
    if (!result) { await PaymentReminder.updateOne(claim, { $set: { status: 'cancelled' }, $unset: { leaseUntil: 1 } }); return; }
    await PaymentReminder.updateOne(claim, { $set: { status: 'accepted', acceptedAt: now, providerId: result.providerId, amountCents: result.amountCents, lastError: '' }, $unset: { leaseUntil: 1 } });
    await advance(job, now);
  } catch {
    await PaymentReminder.updateOne(claim, { $set: { status: job.attempts >= 6 ? 'failed' : 'pending', lastError: 'REMINDER_RETRY', nextAttemptAt: new Date(now.valueOf() + Math.min(60, 2 ** job.attempts) * 60000) }, $unset: { leaseUntil: 1 } });
    if (job.attempts >= 6) await advance(job, now);
  }
}
let running = false;
async function retryPending(now = new Date()) {
  if (running) return;
  running = true;
  try {
    // queueDue also repairs a cycle accepted just before a server restart.
    const expired = await PaymentReminder.find({ status: 'sending', attempts: { $gte: 6 }, leaseUntil: { $lte: now } }).limit(100);
    for (const job of expired) { await PaymentReminder.updateOne({ _id: job._id, status: 'sending', leaseUntil: job.leaseUntil }, { $set: { status: 'failed', lastError: 'REMINDER_RETRY' }, $unset: { leaseUntil: 1 } }); await advance(job, now); }
    await queueDue(now);
    if (!configured()) return;
    for (let count = 0; count < 10; count++) {
      const job = await PaymentReminder.findOneAndUpdate({ attempts: { $lt: 6 }, $or: [{ status: 'pending', nextAttemptAt: { $lte: now } }, { status: 'sending', leaseUntil: { $lte: now } }] }, { $set: { status: 'sending', leaseUntil: new Date(now.valueOf() + 300000) }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1 } });
      if (!job) break;
      await processJob(job, now);
    }
  } finally { running = false; }
}
function startWorker() {
  const run = () => retryPending().catch(() => console.error('Payment reminders will retry.'));
  run(); const timer = setInterval(run, 60000); timer.unref(); return timer;
}
module.exports = { configured, reminderText, sendReminder, queueDue, advance, processJob, retryPending, startWorker };
