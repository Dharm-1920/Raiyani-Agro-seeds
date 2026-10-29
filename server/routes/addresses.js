const router = require('express').Router();
const { isValidObjectId } = require('mongoose');
const { bookFor, changeBook } = require('../services/address-book');
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.get('/', (req, res) => res.json(bookFor(req.user)));
const change = action => async (req, res) => {
  if (req.params.id && !isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid address ID.' });
  try { res.status(action === 'create' ? 201 : 200).json(await changeBook(req.user, req.body, action, req.params.id)); }
  catch (error) { res.status(error.status || 503).json({ message: error.status ? error.message : 'Addresses could not be saved. Please retry.' }); }
};
router.post('/', change('create'));
router.put('/:id/default', change('default'));
router.put('/:id', change('update'));
router.delete('/:id', change('delete'));
module.exports = router;
