require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Message, User, AuthToken, InvoiceDelivery } = require('./models');
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET missing in .env'); process.exit(1); }
const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'data:', 'https:'], frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com'] } } }));
app.use(cors({ origin: process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173', credentials: true }));
const payments = require('./routes/payments');
app.use('/api/payments', payments.router);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
// strip Mongo operators from input
const clean = (o) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k.startsWith('$') || k.includes('.')) delete o[k]; else clean(o[k]); } };
app.use((req, res, next) => { clean(req.body); clean(req.query); next(); });
if (process.env.UPLOAD_STORAGE === 'mongodb') app.use('/uploads', require('./routes/images'));
app.use('/uploads', express.static(require('./upload-directory')));
app.use('/uploads', (req, res) => res.sendStatus(404));
app.get('/api/health', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ ok: mongoose.connection.readyState === 1 }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }), require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/account', require('./routes/account'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/invoices', rateLimit({ windowMs: 60000, limit: 30 }), require('./routes/invoice-links'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.post('/api/contact', require('./middleware').protect, rateLimit({ windowMs: 60 * 60 * 1000, limit: 10 }), async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ message: 'All fields required' });
  await Message.create({ user: req.user._id, name, email, message }); res.status(201).json({ ok: true });
});
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
if (process.env.SERVE_CLIENT === 'true') app.use(require('./frontend')());
app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ message: err.message || 'Server error' }); });
process.on('unhandledRejection', (e) => console.error(e));
mongoose.connect(process.env.MONGO_URI).then(async () => {
  await Promise.all([User.init(), AuthToken.init(), InvoiceDelivery.init()]);
  require('./services/notifications').startNotificationWorker();
  require('./services/invoice-delivery').startWorker();
  app.listen(process.env.PORT || 5000, () => console.log('API on port ' + (process.env.PORT || 5000)));
}).catch((e) => { console.error('Mongo connection failed', e.message); process.exit(1); });
