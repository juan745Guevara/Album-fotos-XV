const express = require('express');
const fotosController = require('../controllers/fotosController');
const authAdmin = require('../middleware/authAdmin');

const router = express.Router();

router.get('/', authAdmin, fotosController.listFotos);
router.get('/zip', authAdmin, fotosController.descargarZip);
router.delete('/:id', authAdmin, fotosController.eliminarFoto);

module.exports = router;
