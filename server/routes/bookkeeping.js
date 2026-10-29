const router = require('express').Router();
const { CounterBill, Expense } = require('../models');
const { protect, adminOnly } = require('../middleware');
const books = require('../services/bookkeeping');
const reminders = require('../services/payment-reminders');
router.use(protect, adminOnly);
async function report(query) {
  const range = books.dateRange(query.from, query.to);
  const [bills, expenses] = await Promise.all([
    CounterBill.find().select('shipping createdAt totalAmount paidCents payments paymentStatus paymentMethod remindersEnabled nextReminderAt user').lean(),
    Expense.find().lean(),
  ]);
  return books.buildBooks(bills, expenses, range);
}
router.get('/', async (req, res, next) => {
  try {
    const data = await report(req.query);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    res.json({ ...data, entries: data.entries.slice((page - 1) * 50, page * 50), totalEntries: data.entries.length, page, remindersConfigured: reminders.configured(), categories: books.categories });
  } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
});
router.get('/export', async (req, res, next) => {
  try { const data = await report(req.query); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="counter-bookkeeping.csv"', 'Cache-Control': 'private, no-store' }).send(books.booksCsv(data.entries)); }
  catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
});
router.post('/expenses', async (req, res, next) => {
  try {
    const data = books.prepareExpense(req.body);
    let saved = await Expense.findOne({ requestKey: data.requestKey }), created = false;
    if (!saved) {
      try { saved = await Expense.create({ ...data, user: req.user._id }); created = true; }
      catch (error) { if (error.code !== 11000) throw error; saved = await Expense.findOne({ requestKey: data.requestKey }); }
    }
    if (!saved || String(saved.user) !== String(req.user._id) || saved.requestHash !== data.requestHash) return res.status(409).json({ message: 'This expense request already saved a different entry.' });
    res.status(created ? 201 : 200).json(saved);
  } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
});
module.exports = router;
