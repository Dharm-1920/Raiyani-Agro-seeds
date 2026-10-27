const express = require('express');
const path = require('path');
module.exports = function frontend(directory = path.join(__dirname, '../client/dist')) {
  const router = express.Router();
  router.use('/assets', express.static(path.join(directory, 'assets'), { maxAge: '1y', immutable: true }));
  router.use(express.static(directory, { index: false }));
  router.get('*', (req, res, next) => {
    if (path.extname(req.path) || !req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(directory, 'index.html'), error => error && next(error));
  });
  return router;
};
