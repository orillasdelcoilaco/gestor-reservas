// backend/routes/incidentsRoutes.js
const express = require('express');
const router = express.Router();
const incidentsController = require('../controllers/incidentsController');

module.exports = (db) => {

    // POST /api/incidencias - Reportar
    router.post('/incidencias', express.json(), (req, res) => incidentsController.createIncident(req, res, db));

    // GET /api/incidencias/pendientes - Listar pendientes
    router.get('/incidencias/pendientes', (req, res) => incidentsController.getPending(req, res, db));

    return router;
};
