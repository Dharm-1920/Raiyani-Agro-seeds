const router = require('express').Router();
const { isValidObjectId } = require('mongoose');
const { CounterCustomer, CounterBill } = require('../models');
const { protect, adminOnly } = require('../middleware');
const service = require('../services/counter-customers');
const books = require('../services/bookkeeping');
const accountBook = require('../services/account-book');
router.use(protect, adminOnly);
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
const failure = (error, res, next) => error.status ? res.status(error.status).json({ message: error.message }) : error.code === 11000 ? res.status(409).json({ message: 'A customer with this phone number is already saved.' }) : next(error);
router.get('/', async (req, res, next) => {
  try {
    const term = String(req.query.search || '').trim().slice(0, 120), escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const phone = term.replace(/[\s().-]/g, '').replace(/[^\d+]/g, '');
    const query = term ? { $or: [{ name: new RegExp(escaped, 'i') }, ...(phone ? [{ phone: new RegExp(phone.replace(/\+/g, '\\+')) }] : [])] } : {};
    const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1)), limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 25));
    const [items, total] = await Promise.all([CounterCustomer.find(query).sort({ updatedAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit), CounterCustomer.countDocuments(query)]);
    res.json({ items: items.map(service.publicCustomer), total, page, limit });
  } catch (error) { failure(error, res, next); }
});
router.post('/', async (req, res, next) => {
  try { const result = await service.createCustomer(req.body, req.user._id); res.status(result.created ? 201 : 200).json(result.customer); }
  catch (error) { failure(error, res, next); }
});
router.use('/:id', (req, res, next) => isValidObjectId(req.params.id) ? next() : res.status(404).json({ message: 'Customer not found.' }));
router.get('/:id', async (req, res, next) => {
  try { const customer = await CounterCustomer.findById(req.params.id); if (!customer) return res.status(404).json({ message: 'Customer not found.' }); res.json(service.publicCustomer(customer)); }
  catch (error) { failure(error, res, next); }
});
router.put('/:id', async (req, res, next) => {
  try {
    const data = service.profile(req.body);
    if (!Number.isSafeInteger(req.body.version) || req.body.version < 0) return res.status(400).json({ message: 'Refresh the customer before editing their details.' });
    const changes = { $set: { name: data.name, address: data.address, preferredLanguage: data.preferredLanguage, updatedBy: req.user._id, ...(data.phone ? { phone: data.phone } : {}) }, ...(!data.phone ? { $unset: { phone: 1 } } : {}), $inc: { __v: 1 } };
    const customer = await CounterCustomer.findOneAndUpdate({ _id: req.params.id, __v: req.body.version }, changes, { new: true, runValidators: true });
    if (!customer) return res.status(409).json({ message: 'Customer details changed. Refresh before editing again.' });
    res.json(service.publicCustomer(customer));
  } catch (error) { failure(error, res, next); }
});
router.get('/:id/statement', async (req, res, next) => {
  try {
    const range = books.dateRange(req.query.from, req.query.to), customer = await CounterCustomer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found.' });
    const bills = await CounterBill.find({ counterCustomer: req.params.id }).lean();
    const statement = accountBook.customerStatement(bills, range);
    res.set('Cache-Control', 'private, no-store');
    if (req.query.format === 'csv') return res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="customer-statement.csv"' }).send(accountBook.ledgerCsv(statement));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    res.json({ ...statement, rows: statement.rows.slice((page - 1) * 50, page * 50), totalRows: statement.rows.length, page, customer: service.publicCustomer(customer) });
  } catch (error) { failure(error, res, next); }
});
module.exports = router;
