// Read-only checks against our deployed shop; never prints credentials or creates orders.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const source = dotenv.parse(fs.readFileSync(path.join(__dirname, '.env')));
const settings = dotenv.parse(fs.readFileSync(path.join(__dirname, '.env.production.local')));
const origin = new URL(process.argv[2]).origin;
if (!origin.startsWith('https://')) throw Error('Use the actual HTTPS deployment URL');
async function main() {
  const request = (pathname, options = {}) => fetch(origin + pathname, { signal: AbortSignal.timeout(45000), ...options });
  const health = await request('/api/health'); assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
  const login = await request('/api/auth/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: source.ADMIN_EMAIL, password: settings.PRODUCTION_ADMIN_PASSWORD }) });
  assert.equal(login.status, 200, 'Production administrator can sign in');
  const cookie = login.headers.getSetCookie().find(value => value.startsWith('token='));
  assert.ok(cookie); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
  const headers = { Cookie: cookie.split(';')[0] };
  const me = await request('/api/auth/me', { headers }); assert.equal(me.status, 200); assert.equal((await me.json()).user.role, 'admin');
  const products = await request('/api/products?all=1&limit=100', { headers }); assert.equal(products.status, 200);
  const catalog = await products.json(); assert.ok(catalog.items.length > 0); assert.ok(catalog.items.every(product => product.nameGu));
  const imageUrls = [...new Set(catalog.items.flatMap(product => product.images || []))].filter(url => url.startsWith('/uploads/')).slice(0, 3);
  for (const url of imageUrls) { const response = await request(url); assert.equal(response.status, 200, 'Migrated image is public'); assert.match(response.headers.get('content-type'), /^image\//); await response.arrayBuffer(); }
  for (const route of ['/shop', '/account', '/notifications']) { const response = await request(route, { headers: { Accept: 'text/html' } }); assert.equal(response.status, 200); assert.match(await response.text(), /id="root"/); }
  assert.equal((await request('/api/auth/me')).status, 401);
  assert.equal((await request('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const alerts = await request('/api/notifications', { headers }); assert.equal(alerts.status, 200); assert.equal(typeof (await alerts.json()).unread, 'number');
  const orders = await request('/api/admin/orders', { headers }); assert.equal(orders.status, 200);
  const list = await orders.json();
  if (list.length) { const invoice = await request(`/api/orders/${list[0]._id}/invoice?lang=gu`, { headers }); assert.equal(invoice.status, 200); assert.match(invoice.headers.get('content-type'), /application\/pdf/); assert.equal(Buffer.from(await invoice.arrayBuffer()).subarray(0, 5).toString(), '%PDF-'); }
  const cart = await request('/api/account/cart', { headers }); assert.equal(cart.status, 200);
  const payment = await request('/api/payments/options');
  console.log(JSON.stringify({ origin, healthy: true, secureAdminLogin: true, products: catalog.items.length, migratedImagesChecked: imageUrls.length, directRoutes: true, accountPrivacy: true, notifications: true, savedCart: true, invoices: list.length > 0, paymentOptionsStatus: payment.status }));
}
main().catch(error => { console.error('Live verification failed: ' + error.message); process.exitCode = 1; });
