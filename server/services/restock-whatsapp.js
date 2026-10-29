const { Product, StockSubscription, RestockDelivery } = require('../models');
const { publicOrigin } = require('./identity');
const meta = require('./whatsapp-meta');

async function queue(subscription) {
  if (!subscription.whatsapp || !subscription.whatsappPhone || !subscription.whatsappConsentAt) return;
  try {
    await RestockDelivery.updateOne({ subscription: subscription._id }, { $setOnInsert: {
      subscription: subscription._id, product: subscription.product, user: subscription.user,
      recipient: subscription.whatsappPhone, language: subscription.language || 'en',
      status: 'pending', attempts: 0, nextAttemptAt: new Date(),
    } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
}
async function deliver(job) {
  const claim = { _id: job._id, status: 'sending', leaseUntil: job.leaseUntil };
  const [subscription, product] = await Promise.all([
    StockSubscription.findById(job.subscription),
    Product.findOne({ _id: job.product, isActive: true, isDeleted: { $ne: true }, stock: { $gt: 0 } }),
  ]);
  if (!subscription || !subscription.whatsapp || !subscription.whatsappConsentAt || subscription.cancelledAt ||
    String(subscription.user) !== String(job.user) || String(subscription.product) !== String(job.product) || subscription.whatsappPhone !== job.recipient || !product) {
    await RestockDelivery.updateOne(claim, { $set: { status: 'cancelled', lastError: '' }, $unset: { leaseUntil: 1 } }); return;
  }
  const providerId = await meta.sendTemplate({ kind: 'restock', recipient: job.recipient, language: job.language,
    values: [job.language === 'gu' ? product.nameGu || product.name : product.name, `${publicOrigin()}/product/${product._id}`] });
  await RestockDelivery.updateOne(claim, { $set: { status: 'accepted', providerId, acceptedAt: new Date(), lastError: '' }, $unset: { leaseUntil: 1 } });
}
let running = false;
async function retryPending() {
  if (running || !meta.configured('restock')) return;
  running = true;
  try {
    await RestockDelivery.updateMany({ status: 'sending', attempts: { $gte: 6 }, leaseUntil: { $lte: new Date() } }, { $set: { status: 'failed', lastError: 'DELIVERY_RETRY' }, $unset: { leaseUntil: 1 } });
    for (let count = 0; count < 10; count++) {
      const now = new Date();
      const job = await RestockDelivery.findOneAndUpdate({ attempts: { $lt: 6 }, $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } }, { status: 'sending', leaseUntil: { $lte: now } },
      ] }, { $set: { status: 'sending', leaseUntil: new Date(now.valueOf() + 300000) }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1 } });
      if (!job) break;
      try { await deliver(job); }
      catch (error) {
        await RestockDelivery.updateOne({ _id: job._id, status: 'sending', leaseUntil: job.leaseUntil }, { $set: {
          status: error.code === 'WHATSAPP_OPT_OUT' ? 'cancelled' : job.attempts >= 6 ? 'failed' : 'pending',
          lastError: error.code === 'WHATSAPP_OPT_OUT' ? 'WHATSAPP_OPT_OUT' : 'DELIVERY_RETRY',
          nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000),
        }, $unset: { leaseUntil: 1 } });
      }
    }
  } finally { running = false; }
}
function startWorker() {
  const run = () => retryPending().catch(() => console.error('WhatsApp stock alerts will retry.'));
  run(); const timer = setInterval(run, 15000); timer.unref(); return timer;
}
module.exports = { queue, deliver, retryPending, startWorker };
