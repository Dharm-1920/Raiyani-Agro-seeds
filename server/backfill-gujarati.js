require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('./models');
const { gujaratiFields } = require('./services/translation');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    const products = await Product.find({ isDeleted: { $ne: true } });
    let updated = 0;
    for (const product of products) {
      const body = {};
      for (const field of ['name', 'description', 'category', 'unit']) body[field] = product[field] || '';
      const translations = await gujaratiFields(body, product);
      // Do not replace a translation or English source edited while this script was running.
      const filter = { _id: product._id };
      for (const field of Object.keys(body)) filter[field] = product[field];
      for (const field of Object.keys(translations)) filter[field] = product[field] || { $in: ['', null] };
      const result = await Product.updateOne(filter, { $set: translations });
      updated += result.modifiedCount;
      console.log(product.name + ': Gujarati details saved.');
    }
    console.log('Updated ' + updated + ' products.');
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
