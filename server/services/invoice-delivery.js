const jwt = require('jsonwebtoken');
const { Order, User, InvoiceDelivery } = require('../models');
const { normalizePhone, normalizeEmail, publicOrigin } = require('./identity');
const mail = require('./mail');
const invoice = require('./invoice');
function whatsappConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_CONTENT_SID && (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL));
}
async function queueOrder(order) {
  const common = { order: order._id, user: order.user?._id || order.user, language: order.invoiceLanguage || 'en' };
  const channels = [];
  if (normalizeEmail(order.invoiceEmail)) channels.push(['email', order.invoiceEmail]);
  if (order.invoiceWhatsApp && normalizePhone(order.invoicePhone)) channels.push(['whatsapp', normalizePhone(order.invoicePhone)]);
  for (const [channel, recipient] of channels) {
    try { await InvoiceDelivery.updateOne({ order: order._id, channel }, { $setOnInsert: { ...common, channel, recipient, status: 'pending', attempts: 0, nextAttemptAt: new Date() } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  await Order.updateOne({ _id: order._id }, { $set: { invoiceNoticePending: false } });
}
function invoicePath(delivery) {
  const token = jwt.sign({ purpose: 'invoice-delivery', deliveryId: String(delivery._id), orderId: String(delivery.order) }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
  return `api/invoices/shared/${token}/purchase-invoice.pdf`;
}
async function sendWhatsApp(delivery, order) {
  const account = process.env.TWILIO_ACCOUNT_SID;
  if (!/^AC[a-f0-9]{32}$/i.test(account)) throw Object.assign(new Error('Invalid WhatsApp account.'), { code: 'WHATSAPP_CONFIG' });
  // Approved document template: {{1}} = order reference, {{2}} = total, {{3}} = PDF path after the fixed website domain.
  const body = new URLSearchParams({
    From: 'whatsapp:' + process.env.TWILIO_WHATSAPP_FROM.replace(/^whatsapp:/, ''),
    To: 'whatsapp:' + delivery.recipient,
    ContentSid: process.env.TWILIO_WHATSAPP_CONTENT_SID,
    ContentVariables: JSON.stringify({ '1': String(order._id).slice(-8).toUpperCase(), '2': 'INR ' + Number(order.totalAmount).toFixed(2), '3': invoicePath(delivery) }),
  });
  if (!publicOrigin().startsWith('https://')) throw Object.assign(new Error('WhatsApp needs the public HTTPS website.'), { code: 'WHATSAPP_CONFIG' });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: 'Basic ' + Buffer.from(`${account}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.sid) throw Object.assign(new Error('WhatsApp provider did not accept the invoice.'), { code: 'WHATSAPP_REJECTED' });
  return result.sid;
}
async function deliver(job) {
  const order = await Order.findById(job.order).populate('user', 'name email');
  if (!order || String(order.user?._id || order.user) !== String(job.user)) throw Object.assign(new Error('Order is unavailable.'), { code: 'ORDER_UNAVAILABLE' });
  if (job.channel === 'email') {
    const user = await User.findById(job.user);
    if (!user || !user.emailVerified || user.email !== job.recipient) {
      await InvoiceDelivery.updateOne({ _id: job._id, status: 'sending', leaseUntil: job.leaseUntil }, { $set: { status: 'pending', lastError: 'VERIFY_EMAIL', nextAttemptAt: new Date(Date.now() + 15 * 60000) }, $unset: { leaseUntil: 1 }, $inc: { attempts: -1 } });
      return;
    }
    const pdf = await invoice.createInvoice(order, { lang: job.language });
    const id = await mail.send({ to: job.recipient, subject: `Your Raiyani Agro Seeds invoice #${String(order._id).slice(-8).toUpperCase()}`,
      text: `Thank you for your order. Your purchase invoice is attached.\nOrder total: INR ${Number(order.totalAmount).toFixed(2)}\nPayment status: ${order.paymentStatus}\nA purchase invoice is not proof of payment when payment is pending.`,
      messageId: `<invoice-${job._id}@${new URL(publicOrigin()).hostname}>`,
      attachments: [{ filename: `purchase-invoice-${order._id}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    await InvoiceDelivery.updateOne({ _id: job._id, status: 'sending', leaseUntil: job.leaseUntil }, { $set: { status: 'accepted', providerId: id, acceptedAt: new Date(), lastError: '' }, $unset: { leaseUntil: 1 } });
  } else {
    if (!order.invoiceWhatsApp || job.recipient !== order.invoicePhone) throw Object.assign(new Error('WhatsApp permission is missing.'), { code: 'NO_WHATSAPP_CONSENT' });
    const id = await sendWhatsApp(job, order);
    await InvoiceDelivery.updateOne({ _id: job._id, status: 'sending', leaseUntil: job.leaseUntil }, { $set: { status: 'accepted', providerId: id, acceptedAt: new Date(), lastError: '' }, $unset: { leaseUntil: 1 } });
  }
}
let running = false;
async function retryPending() {
  if (running) return;
  running = true;
  try {
    await InvoiceDelivery.updateMany({ status: 'sending', attempts: { $gte: 6 }, leaseUntil: { $lte: new Date() } }, { $set: { status: 'failed', lastError: 'DELIVERY_RETRY' }, $unset: { leaseUntil: 1 } });
    const orders = await Order.find({ invoiceNoticePending: true }).limit(25);
    for (const order of orders) await queueOrder(order);
    const channels = [...(mail.configured() ? ['email'] : []), ...(whatsappConfigured() ? ['whatsapp'] : [])];
    if (!channels.length) return;
    for (let count = 0; count < 10; count++) {
      const now = new Date();
      const job = await InvoiceDelivery.findOneAndUpdate({ channel: { $in: channels }, attempts: { $lt: 6 }, $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } }, { status: 'sending', leaseUntil: { $lte: now } },
      ] }, { $set: { status: 'sending', leaseUntil: new Date(Date.now() + 5 * 60000) }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1 } });
      if (!job) break;
      try { await deliver(job); }
      catch (error) {
        await InvoiceDelivery.updateOne({ _id: job._id, status: 'sending', leaseUntil: job.leaseUntil }, { $set: {
          status: job.attempts >= 6 ? 'failed' : 'pending', lastError: ['ORDER_UNAVAILABLE', 'NO_WHATSAPP_CONSENT', 'WHATSAPP_CONFIG'].includes(error.code) ? error.code : 'DELIVERY_RETRY',
          nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000),
        }, $unset: { leaseUntil: 1 } });
      }
    }
  } finally { running = false; }
}
function startWorker() {
  const run = () => retryPending().catch(() => console.error('Invoice delivery will retry.'));
  run(); const timer = setInterval(run, 15000); timer.unref(); return timer;
}
module.exports = { whatsappConfigured, queueOrder, invoicePath, sendWhatsApp, deliver, retryPending, startWorker };
