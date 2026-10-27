const router = require('express').Router();
const { ProductImage } = require('../models');
router.get('/:filename', async (req, res, next) => {
  if (!/^[a-zA-Z0-9._-]{1,200}$/.test(req.params.filename)) return res.sendStatus(404);
  try {
    const image = await ProductImage.findOne({ filename: req.params.filename });
    if (!image) return next();
    res.set({ 'Content-Type': image.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.send(image.data);
  } catch { res.status(503).json({ message: 'Image could not be loaded. Please retry.' }); }
});
module.exports = router;
