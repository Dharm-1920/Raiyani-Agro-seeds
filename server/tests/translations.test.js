const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Product, User } = require('../models');
require('../services/notifications').notifyRestockedProduct = async () => {};
const { translateText, gujaratiFields, splitText } = require('../services/translation');
const originalFetch = global.fetch;
let server, base, stored, saved, calls, unavailable;
const admin = '000000000000000000000001';
const customer = '000000000000000000000002';
const productId = '000000000000000000000020';
User.findById = id => ({ select: async () => ({ _id: id, role: id === admin ? 'admin' : 'user' }) });
Product.create = async data => { saved = data; return data; };
Product.findById = async () => stored;
before(async () => {
  process.env.JWT_SECRET = 'product-translation-test';
  global.fetch = async url => {
    calls.push(new URL(url));
    if (unavailable) throw new Error('Provider unavailable');
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'ગુજરાતી અનુવાદ &amp; બીજ' } }) };
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.cookies = {}; next(); });
  app.use('/products', require('../routes/products'));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(() => {
  calls = []; unavailable = false; saved = null;
  stored = { _id: productId, name: 'Existing seed', nameGu: 'જૂનાં બીજ', description: 'Previous description', descriptionGu: 'જૂનું વર્ણન', category: 'Seeds', categoryGu: 'બીજ', unit: 'pack', unitGu: 'પેક', price: 10, save: async () => { saved = stored; } };
});
after(() => { global.fetch = originalFetch; server.close(); });
function request(path, id = admin, body = {}, method = 'POST') {
  return originalFetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(id ? { Authorization: 'Bearer ' + jwt.sign({ id }, process.env.JWT_SECRET) } : {}) }, body: JSON.stringify(body) });
}
test('existing names, units and multiline descriptions translate without network requests', async () => {
  assert.equal(await translateText('AGRICULTURAL PUMP'), 'કૃષિ પંપ');
  assert.equal(await translateText('16L-Capacity'), '૧૬ લિટર ક્ષમતા');
  assert.equal(await translateText('High Pressure\r\nHgh Efficiency\r\nRobust Construction'), 'ઊંચું દબાણ\nઉચ્ચ કાર્યક્ષમતા\nમજબૂત બનાવટ');
  assert.equal(calls.length, 0);
});
test('long UTF-8 input is split below the provider byte limit', () => {
  const parts = splitText(('Garden ગુજરાતી ' + 'x'.repeat(700) + '\n').repeat(3));
  assert.ok(parts.length > 3);
  assert.ok(parts.every(part => Buffer.byteLength(part, 'utf8') <= 450));
  assert.equal(parts.join('').replace(/\s/g, ''), ('Garden ગુજરાતી ' + 'x'.repeat(700) + '\n').repeat(3).replace(/\s/g, ''));
});
test('remote translations use Gujarati and decode entities; repeated text is cached', async () => {
  assert.equal(await translateText('A future garden variety'), 'ગુજરાતી અનુવાદ & બીજ');
  assert.equal(await translateText('A future garden variety'), 'ગુજરાતી અનુવાદ & બીજ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('langpair'), 'en|gu');
});
test('quota responses and untranslated English are rejected', async () => {
  for (const result of [{ responseStatus: 429, responseData: { translatedText: 'ગુજરાતી' } }, { responseStatus: 200, responseData: { translatedText: 'English only' } }]) {
    await assert.rejects(translateText('Quota check ' + result.responseStatus, { fetcher: async () => ({ ok: true, json: async () => result }) }), error => error.status === 503);
  }
});
test('translation preview requires administrator authorization', async () => {
  assert.equal((await request('/products/translate', null, { name: 'Seeds' })).status, 401);
  assert.equal((await request('/products/translate', customer, { name: 'Seeds' })).status, 403);
  const response = await request('/products/translate', admin, { name: 'MUNG', category: 'Seeds', unit: 'pack' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).nameGu, 'મગ');
});
test('new products receive translations and the default pack unit before saving', async () => {
  const response = await request('/products', admin, { name: 'New garden seed QA', category: 'Seeds', description: 'New growing notes QA', price: 99 });
  assert.equal(response.status, 201);
  assert.equal(saved.nameGu, 'ગુજરાતી અનુવાદ & બીજ');
  assert.equal(saved.descriptionGu, 'ગુજરાતી અનુવાદ & બીજ');
  assert.equal(saved.unitGu, 'પેક');
  assert.equal(saved.name, 'New garden seed QA');
});
test('failed automatic translation does not create or partially update a product', async () => {
  unavailable = true;
  assert.equal((await request('/products', admin, { name: 'Unavailable new product QA', category: 'Seeds', price: 10 })).status, 503);
  assert.equal(saved, null);
  assert.equal((await request('/products/' + productId, admin, { description: 'Unavailable changed description QA' }, 'PUT')).status, 503);
  assert.equal(stored.description, 'Previous description');
  assert.equal(stored.descriptionGu, 'જૂનું વર્ણન');
  assert.equal(saved, null);
});
test('manual Gujarati text works offline and survives stock or price changes', async () => {
  unavailable = true;
  const response = await request('/products', admin, { name: 'Manual brand QA', nameGu: 'પસંદ કરેલું નામ', description: 'Manual notes QA', descriptionGu: 'મારી વિગતો', category: 'Seeds', categoryGu: 'બીજ', unit: 'pack', unitGu: 'પેક', price: 12 });
  assert.equal(response.status, 201);
  assert.equal(saved.nameGu, 'પસંદ કરેલું નામ');
  assert.equal((await request('/products/' + productId, admin, { price: 20 }, 'PUT')).status, 200);
  assert.equal(stored.nameGu, 'જૂનાં બીજ');
  assert.equal(stored.price, 20);
  assert.equal(calls.length, 0);
});
test('changed English descriptions regenerate Gujarati while unchanged manual text is kept', async () => {
  await gujaratiFields({ name: stored.name }, stored);
  assert.equal(calls.length, 0);
  const response = await request('/products/' + productId, admin, { description: 'Changed growing instructions QA' }, 'PUT');
  assert.equal(response.status, 200);
  assert.equal(stored.descriptionGu, 'ગુજરાતી અનુવાદ & બીજ');
  assert.equal(stored.nameGu, 'જૂનાં બીજ');
});
