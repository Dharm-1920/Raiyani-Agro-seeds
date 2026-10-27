const path = require('path');
// Production can mount durable storage here; local development keeps its existing folder.
module.exports = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
