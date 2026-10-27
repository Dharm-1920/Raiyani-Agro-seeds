// Connection secrets belong in the ignored .env.production.local file, never CLI arguments.
const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const sourceUri = process.env.MONGO_URI;
const settings = require('dotenv').config({ path: path.join(__dirname, '.env.production.local'), quiet: true }).parsed || {};
const { MongoClient } = require('mongoose').mongo;
const bcrypt = require('bcryptjs');
const { createHash } = require('crypto');
const collections = ['users', 'products', 'orders', 'messages', 'notifications', 'stocksubscriptions', 'productimages'];
async function main() {
  const ownerEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!sourceUri || !settings.MONGO_URI || !ownerEmail || !settings.PRODUCTION_ADMIN_PASSWORD || settings.PRODUCTION_ADMIN_PASSWORD.length < 16) throw Error('Missing migration settings');
  if (sourceUri === settings.MONGO_URI || !settings.MONGO_URI.startsWith('mongodb+srv://')) throw Error('A separate Atlas target is required');
  const options = { serverSelectionTimeoutMS: 12000, connectTimeoutMS: 10000 };
  const source = new MongoClient(sourceUri, options), target = new MongoClient(settings.MONGO_URI, options);
  try {
    await source.connect(); await target.connect();
    const from = source.db(), to = target.db();
    const fingerprint = createHash('sha256').update(sourceUri.replace(/\/\/[^@/]+@/, '//') + from.databaseName).digest('hex');
    const markers = to.collection('_shop_migration');
    const marker = await markers.findOne({ _id: 'initial-import' });
    if (marker && (marker.source !== fingerprint || marker.complete)) throw Error('This target has already been migrated or belongs to another source');
    if (!marker) {
      const existing = await to.listCollections().toArray();
      for (const collection of existing) if (await to.collection(collection.name).countDocuments()) throw Error('Target database is not empty');
      await markers.insertOne({ _id: 'initial-import', source: fingerprint, startedAt: new Date(), complete: false });
    }
    for (const name of collections) {
      let count = 0;
      for await (const document of from.collection(name).find()) {
        // Idempotent resume of an unfinished import; never overwrite target records.
        await to.collection(name).updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
        count++;
      }
      console.log(name + ': ' + count + ' records checked/copied');
    }
    const products = await from.collection('products').find({}, { projection: { images: 1 } }).toArray();
    const filenames = new Set(products.flatMap(p => p.images || []).filter(url => url.startsWith('/uploads/')).map(url => url.slice(9)));
    for (const filename of filenames) {
      if (!/^[a-zA-Z0-9._-]+$/.test(filename) || ['.', '..'].includes(filename)) throw Error('Invalid legacy image filename');
      if (await to.collection('productimages').findOne({ filename })) continue;
      const data = await fs.readFile(path.join(__dirname, 'uploads', filename));
      const contentType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(filename).toLowerCase()];
      if (!contentType || data.length > 2 * 1024 * 1024) throw Error('Unsupported legacy image');
      await to.collection('productimages').insertOne({ filename, data, contentType, createdAt: new Date(), updatedAt: new Date() });
    }
    // Development login passwords are never carried unchanged into the public admin account.
    const owner = await to.collection('users').updateOne({ role: 'admin', email: ownerEmail }, { $set: { password: await bcrypt.hash(settings.PRODUCTION_ADMIN_PASSWORD, 12) } });
    if (!owner.matchedCount) throw Error('Configured shop administrator not found');
    await markers.updateOne({ _id: 'initial-import' }, { $set: { complete: true, completedAt: new Date() } });
    console.log('Migration complete. Local data was not modified. Production admin password is in the ignored local settings file.');
  } finally { await Promise.allSettled([source.close(), target.close()]); }
}
main().catch(error => { console.error('Migration did not finish (' + error.name + '). Check private settings and network access; no source data was changed.'); process.exitCode = 1; });
