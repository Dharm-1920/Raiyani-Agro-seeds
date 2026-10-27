const router = require('express').Router();
const { isValidObjectId } = require('mongoose');
const { protect } = require('../middleware');
const { Notification, StockSubscription, Product, Message } = require('../models');
const { notifyRestockedProduct, safely } = require('../services/notifications');
router.use(protect);
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.body.accountId && String(req.body.accountId) !== String(req.user._id)) return res.status(403).json({ message: 'Your account changed. Please try again.' });
  next();
});
const handle = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.get('/', handle(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const user = req.user._id;
  const [items, total, unread, subscriptions, orders, messages] = await Promise.all([
    Notification.find({ user }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 30).limit(30),
    Notification.countDocuments({ user }), Notification.countDocuments({ user, isRead: false }),
    StockSubscription.distinct('product', { user, active: true }),
    req.user.role === 'admin' ? Notification.countDocuments({ user, isRead: false, type: 'purchase' }) : 0,
    req.user.role === 'admin' ? Message.countDocuments({ isRead: false }) : 0,
  ]);
  res.set('Cache-Control', 'private, no-store').json({ items, unread, subscriptions, menuCounts: { Orders: orders, Messages: messages }, pages: Math.ceil(total / 30), page });
}));
router.put('/read-purchases', handle(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  const ids = req.body.orderIds;
  if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'string' || !isValidObjectId(id))) return res.status(400).json({ message: 'Invalid order IDs' });
  // Only orders actually loaded by this admin are marked read. New arrivals stay unread.
  await Notification.updateMany({ user: req.user._id, isRead: false, type: 'purchase', eventKey: { $in: ids.map(id => `purchase:${id}`) } }, { $set: { isRead: true } });
  res.json({ ok: true });
}));
router.put('/read-all', handle(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, isRead: false }, { $set: { isRead: true } });
  res.json({ ok: true });
}));
router.put('/:id/read', handle(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification ID' });
  const item = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $set: { isRead: true } }, { new: true });
  if (!item) return res.status(404).json({ message: 'Notification not found' });
  res.json(item);
}));
router.post('/subscriptions/:id', handle(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID' });
  const p = await Product.findOne({ _id: req.params.id, isActive: true, isDeleted: { $ne: true } });
  if (!p) return res.status(404).json({ message: 'Product not found' });
  if (p.stock > 0) return res.status(409).json({ message: 'This product is already in stock. Refresh the shop to order it.' });
  const filter = { user: req.user._id, product: p._id, active: true };
  try { await StockSubscription.updateOne(filter, { $setOnInsert: filter }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  // Covers a restock that happened between checking stock and saving the request.
  await safely(() => notifyRestockedProduct(p._id));
  res.status(201).json({ ok: true });
}));
router.delete('/subscriptions/:id', handle(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID' });
  await StockSubscription.updateMany({ user: req.user._id, product: req.params.id, active: true }, { $set: { active: false } });
  res.json({ ok: true });
}));
module.exports = router;
