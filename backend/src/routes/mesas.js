const express = require('express');
const mesasController = require('../controllers/mesasController');
const { upload, handleMulterError } = require('../middleware/upload');

const router = express.Router();

router.get('/', mesasController.listMesas);
router.get('/:id', mesasController.getMesa);
router.post(
  '/:id/fotos',
  upload.single('foto'),
  handleMulterError,
  mesasController.subirFoto
);

module.exports = router;
