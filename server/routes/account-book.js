const router = require('express').Router();
const { CounterBill, Expense, JournalEntry } = require('../models');
const { protect, adminOnly } = require('../middleware');
const books = require('../services/bookkeeping');
const service = require('../services/account-book');
router.use(protect, adminOnly);
const failure = (error, res, next) => error.status ? res.status(error.status).json({ message: error.message }) : next(error);
async function report(query) {
  const range = books.dateRange(query.from, query.to);
  const [bills, expenses, manual] = await Promise.all([
    CounterBill.find().select('shipping createdAt totalAmount paidCents payments paymentStatus paymentMethod user').lean(),
    Expense.find().lean(), JournalEntry.find().lean(),
  ]);
  const entries = service.journalEntries(bills, expenses, manual);
  const ledger = service.accountLedger(entries, query.account || 'Cash', range);
  const dayBook = entries.filter(entry => (!range.start || new Date(entry.date) >= range.start) && (!range.end || new Date(entry.date) < range.end));
  return { ledger, dayBook };
}
router.get('/', async (req, res, next) => {
  try {
    const data = await report(req.query), page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
    res.set('Cache-Control', 'private, no-store').json({ ...data.ledger, rows: data.ledger.rows.slice((page - 1) * 50, page * 50), totalRows: data.ledger.rows.length,
      dayBook: data.dayBook.slice((page - 1) * 50, page * 50), totalDayRows: data.dayBook.length, page, accounts: service.allAccounts, manualAccounts: service.manualAccounts,
    });
  } catch (error) { failure(error, res, next); }
});
router.get('/export', async (req, res, next) => {
  try {
    const data = await report(req.query), dayBook = req.query.view === 'day';
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${dayBook ? 'day-book' : 'account-ledger'}.csv"`, 'Cache-Control': 'private, no-store' })
      .send(dayBook ? books.booksCsv(data.dayBook) : service.ledgerCsv(data.ledger));
  } catch (error) { failure(error, res, next); }
});
router.post('/entries', async (req, res, next) => {
  try {
    const data = service.prepareJournal(req.body);
    let saved = await JournalEntry.findOne({ requestKey: data.requestKey }), created = false;
    if (!saved) {
      try { saved = await JournalEntry.create({ ...data, user: req.user._id }); created = true; }
      catch (error) { if (error.code !== 11000) throw error; saved = await JournalEntry.findOne({ requestKey: data.requestKey }); }
    }
    if (!saved || String(saved.user) !== String(req.user._id) || saved.requestHash !== data.requestHash) return res.status(409).json({ message: 'This request already saved a different accounting entry.' });
    res.status(created ? 201 : 200).json(saved);
  } catch (error) { failure(error, res, next); }
});
module.exports = router;
