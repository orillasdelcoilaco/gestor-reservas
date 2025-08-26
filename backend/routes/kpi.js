const express = require('express');
const router = express.Router();
// Nos aseguramos de importar la función correctamente
const { calculateKPIs } = require('../services/kpiService');

module.exports = (db) => {
    /**
     * GET /api/kpi
     * Calcula y devuelve los KPIs para un rango de fechas.
     */
    router.get('/kpi', async (req, res) => {
        const { fechaInicio, fechaFin } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Se requieren las fechas de inicio y fin.' });
        }

        try {
            // Llamamos a la función importada
            const results = await calculateKPIs(db, fechaInicio, fechaFin);
            res.status(200).json(results);
        } catch (error) {
            console.error("Error en la ruta de KPIs:", error);
            res.status(500).json({ error: 'Error interno del servidor al calcular los KPIs.' });
        }
    });

    return router;
};