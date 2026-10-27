const router = require('express').Router();
const { configured, checkoutData } = require('../services/payments');
const { cancelOrder } = require('../services/cancellation');
const { Order, Product } = require('../models');
const { protect } = require('../middleware');
const notices = require('../services/notifications');
router.use(protect);
async function restock(items, reservationId) {
  const quantities = new Map();
  for (const item of items) quantities.set(String(item.product), (quantities.get(String(item.product)) || 0) + item.qty);
  for (const [product, qty] of quantities) await Product.updateOne({ _id: product, cancellationRestocks: { $ne: reservationId } }, { $inc: { stock: qty }, $addToSet: { cancellationRestocks: reservationId } });
}

// Create order: prices always come from the database, stock is decremented atomically
router.post('/', async (req, res) => {
  const taken = []; let saved; const reservationId = new (require('mongoose').Types.ObjectId)();
  try {
  if (req.body.accountId && String(req.body.accountId) !== String(req.user._id)) return res.status(403).json({ message: 'Your account changed. Please reload checkout.' });
  const { items, shipping, paymentMethod } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'Cart is empty' });
  if (items.length > 100 || items.some(it => !it || !Number.isSafeInteger(Number(it.qty)) || Number(it.qty) <= 0 || Number(it.qty) > 10000)) return res.status(400).json({ message: 'Use whole-number quantities between 1 and 10000.' });
  if (!shipping || !shipping.name || !shipping.phone || !shipping.address) return res.status(400).json({ message: 'Shipping details required' });
  if (!['cod', 'upi'].includes(paymentMethod)) return res.status(400).json({ message: 'Invalid payment method' });
  if (paymentMethod === 'upi' && !configured()) return res.status(400).json({ message: 'UPI QR payment is not configured. Use Cash on Delivery.' });
  const lines = [];
  for (const it of items) {
    const qty = Math.floor(Number(it.qty));
    const p = qty > 0 && await Product.findOneAndUpdate(
      { _id: it.productId, isActive: true, isDeleted: { $ne: true }, stock: { $gte: qty } }, { $inc: { stock: -qty } }, { new: true }).catch(() => null);
    if (!p) { await restock(taken, reservationId); return res.status(409).json({ message: 'An item is out of stock or unavailable' }); }
    taken.push({ product: p._id, qty });
    lines.push({ product: p._id, name: p.name, nameGu: p.nameGu, price: p.price, qty });
  }
  const itemsTotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const shippingFee = itemsTotal >= 500 ? 0 : 40;
  const order = await Order.create({
    _id: reservationId, user: req.user._id, items: lines, shipping, itemsTotal, shippingFee,
    totalAmount: itemsTotal + shippingFee, paymentMethod,
    orderStatus: paymentMethod === 'cod' ? 'confirmed' : 'placed',
    adminNoticePending: true,
  });
  saved = order;
  const response = paymentMethod === 'upi' ? await checkoutData(order) : { order };
  await notices.safely(() => notices.processOrderNotifications(order));
  res.status(201).json(response);
  } catch(e) {
    console.error('Order creation failed:', e.message);
    try { if (saved) await cancelOrder(saved._id, req.user); else if (taken.length) await restock(taken, reservationId); } catch { return res.status(503).json({ message: 'Order could not finish. Please contact the shop before retrying.' }); }
    res.status(e.status || 500).json({ message: e.status ? e.message : 'Order could not be created. Please try again.' });
  }
});
router.get('/:id/qr', async (req, res) => {
  try {
    const order=await Order.findOne({_id:req.params.id,user:req.user._id,paymentMethod:'upi'});
    if(!order)return res.status(404).json({message:'Order not found'});
    if(!['placed','confirmed'].includes(order.orderStatus) || order.paymentStatus==='refunded')return res.status(409).json({message:'This order cannot be paid.'});
    if(order.paymentStatus==='paid')return res.status(409).json({message:'This order is already paid.'});
    res.json(await checkoutData(order));
  }catch(e){res.status(e.status || 503).json({message:e.status?e.message:'QR could not be generated. Please retry.'});}
});
router.post('/:id/payment-reference', async (req,res)=>{
  try {
    const reference=String(req.body.reference || '').trim();
    if(!/^\d{12}$/.test(reference))return res.status(400).json({message:'Enter the 12-digit UPI transaction reference (UTR) from your payment app.'});
    const order=await Order.findOneAndUpdate({_id:req.params.id,user:req.user._id,paymentMethod:'upi',paymentStatus:{$in:['pending','failed']},orderStatus:{$in:['placed','confirmed']}},{$set:{paymentReference:reference,paymentSubmittedAt:new Date()}},{new:true});
    if(!order)return res.status(409).json({message:'This order is unavailable or cannot accept a payment reference.'});
    res.json({order,message:'Reference sent. The shop will verify receipt in its bank account.'});
  }catch {res.status(503).json({message:'Reference could not be saved. Please retry.'});}
});
router.get('/my', async (req, res) => res.json(await Order.find({ user: req.user._id }).sort({ createdAt: -1 })));
const getOwned = async (req) => {
  const o = await Order.findById(req.params.id).populate('user', 'name email').catch(() => null);
  if (!o) return null;
  return req.user.role === 'admin' || String(o.user._id) === String(req.user._id) ? o : null;
};
router.get('/:id', async (req, res) => { const o = await getOwned(req); o ? res.json(o) : res.status(404).json({ message: 'Order not found' }); });
router.put('/:id/cancel', async (req, res) => {
  try { res.json({ order: await cancelOrder(req.params.id, req.user) }); }
  catch(e) { res.status(e.status || 500).json({ message: e.status ? e.message : 'Cancellation could not finish. Retry to complete it safely.' }); }
});
router.get('/:id/invoice', async (req, res) => {
  try {
    const order=await getOwned(req);
    if(!order)return res.status(404).json({message:'Order not found'});
    const {createInvoice}=require('../services/invoice');
    const pdf=await createInvoice(order,{lang:req.query.lang==='gu'?'gu':'en'});
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="purchase-invoice-${order._id}.pdf"`,'Cache-Control':'private, no-store'});
    res.send(pdf);
  }catch(e){console.error('Invoice generation failed:',e.message);res.status(503).json({message:'Invoice could not be generated. Please retry.'});}
});
module.exports = router;
