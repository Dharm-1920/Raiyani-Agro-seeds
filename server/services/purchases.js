const crypto = require('crypto');
const mongoose = require('mongoose');
const { Purchase, SupplierPayment, Product } = require('../models');
const books = require('./bookkeeping');
const { decimal, invalid } = require('./counter-bills');
const GST_RATES = [0, 5, 12, 18, 28];
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const indiaToday = (now = new Date()) => new Date(now.valueOf() + 19800000).toISOString().slice(0, 10);
// Suppliers are matched by name, ignoring case and extra spaces.
const supplierKey = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
function str(value, maximum, required, message) {
  if (value == null || value === '') { if (required) invalid(message); return ''; }
  if (typeof value !== 'string') invalid(message);
  const result = value.trim().replace(/\s+/g, ' ');
  if (result.length > maximum || (required && !result) || /[\u0000-\u001f]/.test(result)) invalid(message);
  return result;
}
const paise = (value, message, maximum = 1e10) => Math.round(decimal(value === '' || value == null ? '0' : String(value), 2, maximum, message) * 100);
const dayStart = date => books.dateRange(date, date).start;
function supplierFields(body) {
  const name = str(body.supplierName, 120, true, 'Enter the supplier name.');
  const phone = str(body.supplierPhone, 20, false, 'Enter a valid supplier phone number.');
  if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) invalid('Enter a valid supplier phone number.');
  return { name, phone };
}
function preparePurchase(body = {}, now = new Date()) {
  const supplier = supplierFields(body);
  const gstin = str(body.gstin, 15, false, 'GSTIN must be 15 letters and numbers.').toUpperCase();
  if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) invalid('GSTIN must be 15 letters and numbers.');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) invalid('Add between 1 and 50 items to the purchase.');
  const items = body.items.map(item => {
    const product = item?.product ? String(item.product) : null;
    if (product && !mongoose.isValidObjectId(product)) invalid('Choose a valid product.');
    const qty = decimal(String(item?.qty ?? ''), 3, 1000000, 'Enter a valid quantity for every item.');
    if (qty <= 0) invalid('Enter a valid quantity for every item.');
    const rateCents = paise(item.rate ?? '', 'Enter a valid rate for every item.', 1e8);
    const gstPercent = Number(item.gstPercent || 0);
    if (!GST_RATES.includes(gstPercent)) invalid('Choose a GST rate of 0, 5, 12, 18 or 28%.');
    const amountCents = Math.round(qty * rateCents);
    return { product, name: str(item.name, 120, true, 'Enter a name for every item.'), unit: str(item.unit, 30, false, 'Enter a shorter unit.'), qty, rateCents, gstPercent, amountCents, taxCents: Math.round(amountCents * gstPercent / 100) };
  });
  const subtotalCents = items.reduce((sum, item) => sum + item.amountCents, 0), taxCents = items.reduce((sum, item) => sum + item.taxCents, 0);
  const otherChargesCents = paise(body.otherCharges, 'Enter valid freight or other charges.');
  const totalCents = subtotalCents + taxCents + otherChargesCents;
  if (totalCents <= 0) invalid('The purchase total must be above zero.');
  const paidCents = paise(body.paid, 'Enter a valid paid amount.');
  if (paidCents > totalCents) invalid('Paid amount cannot be more than the bill total.');
  if (paidCents > 0 && !['cash', 'upi'].includes(body.method)) invalid('Choose whether you paid in cash or by bank / UPI.');
  const data = { supplier: { ...supplier, gstin }, supplierKey: supplierKey(supplier.name), billNumber: str(body.billNumber, 40, false, 'Enter a shorter bill number.'),
    occurredAt: dayStart(body.date || indiaToday(now)), items, subtotalCents, taxCents, otherChargesCents, totalCents, paidCents,
    paymentMethod: paidCents > 0 ? body.method : 'credit', addToStock: body.addToStock !== false && items.some(item => item.product), note: str(body.note, 250, false, 'Enter a shorter note.') };
  return { ...data, requestKey: books.key(body.requestKey), requestHash: hash(data) };
}
function sameRequest(saved, data, user, label) {
  if (!saved || String(saved.user) !== String(user) || saved.requestHash !== data.requestHash) fail(`This request already saved a different ${label}.`);
  return saved;
}
// Merge lines per product in thousandths so 0.1 + 0.2 kg stays exact.
function stockChanges(items) {
  const quantities = new Map();
  for (const item of items) if (item.product) quantities.set(String(item.product), (quantities.get(String(item.product)) || 0) + Math.round(item.qty * 1000));
  return [...quantities].sort(([a], [b]) => a.localeCompare(b));
}
async function savePurchase(data, user) {
  const existing = await Purchase.findOne({ requestKey: data.requestKey });
  if (existing) return { purchase: sameRequest(existing, data, user, 'purchase'), created: false };
  try {
    if (!data.addToStock) return { purchase: (await Purchase.create([{ ...data, user }]))[0], created: true };
    // The purchase and its stock increase commit together, so a retry can never add stock twice.
    return await mongoose.connection.transaction(async session => {
      const again = await Purchase.findOne({ requestKey: data.requestKey }).session(session);
      if (again) return { purchase: again, created: false };
      for (const [id, thousandths] of stockChanges(data.items)) {
        const product = await Product.findOneAndUpdate({ _id: id, isDeleted: { $ne: true } }, { $inc: { stock: thousandths / 1000 } }, { new: true, session });
        if (!product) fail('A product on this bill was removed from the catalogue. Choose it again or enter it as another item.');
      }
      const [purchase] = await Purchase.create([{ ...data, user, stockApplied: true }], { session });
      return { purchase, created: true };
    }, { readPreference: 'primary' });
  } catch (error) {
    if (error.code === 11000) { const saved = await Purchase.findOne({ requestKey: data.requestKey }); if (saved) return { purchase: sameRequest(saved, data, user, 'purchase'), created: false }; }
    if (error.status) throw error;
    fail('The purchase could not be confirmed. Retry the same entry safely.', 503);
  }
}
const voidReason = reason => str(reason, 200, true, 'Give a short reason for cancelling this entry.');
const voided = (reason, user) => ({ voidedAt: new Date(), voidReason: reason, voidedBy: user });
async function voidPurchase(id, body, user) {
  const reason = voidReason(body?.reason);
  if (!mongoose.isValidObjectId(id)) fail('Entry not found.', 404);
  const purchase = await Purchase.findById(id);
  if (!purchase) fail('Entry not found.', 404);
  if (purchase.voidedAt) return purchase;
  if (!purchase.stockApplied) return (await Purchase.findOneAndUpdate({ _id: id, voidedAt: null }, { $set: voided(reason, user) }, { new: true })) || Purchase.findById(id);
  try {
    return await mongoose.connection.transaction(async session => {
      const current = await Purchase.findOne({ _id: id, voidedAt: null }).session(session);
      if (!current) return Purchase.findById(id).session(session);
      for (const [productId, thousandths] of stockChanges(current.items)) {
        const product = await Product.findOneAndUpdate({ _id: productId, stock: { $gte: thousandths / 1000 } }, { $inc: { stock: -thousandths / 1000 } }, { new: true, session });
        if (!product) fail('Some of this stock is already sold. Correct the stock in Products first, then cancel this purchase.');
      }
      return Purchase.findOneAndUpdate({ _id: id }, { $set: { ...voided(reason, user), stockReversed: true } }, { new: true, session });
    }, { readPreference: 'primary' });
  } catch (error) { if (error.status) throw error; fail('The cancellation could not be confirmed. Please retry.', 503); }
}
function prepareSupplierPayment(body = {}, now = new Date()) {
  const supplier = supplierFields(body);
  const amountCents = paise(body.amount, 'Enter a valid payment amount.');
  if (amountCents <= 0) invalid('Payment amount must be above zero.');
  if (!['cash', 'upi'].includes(body.method)) invalid('Choose whether you paid in cash or by bank / UPI.');
  const data = { supplier, supplierKey: supplierKey(supplier.name), amountCents, method: body.method, occurredAt: dayStart(body.date || indiaToday(now)), note: str(body.note, 250, false, 'Enter a shorter note.') };
  return { ...data, requestKey: books.key(body.requestKey), requestHash: hash(data) };
}
async function saveSupplierPayment(data, user) {
  let saved = await SupplierPayment.findOne({ requestKey: data.requestKey }), created = false;
  if (!saved) {
    try { saved = await SupplierPayment.create({ ...data, user }); created = true; }
    catch (error) { if (error.code !== 11000) throw error; saved = await SupplierPayment.findOne({ requestKey: data.requestKey }); }
  }
  return { payment: sameRequest(saved, data, user, 'supplier payment'), created };
}
// Simple cancellation for entries with no stock effect (supplier payments, expenses).
async function voidEntry(Model, id, body, user) {
  const reason = voidReason(body?.reason);
  if (!mongoose.isValidObjectId(id)) fail('Entry not found.', 404);
  const updated = await Model.findOneAndUpdate({ _id: id, voidedAt: null }, { $set: voided(reason, user) }, { new: true });
  if (updated) return updated;
  const existing = await Model.findById(id);
  if (!existing) fail('Entry not found.', 404);
  return existing;
}
// Running balance per supplier: bills raise what you owe, payments reduce it.
function supplierBalances(purchases, payments) {
  const map = new Map();
  const get = (key, supplier) => { if (!map.has(key)) map.set(key, { key, name: supplier.name, phone: supplier.phone || '', billedCents: 0, paidCents: 0, bills: 0, lastAt: null }); const s = map.get(key); if (supplier.phone) s.phone = supplier.phone; return s; };
  for (const p of purchases) if (!p.voidedAt) { const s = get(p.supplierKey, p.supplier); s.billedCents += p.totalCents; s.paidCents += p.paidCents || 0; s.bills++; if (!s.lastAt || p.occurredAt > s.lastAt) { s.lastAt = p.occurredAt; s.name = p.supplier.name; } }
  for (const pay of payments) if (!pay.voidedAt) { const s = get(pay.supplierKey, pay.supplier); s.paidCents += pay.amountCents; if (!s.lastAt || pay.occurredAt > s.lastAt) s.lastAt = pay.occurredAt; }
  return [...map.values()].map(s => ({ ...s, dueCents: s.billedCents - s.paidCents })).sort((a, b) => b.dueCents - a.dueCents || a.name.localeCompare(b.name));
}
function supplierStatement(key, purchases, payments) {
  const rows = [];
  for (const p of purchases) if (p.supplierKey === key) {
    const reference = 'PU-' + String(p._id).toUpperCase();
    rows.push({ id: 'purchase-' + p._id, date: p.occurredAt, reference, description: 'Purchase' + (p.billNumber ? ' · bill ' + p.billNumber : ''), billCents: p.totalCents, paidCents: 0, voided: Boolean(p.voidedAt), order: 0 });
    if (p.paidCents) rows.push({ id: 'purchase-paid-' + p._id, date: p.occurredAt, reference, description: 'Paid with bill · ' + (p.paymentMethod === 'upi' ? 'Bank / UPI' : 'Cash'), billCents: 0, paidCents: p.paidCents, voided: Boolean(p.voidedAt), order: 1 });
  }
  for (const pay of payments) if (pay.supplierKey === key) rows.push({ id: 'supplier-payment-' + pay._id, date: pay.occurredAt, reference: 'SP-' + String(pay._id).toUpperCase(), description: (pay.note || 'Payment') + ' · ' + (pay.method === 'upi' ? 'Bank / UPI' : 'Cash'), billCents: 0, paidCents: pay.amountCents, voided: Boolean(pay.voidedAt), order: 2 });
  rows.sort((a, b) => new Date(a.date) - new Date(b.date) || a.order - b.order || a.id.localeCompare(b.id));
  let balanceCents = 0;
  return rows.map(row => { if (!row.voided) balanceCents += row.billCents - row.paidCents; return { ...row, balanceCents }; });
}
module.exports = { GST_RATES, supplierKey, indiaToday, preparePurchase, savePurchase, voidPurchase, prepareSupplierPayment, saveSupplierPayment, voidEntry, supplierBalances, supplierStatement, stockChanges };
