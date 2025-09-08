const express = require('express');
const router = express.Router();
const { calculateKPIs } = require('../services/kpiService');

module.exports = (db) => {
    router.get('/kpi', async (req, res) => {
        const { fechaInicio, fechaFin } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Se requieren las fechas de inicio y fin.' });
        }

        try {
            const { results, warningMessage } = await calculateKPIs(db, fechaInicio, fechaFin);
            res.status(200).json({ ...results, warning: warningMessage });
        } catch (error) {
            console.error("Error en la ruta de KPIs:", error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};