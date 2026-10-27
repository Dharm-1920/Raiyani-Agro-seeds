const mongoose = require('mongoose');
const { Schema } = mongoose;
const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String, address: String,
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
  refundStatus: { type: String, enum: ['none', 'pending_review', 'completed'], default: 'none' },
}, { timestamps: true }));
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
module.exports = { User, Product, Order, Message, Notification, StockSubscription, ProductImage };
