const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ProductImage } = require('../models');
const { storeImages } = require('../services/product-images');
let images, failAt, server, base;
ProductImage.create = async image => { if (images.length === failAt) throw Error('Storage unavailable'); images.push(image); };
ProductImage.deleteMany = async query => { images = images.filter(image => !query.filename.$in.includes(image.filename)); };
ProductImage.findOne = async query => images.find(image => image.filename === query.filename);
beforeEach(() => { images = []; failAt = -1; });
before(async () => {
  const app = express();
  app.use('/uploads', require('../routes/images'));
  app.use('/uploads', (req, res) => res.sendStatus(404));
  app.use(require('../frontend')());
  app.use((req, res) => res.sendStatus(404));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());
test('cloud uploads preserve image bytes and return persistent URLs without local files', async () => {
  const bytes = Buffer.from([137, 80, 78, 71]);
  const urls = await storeImages([{ mimetype: 'image/png', buffer: bytes }]);
  assert.equal(urls.length, 1); assert.match(urls[0], /^\/uploads\/[\da-f-]+\.png$/);
  assert.deepEqual(images[0].data, bytes);
  const response = await fetch(base + urls[0]);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});
test('a partially failed cloud upload removes its newly stored images', async () => {
  failAt = 1;
  await assert.rejects(storeImages([{ mimetype: 'image/png', buffer: Buffer.from('first') }, { mimetype: 'image/png', buffer: Buffer.from('second') }]));
  assert.equal(images.length, 0);
});
test('oversized or unsupported images cannot be saved in cloud storage', async () => {
  await assert.rejects(storeImages([{ mimetype: 'image/svg+xml', buffer: Buffer.from('<svg/>') }]));
  await assert.rejects(storeImages([{ mimetype: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }]));
  assert.equal(images.length, 0);
});
test('local disk upload URLs continue working without database writes', async () => {
  assert.deepEqual(await storeImages([{ filename: 'existing-photo.jpg' }]), ['/uploads/existing-photo.jpg']);
  assert.equal(images.length, 0);
});
test('missing product images return 404 instead of the storefront HTML', async () => {
  assert.equal((await fetch(base + '/uploads/missing.jpg')).status, 404);
});
test('opening or refreshing a storefront route serves the built application', async () => {
  for (const route of ['/', '/shop', '/account', '/product/example', '/notifications']) {
    const response = await fetch(base + route, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200); assert.match(await response.text(), /id="root"/);
    assert.match(response.headers.get('cache-control'), /no-cache/);
  }
  assert.equal((await fetch(base + '/assets/nonexistent.js')).status, 404);
});
