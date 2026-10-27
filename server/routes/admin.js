const router = require('express').Router();
const { User, Product, Order, Message } = require('../models');
const { protect, adminOnly } = require('../middleware');
const notices = require('../services/notifications');
router.use(protect, adminOnly);
router.get('/payment-config',(req,res)=>{const config=require('../services/payments').paymentConfig();res.json(config);});
const { cancelOrder } = require('../services/cancellation');
router.post('/orders/:id/payment-confirm', async(req,res)=>{
  try {
    const reference=String(req.body.reference || '').trim();
    if(!/^\d{12}$/.test(reference))return res.status(400).json({message:'Provide the bank-verified 12-digit UPI reference.'});
    const current=await Order.findOne({_id:req.params.id,paymentMethod:'upi'});
    if(!current || !['placed','confirmed','cancelled'].includes(current.orderStatus))return res.status(409).json({message:'Order cannot be marked paid.'});
    const order=await Order.findOneAndUpdate({_id:req.params.id,paymentMethod:'upi',paymentStatus:{$in:['pending','failed']},orderStatus:current.orderStatus},{$set:{paymentStatus:'paid',orderStatus:current.orderStatus === 'cancelled' ? 'cancelled' : 'confirmed',transactionId:reference,paymentVerifiedBy:req.user._id,paymentVerifiedAt:new Date(),...(current.orderStatus === 'cancelled' ? {refundStatus:'pending_review'} : {})}},{new:true});
    if(!order)return res.status(409).json({message:'Order changed or cannot be marked paid. Refresh orders.'});
    res.json({order});
  }catch {res.status(503).json({message:'Payment confirmation could not be saved.'});}
});
router.post('/orders/:id/refund-confirm', async(req,res)=>{
  try {
    const reference=String(req.body.reference || '').trim();
    if(!/^[a-zA-Z0-9-]{6,64}$/.test(reference))return res.status(400).json({message:'Provide the completed refund transaction reference.'});
    const order=await Order.findOneAndUpdate({_id:req.params.id,orderStatus:'cancelled',paymentStatus:'paid'},{$set:{paymentStatus:'refunded',refundStatus:'completed',refundReference:reference,refundVerifiedBy:req.user._id,refundVerifiedAt:new Date()}},{new:true});
    if(!order)return res.status(409).json({message:'Only a paid cancelled order can be marked refunded.'});
    res.json({order});
  }catch {res.status(503).json({message:'Refund confirmation could not be saved.'});}
});
router.put('/orders/:id/cancel', async (req, res) => {
  try { res.json({ order: await cancelOrder(req.params.id, req.user) }); }
  catch(e) { res.status(e.status || 500).json({ message: e.status ? e.message : 'Cancellation could not finish. Please retry.' }); }
});
router.get('/stats', async (req, res) => {
  const paid = { $or: [{ paymentStatus: 'paid' }, { paymentMethod: 'cod', orderStatus: 'delivered' }] };
  const [orders, users, products, revenue, byStatus, lowStock, top] = await Promise.all([
    Order.countDocuments(), User.countDocuments({ role: 'user' }), Product.countDocuments({ isActive: true }),
    Order.aggregate([{ $match: { ...paid, orderStatus: { $ne: 'cancelled' } } }, { $group: { _id: null, t: { $sum: '$totalAmount' } } }]),
    Order.aggregate([{ $group: { _id: '$orderStatus', n: { $sum: 1 } } }]),
    Product.find({ isActive: true, stock: { $lte: 5 } }).select('name nameGu stock').sort({ stock: 1 }).limit(10),
    Order.aggregate([{ $match: { orderStatus: { $ne: 'cancelled' } } }, { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' } } }, { $sort: { qty: -1 } }, { $limit: 5 }]),
  ]);
  res.json({ orders, users, products, revenue: revenue[0]?.t || 0, byStatus, lowStock, top });
});
router.get('/orders', async (req, res) => {
  const q = req.query.status ? { orderStatus: req.query.status } : {};
  res.json(await Order.find(q).populate('user', 'name email').sort({ createdAt: -1 }).limit(200));
});
router.put('/orders/:id/status', async (req, res) => {
  const { orderStatus } = req.body;
  if (orderStatus === 'cancelled') {
    try { return res.json(await cancelOrder(req.params.id, req.user)); }
    catch(e) { return res.status(e.status || 500).json({ message: e.status ? e.message : 'Cancellation could not finish. Please retry.' }); }
  }
  const o = await Order.findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Order not found' });
  if (orderStatus && ['delivered', 'cancelled'].includes(o.orderStatus) && orderStatus !== o.orderStatus)
    return res.status(400).json({ message: 'Delivered and cancelled orders cannot change status.' });
  const originalStatus = o.orderStatus;
  if (orderStatus) {
    if (!Order.schema.path('orderStatus').enumValues.includes(orderStatus)) return res.status(400).json({ message: 'Bad status' });
    if (o.paymentMethod !== 'cod' && o.paymentStatus !== 'paid' && ['confirmed', 'shipped', 'delivered'].includes(orderStatus)) return res.status(409).json({ message: 'Verify the UPI payment before fulfilling this order.' });
    o.orderStatus = orderStatus;
    if (orderStatus === 'delivered' && o.paymentMethod === 'cod') o.paymentStatus = 'paid';
  }

  const updated = await Order.findOneAndUpdate({ _id: o._id, orderStatus: originalStatus }, { $set: { orderStatus: o.orderStatus, ...(o.orderStatus === 'delivered' && originalStatus !== 'delivered' ? { deliveryNoticePending: true } : {}), ...(o.paymentMethod === 'cod' && o.orderStatus === 'delivered' ? { paymentStatus: 'paid' } : {}) } }, { new: true });
  if (!updated) return res.status(409).json({ message: 'Order changed. Please refresh before updating it.' });
  await notices.safely(() => notices.processOrderNotifications(updated));
  res.json(updated);
});
router.get('/users', async (req, res) => res.json(await User.find().select('-password').sort({ createdAt: -1 })));
router.put('/users/:id/role', async (req, res) => {
  if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot change your own role' });
  res.json(await User.findByIdAndUpdate(req.params.id, { role: req.body.role === 'admin' ? 'admin' : 'user' }, { new: true }).select('-password'));
});
router.delete('/users/:id', async (req, res) => {
  if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot delete yourself' });
  await User.findByIdAndDelete(req.params.id); res.json({ ok: true });
});
router.get('/messages', async (req, res) => res.json(await Message.find().sort({ createdAt: -1 })));
router.put('/messages/:id/read', async (req, res) => res.json(await Message.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true })));
router.delete('/messages/:id', async (req, res) => { await Message.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
module.exports = router;
