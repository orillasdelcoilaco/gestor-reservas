const express = require('express');
const router = express.Router();
const { getActividadDiaria, getDisponibilidadPeriodo } = require('../services/reporteService');

module.exports = (db) => {
    /**
     * GET /reportes/actividad-diaria
     * Genera el reporte de actividad para una fecha específica.
     */
    router.get('/reportes/actividad-diaria', async (req, res) => {
        const { fecha } = req.query;
        if (!fecha) {
            return res.status(400).json({ error: 'Se requiere una fecha.' });
        }
        try {
            const reporte = await getActividadDiaria(db, fecha);
            res.status(200).json(reporte);
        } catch (error) {
            console.error("Error al generar reporte de actividad diaria:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    /**
     * GET /reportes/disponibilidad-periodo
     * Genera el reporte de disponibilidad para un rango de fechas.
     */
    router.get('/reportes/disponibilidad-periodo', async (req, res) => {
        const { fechaInicio, fechaFin, exactas } = req.query;
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Se requieren fecha de inicio y fin.' });
        }
        try {
            const reporte = await getDisponibilidadPeriodo(db, fechaInicio, fechaFin, exactas === 'true');
            res.status(200).json(reporte);
        } catch (error) {
            console.error("Error al generar reporte de disponibilidad:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    return router;
};