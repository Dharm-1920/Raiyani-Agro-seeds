const { Notification, StockSubscription, Product, Order, User } = require('../models');

// Stable event keys make retries safe, including a crash after insertion.
async function send(user, eventKey, data) {
  try {
    await Notification.updateOne({ user, eventKey }, { $setOnInsert: { user, eventKey, ...data } }, { upsert: true });
  } catch (error) { if (error.code !== 11000) throw error; }
}
async function notifyRestockedProduct(product) {
  // Re-read current availability: an archived product must never send a restock alert.
  const p = await Product.findOne({ _id: product, isActive: true, isDeleted: { $ne: true }, stock: { $gt: 0 } });
  if (!p) return;
  const subscriptions = await StockSubscription.find({ product: p._id, active: true });
  for (const subscription of subscriptions) {
    await send(subscription.user, `restock:${subscription._id}`, {
      type: 'restock', title: 'Back in stock', titleGu: 'ફરી સ્ટોકમાં ઉપલબ્ધ',
      message: `${p.name} is available again. You can now order it.`,
      messageGu: `${p.nameGu || p.name} ફરી ઉપલબ્ધ છે. હવે તમે ઓર્ડર કરી શકો છો.`,
      link: `/product/${p._id}`,
    });
    await StockSubscription.updateOne({ _id: subscription._id, active: true }, { $set: { active: false, notifiedAt: new Date() } });
  }
}
async function processOrderNotifications(order) {
  if (order.adminNoticePending) {
    const admins = await User.find({ role: 'admin' }).select('_id');
    const items = order.items.map(i => `${i.name} × ${i.qty}`).join(', ');
    const itemsGu = order.items.map(i => `${i.nameGu || i.name} × ${i.qty}`).join(', ');
    for (const admin of admins) await send(admin._id, `purchase:${order._id}`, {
      type: 'purchase', title: 'New order received', titleGu: 'નવો ઓર્ડર મળ્યો',
      message: `${order.shipping.name} ordered ${items}. Total: ₹${order.totalAmount}. Order #${String(order._id).slice(-6)}.`,
      messageGu: `${order.shipping.name} દ્વારા ${itemsGu} નો ઓર્ડર મળ્યો. કુલ: ₹${order.totalAmount}. ઓર્ડર #${String(order._id).slice(-6)}.`,
      link: '/admin?tab=Orders',
    });
    await Order.updateOne({ _id: order._id }, { $set: { adminNoticePending: false } });
  }
  if (order.deliveryNoticePending && order.orderStatus === 'delivered') {
    await send(order.user, `delivery:${order._id}`, {
      type: 'delivery', title: 'Your order has been delivered', titleGu: 'તમારો ઓર્ડર પહોંચાડવામાં આવ્યો છે',
      message: `Order #${String(order._id).slice(-6)} has been delivered. Thank you for shopping with Raiyani Agro Seeds.`,
      messageGu: `ઓર્ડર #${String(order._id).slice(-6)} પહોંચાડવામાં આવ્યો છે. રૈયાણી એગ્રો સીડ્સમાંથી ખરીદી કરવા બદલ આભાર.`,
      link: '/orders',
    });
    await Order.updateOne({ _id: order._id }, { $set: { deliveryNoticePending: false } });
  }
}
function safely(work) { return work().catch(error => console.error('Notification retry scheduled:', error.message)); }
let running = false;
async function retryPending() {
  if (running) return;
  running = true;
  try {
    const orders = await Order.find({ $or: [{ adminNoticePending: true }, { deliveryNoticePending: true }] }).limit(100);
    for (const order of orders) await safely(() => processOrderNotifications(order));
    const products = await StockSubscription.distinct('product', { active: true });
    for (const product of products) await safely(() => notifyRestockedProduct(product));
  } finally { running = false; }
}
function startNotificationWorker() {
  safely(retryPending);
  const timer = setInterval(() => safely(retryPending), 15000);
  timer.unref();
  return timer;
}
module.exports = { send, notifyRestockedProduct, processOrderNotifications, safely, retryPending, startNotificationWorker };
