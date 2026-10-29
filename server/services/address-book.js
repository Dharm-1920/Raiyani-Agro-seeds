const { Types } = require('mongoose');
const { User } = require('../models');
const { normalizePhone } = require('./identity');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function formatAddress(address) {
  return [address.line1, address.line2, address.landmark, [address.city, address.state, address.postalCode].filter(Boolean).join(', ')].filter(Boolean).join('\n');
}
function shippingOf(address) { return { name: address.name, phone: address.phone, address: formatAddress(address) }; }
function bookFor(user) {
  const source = user.deliveryAddresses === undefined
    ? user.address?.trim() ? [{ _id: user._id, label: 'Home', name: user.name, phone: user.phone || '', line1: user.address, line2: '', landmark: '', city: '', state: '', postalCode: '' }] : []
    : user.deliveryAddresses;
  const addresses = source.map(row => {
    const value = row.toObject ? row.toObject() : row;
    return { ...value, _id: String(value._id) };
  });
  const defaultId = addresses.find(a => a._id === String(user.defaultDeliveryAddressId))?._id || addresses[0]?._id || null;
  return { accountId: String(user._id), addresses, defaultId, version: user.addressBookVersion || 0 };
}
function validateAddress(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Enter valid delivery details.');
  const address = {};
  for (const [key, limit] of Object.entries({ label: 40, name: 120, phone: 40, line1: 1000, line2: 200, landmark: 150, city: 100, state: 100, postalCode: 6 })) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw fail('Check the address fields and their lengths.');
    address[key] = value.trim();
  }
  if (!address.name || !address.line1 || !address.city || !address.state || !/^[1-9]\d{5}$/.test(address.postalCode)) throw fail('Enter a name, street address, city, state and valid 6-digit PIN code.');
  address.phone = normalizePhone(address.phone);
  if (!address.phone) throw fail('Enter a valid delivery phone number.');
  address.label ||= 'Other';
  if (formatAddress(address).length > 1000) throw fail('Keep the complete delivery address within 1000 characters.');
  return address;
}
async function changeBook(user, body, action, id) {
  if (String(body.accountId) !== String(user._id)) throw fail('Your account changed. Reload your addresses.', 403);
  const book = bookFor(user);
  if (!Number.isSafeInteger(body.version) || body.version < 0) throw fail('Reload your addresses before saving.', 400);
  if (body.version !== book.version) throw fail('Your addresses changed. Refresh and try again.', 409);
  let addresses = book.addresses, defaultId = book.defaultId;
  if (action === 'create') {
    if (addresses.length >= 20) throw fail('You can save up to 20 addresses.');
    const address = { ...validateAddress(body.address), _id: new Types.ObjectId().toString() };
    addresses = [...addresses, address];
    if (!defaultId || body.makeDefault === true) defaultId = address._id;
  } else {
    const current = addresses.find(a => a._id === id);
    if (!current) throw fail('Address not found.', 404);
    if (action === 'update') {
      addresses = addresses.map(a => a._id === id ? { ...validateAddress(body.address), _id: id } : a);
      if (body.makeDefault === true) defaultId = id;
    } else if (action === 'default') defaultId = id;
    else if (action === 'delete') {
      addresses = addresses.filter(a => a._id !== id);
      if (defaultId === id) defaultId = addresses[0]?._id || null;
    } else throw fail('Invalid address action.');
  }
  const filter = { _id: user._id, ...(book.version === 0 ? { $or: [{ addressBookVersion: 0 }, { addressBookVersion: { $exists: false } }] } : { addressBookVersion: book.version }) };
  const result = await User.updateOne(filter, { $set: { deliveryAddresses: addresses, defaultDeliveryAddressId: defaultId,
    address: addresses.length ? formatAddress(addresses.find(a => a._id === defaultId)) : '', addressBookVersion: book.version + 1 } });
  if (result.matchedCount !== 1) throw fail('Your addresses changed. Refresh and try again.', 409);
  return { ...book, addresses, defaultId, version: book.version + 1 };
}
module.exports = { bookFor, validateAddress, formatAddress, shippingOf, changeBook };
