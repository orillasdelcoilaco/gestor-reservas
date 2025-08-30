const express = require('express');
const router = express.Router();

// Middleware para parsear el body de las peticiones a JSON
const jsonParser = express.json();

module.exports = (db) => {
    /**
     * GET /api/presupuestos
     * Ruta de ejemplo para obtener presupuestos.
     * La implementaremos completamente en la siguiente fase.
     */
    router.get('/presupuestos', async (req, res) => {
        // Por ahora, solo devuelve un array vacío.
        res.status(200).json([]);
    });

    /**
     * POST /api/presupuestos
     * Ruta de ejemplo para crear un presupuesto.
     * La implementaremos completamente en la siguiente fase.
     */
    router.post('/presupuestos', jsonParser, async (req, res) => {
        // Por ahora, solo devuelve un mensaje de éxito.
        res.status(201).json({ message: 'Ruta de presupuestos creada. Implementación pendiente.' });
    });

    return router;
};