// backend/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

module.exports = (db) => {

    // Endpoint optimizado para badges y contadores
    router.get('/dashboard/stats', (req, res) => dashboardController.getDashboardStats(req, res, db));

    return router;
};
