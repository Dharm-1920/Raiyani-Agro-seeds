const express = require('express');
const crypto = require('crypto');
const { normalizePhone } = require('../services/identity');
const { InvoiceDelivery, PaymentReminder, RestockDelivery, WhatsAppPreference, StockSubscription, CounterBill } = require('../models');
const router = express.Router();
function equal(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
router.get('/', (req, res) => {
  if (!process.env.META_WHATSAPP_VERIFY_TOKEN) return res.sendStatus(503);
  if (req.query['hub.mode'] !== 'subscribe' || !equal(req.query['hub.verify_token'], process.env.META_WHATSAPP_VERIFY_TOKEN) || typeof req.query['hub.challenge'] !== 'string') return res.sendStatus(403);
  res.type('text/plain').send(req.query['hub.challenge']);
});
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const secret = process.env.META_WHATSAPP_APP_SECRET;
  if (!secret || !process.env.META_WHATSAPP_PHONE_NUMBER_ID) return res.sendStatus(503);
  if (!Buffer.isBuffer(req.body)) return res.sendStatus(400);
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  if (!equal(req.get('X-Hub-Signature-256'), signature)) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  if (event.object !== 'whatsapp_business_account') return res.sendStatus(400);
  try {
    for (const entry of event.entry || []) for (const change of entry.changes || []) {
      const value = change.value;
      if (change.field !== 'messages' || value?.metadata?.phone_number_id !== process.env.META_WHATSAPP_PHONE_NUMBER_ID) continue;
      for (const status of value.statuses || []) {
        const rank = { sent: 1, failed: 2, delivered: 3, read: 4 }[status.status];
        if (!rank || typeof status.id !== 'string') continue;
        const timestamp = Number(status.timestamp);
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) continue;
        const filter = { providerId: status.id, $or: [{ deliveryRank: { $exists: false } }, { deliveryRank: { $lt: rank } }] };
        const update = { $set: { deliveryStatus: status.status, deliveryRank: rank, deliveryTimestamp: timestamp } };
        await Promise.all([InvoiceDelivery, PaymentReminder, RestockDelivery].map(model => model.updateMany(filter, update)));
      }
      for (const message of value.messages || []) {
        const text = (message.text?.body || message.button?.text || message.interactive?.button_reply?.title || '').trim().toUpperCase();
        const phone = normalizePhone('+' + String(message.from || '').replace(/^\+/, ''));
        if (!phone || !['STOP', 'STOP ALL', 'UNSUBSCRIBE', 'બંધ', 'બંધ કરો'].includes(text)) continue;
        await WhatsAppPreference.updateOne({ phone }, { $set: { optedOut: true, optedOutAt: new Date() } }, { upsert: true });
        await StockSubscription.updateMany({ whatsappPhone: phone }, { $set: { whatsapp: false } });
        await CounterBill.updateMany({ remindersEnabled: true, $or: [{ invoicePhone: phone }, { 'shipping.phone': phone }] }, { $set: { remindersEnabled: false, nextReminderAt: null } });
      }
    }
    res.json({ ok: true });
  } catch { res.sendStatus(503); }
});
module.exports = router;
