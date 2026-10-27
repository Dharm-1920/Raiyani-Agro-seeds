const router = require('express').Router();
const { Product } = require('../models');
const { protect, adminOnly, upload } = require('../middleware');
const { gujaratiFields } = require('../services/translation');
const { storeImages, removeImages } = require('../services/product-images');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Hidden inventory is visible only to an authenticated administrator.
router.get('/', (req, res, next) => req.query.all === '1' ? protect(req, res, () => adminOnly(req, res, next)) : next(), async (req, res) => {
  const { search, category, sort, page = 1, limit = 12, all } = req.query;
  const q = { isDeleted: { $ne: true }, ...(all === '1' ? {} : { isActive: true }) };
  if (search) q.$or = ['name', 'nameGu'].map(field => ({ [field]: new RegExp(esc(search), 'i') }));
  if (category) q.category = category;
  const sorts = { price_asc: { price: 1 }, price_desc: { price: -1 }, new: { createdAt: -1 } };
  const lim = Math.min(+limit || 12, 100);
  const [items, total, categories, categoryLabels] = await Promise.all([
    Product.find(q).sort(sorts[sort] || { createdAt: -1 }).skip((Math.max(+page, 1) - 1) * lim).limit(lim),
    Product.countDocuments(q),
    Product.distinct('category', { isActive: true, isDeleted: { $ne: true } }),
    Product.find({ isActive: true, isDeleted: { $ne: true } }).select('category categoryGu').lean(),
  ]);
  res.json({ items, total, pages: Math.ceil(total / lim), categories, categoryTranslations: Object.fromEntries(categoryLabels.filter(p => p.categoryGu).map(p => [p.category, p.categoryGu])) });
});
router.get('/:id', async (req, res) => {
  const p = await Product.findById(req.params.id).catch(() => null);
  p && p.isActive && !p.isDeleted ? res.json(p) : res.status(404).json({ message: 'Product not found' });
});
const fields = (b) => {
  const o = {};
  ['name', 'description', 'category', 'unit'].forEach((k) => b[k] !== undefined && (o[k] = b[k]));
  ['price', 'mrp', 'stock'].forEach((k) => b[k] !== undefined && b[k] !== '' && (o[k] = Number(b[k])));
  if (b.isActive !== undefined) o.isActive = b.isActive === true || b.isActive === 'true';
  return o;
};
router.post('/', protect, adminOnly, upload.array('images', 5), async (req, res) => {
  let images;
  try {
    const draft = new Product(fields(req.body));
    const validation = draft.validateSync();
    if (validation) return res.status(400).json({ message: validation.message });
    const data = draft.toObject();
    const gujarati = await gujaratiFields({ ...data, ...Object.fromEntries(['nameGu', 'descriptionGu', 'categoryGu', 'unitGu'].filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]])) });
    images = await storeImages(req.files);
    const p = await Product.create({ ...data, ...gujarati, images });
    res.status(201).json(p);
  } catch (error) { if (images && process.env.UPLOAD_STORAGE === 'mongodb') await removeImages(images).catch(() => {}); res.status(error.status || 400).json({ message: error.message }); }
});
router.post('/translate', protect, adminOnly, require('express-rate-limit')({ windowMs: 60000, limit: 15 }), async (req, res) => {
  try { res.json(await gujaratiFields(req.body)); }
  catch (error) { res.status(error.status || 503).json({ message: error.message }); }
});
router.put('/:id', protect, adminOnly, upload.array('images', 5), async (req, res) => {
  let images;
  try {
  const p = await Product.findById(req.params.id);
  if (!p || p.isDeleted) return res.status(404).json({ message: 'Product not found' });
  const gujarati = await gujaratiFields(req.body, p);
  Object.assign(p, fields(req.body));
  Object.assign(p, gujarati);
  if (req.files?.length) { images = await storeImages(req.files); p.images = images; }
  await p.save();
  if (p.stock > 0 && p.isActive) await require('../services/notifications').safely(() => require('../services/notifications').notifyRestockedProduct(p._id));
  res.json(p);
  } catch (error) { if (images && process.env.UPLOAD_STORAGE === 'mongodb') await removeImages(images).catch(() => {}); res.status(error.status || 400).json({ message: error.message }); }
});
// Archive removed products so existing orders retain their product references.
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    if (!require('mongoose').isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid product ID' });
    const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false, isDeleted: true }, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Could not remove the product. Please try again.' }); }
});
module.exports = router;
