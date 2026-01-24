const express = require('express');
const router = express.Router();
const tinajasControllerFactory = require('../controllers/tinajasController');

module.exports = (db) => {
    const tinajasController = tinajasControllerFactory(db);

    router.get('/diarias', tinajasController.getDiarias);
    router.post('/update', tinajasController.updateStatus);

    return router;
};
