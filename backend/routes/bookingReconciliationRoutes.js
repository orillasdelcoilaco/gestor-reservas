const express = require('express');
const router = express.Router();
const { analyzeReport, getHistory, getReportDetail, deleteReport } = require('../controllers/bookingReconciliationController');

// Inyectar DB en las rutas
module.exports = (db) => {

    // POST /api/reconciliacion/analyze
    router.post('/analyze', (req, res) => {
        analyzeReport(req, res, db);
    });

    // GET /api/reconciliacion/history
    router.get('/history', (req, res) => {
        getHistory(req, res, db);
    });

    // GET /api/reconciliacion/history/:id
    router.get('/history/:id', (req, res) => {
        getReportDetail(req, res, db);
    });

    // DELETE /api/reconciliacion/history/:id
    router.delete('/history/:id', (req, res) => {
        deleteReport(req, res, db);
    });

    return router;
};
