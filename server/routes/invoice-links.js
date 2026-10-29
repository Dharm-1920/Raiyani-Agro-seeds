const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { isValidObjectId } = require('mongoose');
const { Order, CounterBill, InvoiceDelivery } = require('../models');
router.get('/shared/:token/purchase-invoice.pdf', async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
  try {
    const data = jwt.verify(req.params.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (data.purpose !== 'invoice-delivery' || !isValidObjectId(data.deliveryId) || !isValidObjectId(data.orderId)) throw new Error('Invalid link');
    const job = await InvoiceDelivery.findOne({ _id: data.deliveryId, order: data.orderId, channel: 'whatsapp' });
    if (!job) throw new Error('Invalid link');
    const order = job.source === 'counter' ? await CounterBill.findById(data.orderId) : await Order.findById(data.orderId).populate('user', 'name email');
    if (!order || !order.invoiceWhatsApp || String(order.user?._id || order.user) !== String(job.user) || job.recipient !== order.invoicePhone) throw new Error('Invalid link');
    const pdf = await require('../services/invoice').createInvoice(order, { lang: job.language });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="purchase-invoice-${order._id}.pdf"` }).send(pdf);
  } catch { res.status(404).json({ message: 'This invoice link is unavailable or expired. Download it from your account.' }); }
});
module.exports = router;
