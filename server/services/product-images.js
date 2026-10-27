const { randomUUID } = require('crypto');
const { ProductImage } = require('../models');
const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
async function storeImages(files = []) {
  const names = [];
  try {
    for (const file of files) {
      if (!file.buffer) { names.push('/uploads/' + file.filename); continue; }
      const extension = extensions[file.mimetype];
      if (!extension || file.buffer.length > 2 * 1024 * 1024) throw Object.assign(Error('Use JPG, PNG or WebP images up to 2MB.'), { status: 400 });
      const filename = randomUUID() + extension;
      await ProductImage.create({ filename, contentType: file.mimetype, data: file.buffer });
      names.push('/uploads/' + filename);
    }
    return names;
  } catch (error) {
    await removeImages(names.filter(name => files.every(file => name !== '/uploads/' + file.filename)));
    throw error;
  }
}
async function removeImages(urls = []) {
  if (urls.length) await ProductImage.deleteMany({ filename: { $in: urls.map(url => url.split('/').pop()) } });
}
module.exports = { storeImages, removeImages };
