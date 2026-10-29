const crypto = require('crypto');
const { normalizePhone } = require('./identity');

function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
function text(value, maximum, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') invalid('Enter valid customer and item details.');
  const result = value.trim();
  if (result.length > maximum || (required && !result) || /[\u0000-\u001f]/.test(result)) invalid('Enter valid customer and item details.');
  return result;
}
function decimal(value, places, maximum, label) {
  if (!['string', 'number'].includes(typeof value) || !new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(String(value))) invalid(label);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) invalid(label);
  return number;
}
function prepareBill(body) {
  const requestKey = text(body.requestKey, 80, true);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) invalid('A valid bill request key is required. Reload the billing page.');
  const name = text(body.customer?.name, 120, true);
  const rawPhone = text(body.customer?.phone, 40);
  const phone = rawPhone ? normalizePhone(rawPhone) : '';
  if (rawPhone && !phone) invalid('Enter a valid customer phone number.');
  if (body.invoiceWhatsApp !== undefined && typeof body.invoiceWhatsApp !== 'boolean') invalid('Choose whether the customer wants a WhatsApp bill.');
  if (body.invoiceWhatsApp && !phone) invalid('Enter the customer WhatsApp number before sharing a bill.');
  if (!['cash', 'upi', 'card', 'later'].includes(body.paymentMethod) || !['paid', 'pending'].includes(body.paymentStatus) || (body.paymentMethod === 'later' && body.paymentStatus !== 'pending')) invalid('Choose the payment method and payment status.');
  if (body.remindersEnabled !== undefined && typeof body.remindersEnabled !== 'boolean') invalid('Choose whether the customer agrees to payment reminders.');
  if (body.remindersEnabled && (!phone || body.paymentStatus === 'paid')) invalid('Payment reminders need an unpaid bill and a valid customer phone number.');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) invalid('Add between 1 and 100 bill items.');
  let cents = 0;
  const items = body.items.map(item => {
    if (!item || typeof item !== 'object') invalid('Enter valid bill items.');
    const price = decimal(item.price, 2, 10000000, 'Use a price from 0 to 10000000 with up to two decimal places.');
    const qty = decimal(item.qty, 3, 10000, 'Use a quantity above zero and up to 10000, with up to three decimal places.');
    if (qty <= 0) invalid('Quantity must be above zero.');
    cents += Math.round(Math.round(price * 100) * qty);
    return { name: text(item.name, 220, true), nameGu: text(item.nameGu, 220), unit: text(item.unit, 30), price, qty };
  });
  const discount = decimal(body.discount ?? 0, 2, 1000000000, 'Enter a valid discount with up to two decimal places.');
  if (Math.round(discount * 100) > cents) invalid('Discount cannot exceed the items total.');
  const bill = { source: 'counter', shipping: { name, phone: phone || '', address: text(body.customer?.address, 500) }, items,
    itemsTotal: cents / 100, discount, shippingFee: 0, totalAmount: (cents - Math.round(discount * 100)) / 100,
    paymentMethod: body.paymentMethod, paymentStatus: body.paymentStatus, orderStatus: 'delivered',
    invoiceLanguage: body.invoiceLanguage === 'gu' ? 'gu' : 'en', invoicePhone: phone || '', invoiceWhatsApp: body.invoiceWhatsApp === true,
    remindersEnabled: body.remindersEnabled === true,
  };
  if (body.customerId) {
    if (typeof body.customerId !== 'string' || !require('mongoose').isValidObjectId(body.customerId)) invalid('Select a valid saved customer.');
    bill.counterCustomer = body.customerId;
  }
  return { ...bill, requestKey, requestHash: crypto.createHash('sha256').update(JSON.stringify(bill)).digest('hex') };
}
module.exports = { prepareBill, decimal, text, invalid };
