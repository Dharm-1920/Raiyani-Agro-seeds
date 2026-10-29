const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const mongoose = require('mongoose');
const { Product, CounterBill } = require('../models');
const { prepareBill } = require('../services/counter-bills');
const { saveStockBill } = require('../services/counter-stock');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Opt in with COUNTER_STOCK_MONGOD=/path/to/mongod. This creates an isolated
// temporary replica set and NEVER connects to MONGO_URI or the shop's database.
test('real MongoDB transactions commit bills once, roll back failures and compete with online stock deductions', { skip: !process.env.COUNTER_STOCK_MONGOD, timeout: 45000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'raiyani-stock-test-'));
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.env.COUNTER_STOCK_MONGOD, ['--replSet', 'counterTest', '--port', String(port), '--bind_ip', '127.0.0.1', '--dbpath', directory, '--oplogSize', '64', '--wiredTigerCacheSizeGB', '0.25'], { windowsHide: true, stdio: 'ignore' });
  let spawnError; child.on('error', error => { spawnError = error; });
  const direct = new mongoose.mongo.MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 500 });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (spawnError) throw spawnError;
      try { await direct.connect(); ready = true; break; } catch { await pause(150); }
    }
    assert(ready, 'Temporary MongoDB must start');
    await direct.db('admin').command({ replSetInitiate: { _id: 'counterTest', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let attempt = 0; attempt < 80; attempt++) {
      if ((await direct.db('admin').command({ hello: 1 })).isWritablePrimary) break;
      await pause(100);
    }
    await mongoose.connect(`mongodb://127.0.0.1:${port}/counter_stock_test?replicaSet=counterTest`, { serverSelectionTimeoutMS: 5000 });
    await Promise.all([Product.init(), CounterBill.init()]);
    const product = await Product.create({ name: 'Integration seed', category: 'Seeds', unit: 'kg', price: 100, stock: 5 });
    const input = (key, qty = 2) => ({ ...prepareBill({ requestKey: key, customer: { name: 'Isolated test customer' }, items: [{ productId: String(product._id), name: product.name, price: 80, qty }], paymentMethod: 'later', paymentStatus: 'pending' }), user: new mongoose.Types.ObjectId() });
    const first = input('real-concurrent-save-123');
    const retries = await Promise.all([saveStockBill(first), saveStockBill(first)]);
    assert.equal(retries.filter(result => result.created).length, 1);
    assert.equal(await CounterBill.countDocuments(), 1);
    assert.equal((await Product.findById(product._id)).stock, 3);

    const unavailable = await Product.create({ name: 'Empty pack', category: 'Seeds', price: 10, stock: 0 });
    const failure = input('real-rollback-save-123', 1);
    failure.items.push({ product: String(unavailable._id), name: unavailable.name, qty: 1, price: 10 });
    await assert.rejects(saveStockBill(failure), error => error.status === 409);
    assert.equal((await Product.findById(product._id)).stock, 3);
    assert.equal(await CounterBill.countDocuments(), 1);

    await Product.updateOne({ _id: product._id }, { $set: { stock: 5 } });
    const competing = await Promise.allSettled([
      saveStockBill(input('real-online-race-123', 4)),
      Product.findOneAndUpdate({ _id: product._id, isActive: true, isDeleted: { $ne: true }, stock: { $gte: 4 } }, { $inc: { stock: -4 } }, { new: true }),
    ]);
    assert.equal(competing.filter(result => result.status === 'fulfilled' && result.value).length, 1);
    assert.equal((await Product.findById(product._id)).stock, 1);
  } finally {
    await mongoose.disconnect(); await direct.close();
    if (child.exitCode === null && !spawnError) { const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped; }
    const resolved = path.resolve(directory), temporaryRoot = path.resolve(os.tmpdir());
    if (path.dirname(resolved) === temporaryRoot && path.basename(resolved).startsWith('raiyani-stock-test-')) await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
