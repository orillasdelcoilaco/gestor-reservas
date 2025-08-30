const express = require('express');
const router = express.Router();
const { getAvailabilityData, findBestCombination, calculatePrice } = require('../services/presupuestoService');

// Middleware para parsear el body de las peticiones a JSON
const jsonParser = express.json();

module.exports = (db) => {
    /**
     * POST /api/presupuestos/generar
     * Genera una propuesta de presupuesto basada en fechas y número de personas.
     */
    router.post('/presupuestos/generar', jsonParser, async (req, res) => {
        const { fechaLlegada, fechaSalida, personas } = req.body;

        if (!fechaLlegada || !fechaSalida || !personas) {
            return res.status(400).json({ error: 'Se requieren fechas y cantidad de personas.' });
        }

        try {
            const startDate = new Date(fechaLlegada + 'T00:00:00Z');
            const endDate = new Date(fechaSalida + 'T00:00:00Z');

            // 1. Obtener disponibilidad
            const { availableCabanas, allCabanas } = await getAvailabilityData(db, startDate, endDate);

            // 2. Encontrar la mejor combinación
            const { combination, capacity } = findBestCombination(availableCabanas, parseInt(personas));

            if (combination.length === 0) {
                return res.status(200).json({
                    message: 'No hay suficientes cabañas disponibles para la cantidad de personas solicitada.',
                    suggestion: null,
                    availableCabanas,
                    allCabanas
                });
            }

            // 3. Calcular el precio
            const pricing = await calculatePrice(db, combination, startDate, endDate);

            res.status(200).json({
                suggestion: {
                    cabanas: combination,
                    totalCapacity: capacity,
                    pricing: pricing
                },
                availableCabanas,
                allCabanas
            });

        } catch (error) {
            console.error("Error al generar el presupuesto:", error);
            res.status(500).json({ error: 'Error interno del servidor al generar el presupuesto.' });
        }
    });

    /**
     * POST /api/presupuestos/recalcular
     * Recalcula el precio para una selección manual de cabañas.
     */
    router.post('/presupuestos/recalcular', jsonParser, async (req, res) => {
        const { fechaLlegada, fechaSalida, cabanas } = req.body;
        if (!fechaLlegada || !fechaSalida || !cabanas) {
            return res.status(400).json({ error: 'Faltan datos para recalcular el precio.' });
        }

        try {
            const startDate = new Date(fechaLlegada + 'T00:00:00Z');
            const endDate = new Date(fechaSalida + 'T00:00:00Z');

            const pricing = await calculatePrice(db, cabanas, startDate, endDate);
            res.status(200).json(pricing);

        } catch (error) {
            console.error("Error al recalcular el precio:", error);
            res.status(500).json({ error: 'Error interno del servidor al recalcular.' });
        }
    });

    return router;
};