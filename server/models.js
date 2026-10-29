const mongoose = require('mongoose');
const { Schema } = mongoose;
const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String, address: String,
  phoneLogin: { type: String, unique: true, sparse: true },
  googleId: { type: String, unique: true, sparse: true },
  emailVerified: { type: Boolean, default: false },
  passwordEnabled: { type: Boolean, default: true },
  authVersion: { type: Number, default: 0 },
  cart: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, qty: { type: Number, min: 1, max: 10000 } }],
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
}, { timestamps: true }));
const Product = mongoose.model('Product', new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  nameGu: { type: String, default: '' },
  descriptionGu: { type: String, default: '' },
  categoryGu: { type: String, default: '' },
  unitGu: { type: String, default: '' },
  category: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  mrp: { type: Number, min: 0 },
  unit: { type: String, default: 'pack' },
  stock: { type: Number, default: 0, min: 0 },
  images: [String],
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  cancellationRestocks: { type: [Schema.Types.ObjectId], default: [], select: false },
}, { timestamps: true }));
const Order = mongoose.model('Order', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ product: { type: Schema.Types.ObjectId, ref: 'Product' }, name: String, nameGu: String, price: Number, qty: Number }],
  shipping: { name: String, phone: String, address: String },
  itemsTotal: Number, shippingFee: Number, totalAmount: Number,
  paymentMethod: { type: String, enum: ['upi', 'cod'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  orderStatus: { type: String, enum: ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'placed' },
  transactionId: String, paymentReference: String, paymentSubmittedAt: Date,
  paymentVerifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }, paymentVerifiedAt: Date,
  refundReference: String, refundVerifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }, refundVerifiedAt: Date,
  cancelledAt: Date, cancelledBy: { type: String, enum: ['customer', 'admin'] },
  stockRestored: { type: Boolean, default: false },
  adminNoticePending: { type: Boolean, default: false },
  deliveryNoticePending: { type: Boolean, default: false },
  invoiceNoticePending: { type: Boolean, default: false },
  invoiceEmail: String,
  invoiceLanguage: { type: String, enum: ['en', 'gu'], default: 'en' },
  invoiceWhatsApp: { type: Boolean, default: false },
  invoicePhone: String,
  refundStatus: { type: String, enum: ['none', 'pending_review', 'completed'], default: 'none' },
}, { timestamps: true }));
// Walk-in bills are separate from website orders and never create a customer login.
const counterCustomerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, unique: true, sparse: true }, address: { type: String, default: '' },
  preferredLanguage: { type: String, enum: ['en', 'gu'], default: 'en' },
  requestKey: { type: String, required: true, unique: true }, requestHash: { type: String, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
const CounterCustomer = mongoose.model('CounterCustomer', counterCustomerSchema);
const CounterBill = mongoose.model('CounterBill', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requestKey: { type: String, required: true, unique: true },
  requestHash: { type: String, required: true },
  source: { type: String, default: 'counter', enum: ['counter'] },
  counterCustomer: { type: Schema.Types.ObjectId, ref: 'CounterCustomer', index: true },
  shipping: { name: String, phone: String, address: String },
  items: [{ name: String, nameGu: String, unit: String, price: Number, qty: Number }],
  itemsTotal: Number, shippingFee: { type: Number, default: 0 }, discount: Number, totalAmount: Number,
  paymentMethod: { type: String, enum: ['cash', 'upi', 'card', 'later'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'partial', 'paid'], required: true },
  paidCents: { type: Number, min: 0 },
  payments: [{ requestKey: String, amountCents: Number, method: { type: String, enum: ['cash', 'upi', 'card'] }, receivedAt: Date, enteredBy: { type: Schema.Types.ObjectId, ref: 'User' }, note: String }],
  remindersEnabled: { type: Boolean, default: false },
  nextReminderAt: Date,
  orderStatus: { type: String, default: 'delivered' },
  invoiceLanguage: { type: String, enum: ['en', 'gu'], default: 'en' },
  invoicePhone: String, invoiceWhatsApp: { type: Boolean, default: false },
  invoiceNoticePending: { type: Boolean, default: false },
}, { timestamps: true }));
const expenseSchema = new Schema({
  requestKey: { type: String, required: true, unique: true }, requestHash: String,
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true }, category: String, payee: String,
  amountCents: { type: Number, required: true, min: 1 },
  method: { type: String, enum: ['cash', 'upi'], required: true }, occurredAt: { type: Date, required: true },
}, { timestamps: true });
const Expense = mongoose.model('Expense', expenseSchema);
const JournalEntry = mongoose.model('JournalEntry', new Schema({
  requestKey: { type: String, required: true, unique: true }, requestHash: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  occurredAt: { type: Date, required: true }, description: { type: String, required: true },
  debitAccount: { type: String, required: true }, creditAccount: { type: String, required: true },
  amountCents: { type: Number, required: true, min: 1 },
}, { timestamps: true }));
const reminderSchema = new Schema({
  bill: { type: Schema.Types.ObjectId, ref: 'CounterBill', required: true },
  scheduledFor: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'sending', 'accepted', 'cancelled', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date, acceptedAt: Date, providerId: String, lastError: String, amountCents: Number,
}, { timestamps: true });
reminderSchema.index({ bill: 1, scheduledFor: 1 }, { unique: true });
reminderSchema.index({ status: 1, nextAttemptAt: 1 });
const PaymentReminder = mongoose.model('PaymentReminder', reminderSchema);
const Message = mongoose.model('Message', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  name: String, email: String, message: String, isRead: { type: Boolean, default: false },
}, { timestamps: true }));
const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  eventKey: { type: String, required: true },
  type: { type: String, enum: ['restock', 'delivery', 'purchase'], required: true },
  title: String, titleGu: String, message: String, messageGu: String, link: String,
  isRead: { type: Boolean, default: false },
}, { timestamps: true });
notificationSchema.index({ user: 1, eventKey: 1 }, { unique: true });
notificationSchema.index({ user: 1, createdAt: -1 });
const Notification = mongoose.model('Notification', notificationSchema);
const subscriptionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  active: { type: Boolean, default: true }, notifiedAt: Date,
}, { timestamps: true });
subscriptionSchema.index({ user: 1, product: 1 }, { unique: true, partialFilterExpression: { active: true } });
const StockSubscription = mongoose.model('StockSubscription', subscriptionSchema);
const ProductImage = mongoose.model('ProductImage', new Schema({
  filename: { type: String, required: true, unique: true },
  contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  data: { type: Buffer, required: true },
}, { timestamps: true }));
const authTokenSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, enum: ['reset', 'verify'], required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
authTokenSchema.index({ user: 1, purpose: 1 }, { unique: true });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const AuthToken = mongoose.model('AuthToken', authTokenSchema);
const invoiceDeliverySchema = new Schema({
  source: { type: String, enum: ['order', 'counter'], default: 'order' },
  order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: String, enum: ['email', 'whatsapp'], required: true },
  recipient: { type: String, required: true },
  language: { type: String, enum: ['en', 'gu'], default: 'en' },
  status: { type: String, enum: ['pending', 'sending', 'accepted', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date, acceptedAt: Date, providerId: String,
  // Safe diagnostic codes only: never store SMTP credentials, tokens, or provider response bodies.
  lastError: String,
}, { timestamps: true });
invoiceDeliverySchema.index({ order: 1, channel: 1 }, { unique: true });
invoiceDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
const InvoiceDelivery = mongoose.model('InvoiceDelivery', invoiceDeliverySchema);
module.exports = { User, Product, Order, CounterBill, CounterCustomer, Expense, JournalEntry, PaymentReminder, Message, Notification, StockSubscription, ProductImage, AuthToken, InvoiceDelivery };
