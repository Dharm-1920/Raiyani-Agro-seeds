const router = require('express').Router();
const { CounterBill, Expense, JournalEntry, Purchase, SupplierPayment, DayClose, Order } = require('../models');
const { protect, adminOnly } = require('../middleware');
const books = require('../services/bookkeeping');
const purchases = require('../services/purchases');
const register = require('../services/daily-register');
const notices = require('../services/notifications');
router.use(protect, adminOnly);
const failure = (error, res, next) => error.status ? res.status(error.status).json({ message: error.message }) : next(error);
async function loadBooks(range) {
  const [bills, expenses, manual, purchaseList, supplierPayments, orders] = await Promise.all([
    CounterBill.find().select('shipping items createdAt totalAmount paidCents payments paymentStatus paymentMethod user').lean(),
    Expense.find().lean(), JournalEntry.find().lean(), Purchase.find().lean(), SupplierPayment.find().lean(),
    range.start && range.end ? Order.find({ createdAt: { $gte: range.start, $lt: range.end } }).select('totalAmount orderStatus').lean() : [],
  ]);
  return { bills, expenses, manual, purchases: purchaseList, supplierPayments, orders };
}
const dateOf = query => typeof query.date === 'string' && query.date ? query.date : purchases.indiaToday();
router.get('/', async (req, res, next) => {
  try {
    const date = dateOf(req.query), range = books.dateRange(date, date);
    const [data, dayClose] = await Promise.all([loadBooks(range), DayClose.findOne({ date }).lean()]);
    res.set('Cache-Control', 'private, no-store').json({ date, ...register.dailyRegister(data, range), dayClose, gstRates: purchases.GST_RATES, expenseCategories: books.categories });
  } catch (error) { failure(error, res, next); }
});
router.get('/export', async (req, res, next) => {
  try {
    const range = books.dateRange(req.query.from, req.query.to);
    if (!range.start || !range.end || range.end - range.start > 366 * 86400000) return res.status(400).json({ message: 'Choose a date range of up to one year.' });
    const rows = register.registerRows(await loadBooks(range), range);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="daily-register-${req.query.from}-to-${req.query.to}.csv"`, 'Cache-Control': 'private, no-store' }).send(register.registerCsv(rows));
  } catch (error) { failure(error, res, next); }
});
router.post('/purchases', async (req, res, next) => {
  try {
    const { purchase, created } = await purchases.savePurchase(purchases.preparePurchase(req.body), req.user._id);
    if (created && purchase.stockApplied) for (const [id] of purchases.stockChanges(purchase.items)) await notices.safely(() => notices.notifyRestockedProduct(id));
    res.status(created ? 201 : 200).json(purchase);
  } catch (error) { failure(error, res, next); }
});
router.post('/purchases/:id/void', async (req, res, next) => {
  try { res.json(await purchases.voidPurchase(req.params.id, req.body, req.user._id)); } catch (error) { failure(error, res, next); }
});
router.post('/supplier-payments', async (req, res, next) => {
  try { const { payment, created } = await purchases.saveSupplierPayment(purchases.prepareSupplierPayment(req.body), req.user._id); res.status(created ? 201 : 200).json(payment); }
  catch (error) { failure(error, res, next); }
});
router.post('/supplier-payments/:id/void', async (req, res, next) => {
  try { res.json(await purchases.voidEntry(SupplierPayment, req.params.id, req.body, req.user._id)); } catch (error) { failure(error, res, next); }
});
router.post('/expenses/:id/void', async (req, res, next) => {
  try { res.json(await purchases.voidEntry(Expense, req.params.id, req.body, req.user._id)); } catch (error) { failure(error, res, next); }
});
router.get('/suppliers', async (req, res, next) => {
  try {
    const [purchaseList, payments] = await Promise.all([Purchase.find().lean(), SupplierPayment.find().lean()]);
    const suppliers = purchases.supplierBalances(purchaseList, payments);
    const key = typeof req.query.supplier === 'string' ? purchases.supplierKey(req.query.supplier) : '';
    res.set('Cache-Control', 'private, no-store').json({ suppliers, ...(key ? { statement: purchases.supplierStatement(key, purchaseList, payments) } : {}) });
  } catch (error) { failure(error, res, next); }
});
// Day close: record the cash actually counted in the drawer against what the books expect.
router.put('/day-close', async (req, res, next) => {
  try {
    const date = String(req.body?.date || ''), range = books.dateRange(date, date);
    if (!range.start) return res.status(400).json({ message: 'Choose a valid date.' });
    const countedCashCents = Math.round(require('../services/counter-bills').decimal(String(req.body.countedCash ?? ''), 2, 1e10, 'Enter the counted cash amount.') * 100);
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 250) : '';
    const { cash } = register.dailyRegister(await loadBooks(range), range);
    const saved = await DayClose.findOneAndUpdate({ date }, { $set: { countedCashCents, expectedCashCents: cash.closingCents, note, closedBy: req.user._id, closedByName: req.user.name || '' } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    res.json(saved);
  } catch (error) { failure(error, res, next); }
});
module.exports = router;
