// backend/routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

module.exports = (db) => {

    router.get('/settings/empresa', (req, res) => settingsController.getCompanySettings(req, res, db));

    router.put('/settings/empresa', express.json(), (req, res) => settingsController.updateCompanySettings(req, res, db));

    return router;
};
