const mongoose = require('mongoose');
const { CounterBill, Product } = require('../models');

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

// A sale and all its stock changes commit together. MongoDB retries transient
// transaction conflicts, including a simultaneous online checkout for these units.
async function saveStockBill(data) {
  try {
    return await mongoose.connection.transaction(async session => {
      const existing = await CounterBill.findOne({ requestKey: data.requestKey }).session(session);
      if (existing) return { bill: existing, created: false };
      const quantities = new Map();
      for (const item of data.items) if (item.product) {
        const id = String(item.product);
        quantities.set(id, (quantities.get(id) || 0) + Math.round(item.qty * 1000));
      }
      const products = new Map();
      // Stable ordering also avoids opposite-order contention between two tills.
      for (const [id, thousandths] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
        const product = await Product.findOneAndUpdate(
          { _id: id, isActive: true, isDeleted: { $ne: true }, stock: { $gte: thousandths / 1000 } },
          { $inc: { stock: -thousandths / 1000 } }, { new: true, session });
        if (!product) fail('A product has insufficient stock or is no longer available. Refresh products and adjust the bill.');
        products.set(id, product);
      }
      const items = data.items.map(item => {
        const product = products.get(String(item.product));
        return product ? { ...item, name: product.name, nameGu: product.nameGu || '', unit: product.unit || '' } : item;
      });
      const [bill] = await CounterBill.create([{ ...data, items }], { session });
      return { bill, created: true };
    }, { readPreference: 'primary' });
  } catch (error) {
    // A simultaneous exact save can win the unique request-key index. Its
    // transaction owns the only stock deduction; the caller verifies its hash.
    if (error.code === 11000) {
      const bill = await CounterBill.findOne({ requestKey: data.requestKey });
      if (bill) return { bill, created: false };
    }
    if (error.status) throw error;
    // Never fall back to a non-transactional stock deduction.
    fail('The bill save could not be confirmed. Retry the same bill safely.', 503);
  }
}

module.exports = { saveStockBill };
