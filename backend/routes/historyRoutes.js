// backend/routes/historyRoutes.js
const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

module.exports = (db) => {
    router.get('/historial', (req, res) => historyController.getHistory(req, res, db));
    return router;
};
