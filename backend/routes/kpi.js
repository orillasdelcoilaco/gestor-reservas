const express = require('express');
const router = express.Router();
const { calculateKPIs } = require('../services/kpiService');

module.exports = (db) => {
    router.get('/kpi', async (req, res) => {
        // --- INICIO DE LA MODIFICACIÓN: Se añade ocupacionProyectada ---
        const { fechaInicio, fechaFin, ocupacionProyectada } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Se requieren las fechas de inicio y fin.' });
        }

        // Se convierte a número, con un valor por defecto de 100 si no se proporciona
        const proyeccion = ocupacionProyectada ? parseFloat(ocupacionProyectada) : 100;

        try {
            // Se pasa el nuevo parámetro a la función de cálculo
            const results = await calculateKPIs(db, fechaInicio, fechaFin, proyeccion);
            res.status(200).json(results);
        } catch (error) {
            console.error("Error en la ruta de KPIs:", error);
            // --- FIN DE LA MODIFICACIÓN ---
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};