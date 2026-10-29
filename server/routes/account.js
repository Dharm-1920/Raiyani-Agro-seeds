const router = require('express').Router();
const { Product, User } = require('../models');
const { protect } = require('../middleware');
router.use(protect);
router.use('/addresses', require('./addresses'));
async function expandedCart(user) {
  const lines = user.cart || [];
  const products = await Product.find({ _id: { $in: lines.map(i => i.product) }, isActive: true, isDeleted: { $ne: true } });
  return lines.flatMap(line => {
    const p = products.find(p => String(p._id) === String(line.product));
    const qty = p ? Math.min(line.qty, p.stock) : 0;
    return qty > 0 ? [{ id: p._id, name: p.name, nameGu: p.nameGu, price: p.price, image: p.images?.[0], stock: p.stock, qty }] : [];
  });
}
router.get('/cart', async (req, res) => {
  try { res.json({ accountId: String(req.user._id), items: await expandedCart(req.user) }); }
  catch { res.status(503).json({ message: 'Your cart could not be loaded. Please retry.' }); }
});
router.put('/cart', async (req, res) => {
  try {
    // Reject delayed saves from a previously signed-in account after session switching.
    if (String(req.body.accountId) !== String(req.user._id)) return res.status(403).json({ message: 'Your account changed. Please reload your cart.' });
    const items = req.body.items;
    if (!Array.isArray(items) || items.length > 100 || items.some(i => !i || !require('mongoose').isValidObjectId(i.productId) || !Number.isSafeInteger(i.qty) || i.qty < 1 || i.qty > 10000)) return res.status(400).json({ message: 'Invalid cart items' });
    const quantities = new Map();
    for (const i of items) quantities.set(i.productId, (quantities.get(i.productId) || 0) + i.qty);
    if ([...quantities.values()].some(q => q > 10000)) return res.status(400).json({ message: 'Quantity is too large' });
    const cart = [...quantities].map(([product, qty]) => ({ product, qty }));
    await User.updateOne({ _id: req.user._id }, { $set: { cart } });
    res.json({ ok: true });
  } catch { res.status(503).json({ message: 'Your cart could not be saved. Please retry.' }); }
});
module.exports = router;
