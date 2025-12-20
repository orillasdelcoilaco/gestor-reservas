// backend/routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

module.exports = (db) => {
    router.get('/reportes/descargar', (req, res) => reportController.downloadReport(req, res, db));
    router.post('/reportes/enviar', (req, res) => reportController.sendReportToAdmin(req, res, db));
    return router;
};
