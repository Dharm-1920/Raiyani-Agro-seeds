const router = require('express').Router();
const { isValidObjectId } = require('mongoose');
const { CounterBill, CounterCustomer, InvoiceDelivery } = require('../models');
const { protect, adminOnly } = require('../middleware');
const delivery = require('../services/invoice-delivery');
const { prepareBill } = require('../services/counter-bills');
const books = require('../services/bookkeeping');
const reminders = require('../services/payment-reminders');
const { saveStockBill } = require('../services/counter-stock');
router.use(protect, adminOnly);
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    const [items, total] = await Promise.all([CounterBill.find().sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25), CounterBill.countDocuments()]);
    res.json({ items: items.map(books.publicBill), total, page, whatsappConfigured: delivery.whatsappConfigured(), remindersConfigured: reminders.configured() });
  } catch (error) { next(error); }
});
router.post('/', async (req, res, next) => {
  try {
    const data = prepareBill(req.body);
    let bill = await CounterBill.findOne({ requestKey: data.requestKey });
    let created = false;
    if (!bill) {
      if (data.counterCustomer) {
        const customer = await CounterCustomer.findById(data.counterCustomer);
        if (!customer) return res.status(404).json({ message: 'Saved customer not found.' });
        if (data.shipping.name !== customer.name || data.shipping.phone !== (customer.phone || '') || data.shipping.address !== (customer.address || '')) return res.status(409).json({ message: 'Saved customer details changed. Search for and select the customer again.' });
      }
      const now = new Date();
      const document = { ...data, ...books.initialPayment(data, req.user._id, now), createdAt: now, user: req.user._id, invoiceNoticePending: data.invoiceWhatsApp };
      try {
        if (data.items.some(item => item.product)) ({ bill, created } = await saveStockBill(document));
        else { bill = await CounterBill.create(document); created = true; }
      }
      catch (error) {
        if (error.code !== 11000) throw error;
        bill = await CounterBill.findOne({ requestKey: data.requestKey });
      }
    }
    if (!bill || String(bill.user) !== String(req.user._id) || bill.requestHash !== data.requestHash) return res.status(409).json({ message: 'This request already saved a different bill. Start a new bill.' });
    // A queue outage must never make a saved sale look unsuccessful. The worker retries.
    if (bill.invoiceNoticePending) await delivery.queueCounterBill(bill).catch(() => {});
    res.status(created ? 201 : 200).json(books.publicBill(bill));
  } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
});
router.use('/:id', (req, res, next) => isValidObjectId(req.params.id) ? next() : res.status(404).json({ message: 'Bill not found.' }));
router.get('/:id', async (req, res, next) => {
  try { const bill = await CounterBill.findById(req.params.id); if (!bill) return res.status(404).json({ message: 'Bill not found.' }); res.json(books.publicBill(bill)); } catch (error) { next(error); }
});
router.post('/:id/payments', async (req, res, next) => {
  try { res.json(await books.recordPayment(req.params.id, req.body, req.user._id)); }
  catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
});
router.put('/:id/reminders', async (req, res, next) => {
  try {
    if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ message: 'Choose whether reminders are enabled.' });
    const bill = await CounterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found.' });
    if (req.body.enabled && (!bill.shipping?.phone || books.financials(bill).balanceCents <= 0)) return res.status(400).json({ message: 'Reminders need an outstanding balance and customer phone number.' });
    const updated = await CounterBill.findOneAndUpdate({ _id: bill._id, __v: bill.__v ?? 0 }, { $set: { remindersEnabled: req.body.enabled, nextReminderAt: req.body.enabled ? bill.nextReminderAt || new Date(Date.now() + books.DAYS_15) : null }, $inc: { __v: 1 } }, { new: true });
    if (!updated) return res.status(409).json({ message: 'The bill changed. Refresh it before updating reminders.' });
    res.json(books.publicBill(updated));
  } catch (error) { next(error); }
});
router.get('/:id/reminder', async (req, res, next) => {
  try {
    const bill = await CounterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found.' });
    if (!bill.remindersEnabled || books.financials(bill).balanceCents <= 0) return res.status(409).json({ message: 'This bill has no active payment reminder.' });
    const phone = require('../services/identity').normalizePhone(bill.shipping?.phone);
    if (!phone) return res.status(400).json({ message: 'A valid customer phone number is required.' });
    res.json({ url: 'https://wa.me/' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(reminders.reminderText(bill)) });
  } catch (error) { next(error); }
});
router.get('/:id/reminder-status', async (req, res, next) => {
  try {
    const bill = await CounterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found.' });
    const latest = await require('../models').PaymentReminder.findOne({ bill: bill._id }).sort({ scheduledFor: -1 }).select('status acceptedAt scheduledFor lastError');
    res.json({ configured: reminders.configured(), latest });
  } catch (error) { next(error); }
});
router.get('/:id/invoice', async (req, res, next) => {
  try {
    const bill = await CounterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found.' });
    const lang = req.query.lang === 'gu' ? 'gu' : req.query.lang === 'en' ? 'en' : bill.invoiceLanguage;
    const pdf = await require('../services/invoice').createInvoice(books.publicBill(bill), { lang });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="counter-bill-${bill._id}.pdf"`, 'Cache-Control': 'private, no-store' }).send(pdf);
  } catch (error) { next(error); }
});
router.get('/:id/delivery', async (req, res, next) => {
  try {
    const bill = await CounterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found.' });
    const job = await InvoiceDelivery.findOne({ order: bill._id, source: 'counter', channel: 'whatsapp' });
    res.json({ configured: delivery.whatsappConfigured(), requested: bill.invoiceWhatsApp, status: job?.status || (bill.invoiceWhatsApp ? 'pending' : 'not_requested') });
  } catch (error) { next(error); }
});
router.post('/:id/share', async (req, res, next) => {
  try {
    const bill = await CounterBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found.' });
    if (!bill.invoiceWhatsApp || !bill.invoicePhone) return res.status(400).json({ message: 'This customer did not request a WhatsApp bill. Download or print the PDF instead.' });
    await delivery.queueCounterBill(bill);
    const job = await InvoiceDelivery.findOne({ order: bill._id, source: 'counter', channel: 'whatsapp' });
    const origin = require('../services/identity').publicOrigin();
    res.json({ url: `${origin}/${delivery.invoicePath(job)}`, phone: bill.invoicePhone, publicWebsite: origin.startsWith('https://') });
  } catch (error) { next(error); }
});
module.exports = router;
