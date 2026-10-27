const { Order, Product } = require('../models');
const { flagRefund } = require('./payments');
async function cancelOrder(id, actor) {
  const owned = { _id: id, ...(actor.role === 'admin' ? {} : { user: actor._id }) };
  let order = await Order.findOneAndUpdate({ ...owned, orderStatus: { $in: ['placed', 'confirmed'] } }, { $set: { orderStatus: 'cancelled', cancelledAt: new Date(), cancelledBy: actor.role === 'admin' ? 'admin' : 'customer' } }, { new: true });
  if (!order) {
    order = await Order.findOne(owned);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (order.orderStatus !== 'cancelled') throw Object.assign(new Error('Shipped or delivered orders cannot be cancelled.'), { status: 409 });
  }
  // Per-product atomic markers make restocking safe across repeated/concurrent requests.
  // A retry completes an interrupted restock without adding stock twice.
  const quantities = new Map();
  for (const item of order.items) quantities.set(String(item.product), (quantities.get(String(item.product)) || 0) + item.qty);
  if (order.cancelledAt && !order.stockRestored) for (const [product, qty] of quantities) await Product.updateOne({ _id: product, cancellationRestocks: { $ne: order._id } }, { $inc: { stock: qty }, $addToSet: { cancellationRestocks: order._id } });
  await Order.updateOne({ _id: order._id, orderStatus: 'cancelled' }, { $set: { stockRestored: true } });
  await flagRefund(order._id);
  return Order.findById(order._id);
}
module.exports = { cancelOrder };
