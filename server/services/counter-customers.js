const crypto = require('crypto');
const { CounterCustomer } = require('../models');
const { normalizePhone } = require('./identity');
const { text, invalid } = require('./counter-bills');
const { key } = require('./bookkeeping');
function profile(body = {}) {
  const rawPhone = text(body.phone, 40), phone = rawPhone ? normalizePhone(rawPhone) : undefined;
  if (rawPhone && !phone) invalid('Enter a valid customer phone number.');
  if (body.preferredLanguage !== undefined && !['en', 'gu'].includes(body.preferredLanguage)) invalid('Choose English or Gujarati.');
  return { name: text(body.name, 120, true), phone, address: text(body.address, 500), preferredLanguage: body.preferredLanguage || 'en' };
}
function publicCustomer(customer) {
  const data = customer.toObject ? customer.toObject() : customer;
  return { _id: data._id, name: data.name, phone: data.phone || '', address: data.address || '', preferredLanguage: data.preferredLanguage, __v: data.__v ?? 0, createdAt: data.createdAt, updatedAt: data.updatedAt };
}
async function createCustomer(body, user) {
  const data = profile(body), requestKey = key(body.requestKey), requestHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  let customer = await CounterCustomer.findOne({ requestKey }), created = false;
  if (!customer) {
    try { customer = await CounterCustomer.create({ ...data, requestKey, requestHash, createdBy: user }); created = true; }
    catch (error) {
      if (error.code !== 11000) throw error;
      customer = await CounterCustomer.findOne({ requestKey });
      if (!customer) throw Object.assign(new Error('A customer with this phone number is already saved. Search for and select that customer.'), { status: 409 });
    }
  }
  if (String(customer.createdBy) !== String(user) || customer.requestHash !== requestHash) throw Object.assign(new Error('This customer request already saved different details. Start a new customer.'), { status: 409 });
  return { customer: publicCustomer(customer), created };
}
module.exports = { profile, publicCustomer, createCustomer };
