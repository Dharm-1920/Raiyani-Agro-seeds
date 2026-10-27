require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Product } = require('./models');
// SAMPLE products and prices: the owner must replace these with real stock from the admin panel.
const sample = [
  ['Groundnut Seeds (Premium)', 'Seeds', 180, 200, 'kg', 100, 'High-yield groundnut seed suited to Saurashtra soil.'],
  ['Cotton Seeds (BT)', 'Seeds', 864, 900, '475g pack', 60, 'Hybrid cotton seed packet.'],
  ['Wheat Seeds (Certified)', 'Seeds', 55, 60, 'kg', 300, 'Certified wheat seed for rabi season.'],
  ['Bajra Seeds (Hybrid)', 'Seeds', 120, 140, 'kg', 80, 'Hybrid pearl millet seed.'],
  ['Castor Seeds', 'Seeds', 210, 230, 'kg', 50, 'Castor seed for commercial cultivation.'],
  ['Urea 45kg', 'Fertilizers', 266, 270, 'bag', 120, 'Nitrogen fertilizer.'],
  ['DAP 50kg', 'Fertilizers', 1350, 1400, 'bag', 70, 'Di-ammonium phosphate.'],
  ['NPK 19:19:19', 'Fertilizers', 120, 150, 'kg', 90, 'Water-soluble balanced fertilizer.'],
  ['Neem Oil Pesticide', 'Pesticides', 350, 400, '1 L', 40, 'Organic pest control.'],
  ['Hand Sprayer 16L', 'Tools', 1500, 1800, 'piece', 15, 'Knapsack sprayer.'],
].map(([name, category, price, mrp, unit, stock, description]) => ({ name, category, price, mrp, unit, stock, description }));
(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email || !process.env.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  if (process.env.ADMIN_PASSWORD.length < 8) throw new Error('Use an ADMIN_PASSWORD of at least 8 characters');
  await mongoose.connect(process.env.MONGO_URI);
  const existing = await User.findOne({ email });
  if (existing && existing.role !== 'admin') throw new Error('ADMIN_EMAIL belongs to a customer account. Choose a new admin email or have an existing admin promote it.');
  if (!existing)
    await User.create({ name: 'Shop Admin', email, password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10), role: 'admin' });
  if (!(await Product.countDocuments())) await Product.insertMany(sample);
  console.log('Seed complete. Admin:', email);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
