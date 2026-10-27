const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { User } = require('./models');
const protect = async (req, res, next) => {
  try {
    const t = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
    const { id } = jwt.verify(t, process.env.JWT_SECRET);
    req.user = await User.findById(id).select('-password');
    if (!req.user) throw new Error('no user');
    next();
  } catch { res.status(401).json({ message: 'Please log in' }); }
};
const adminOnly = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Admins only' });
const dir = require('./upload-directory');
const databaseImages = process.env.UPLOAD_STORAGE === 'mongodb';
if (!databaseImages) fs.mkdirSync(dir, { recursive: true });
const upload = multer({
  storage: databaseImages ? multer.memoryStorage() : multer.diskStorage({
    destination: dir,
    filename: (req, f, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(f.originalname).toLowerCase()),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)),
});
module.exports = { protect, adminOnly, upload };
