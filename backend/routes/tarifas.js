const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware para parsear el body de las peticiones a JSON
const jsonParser = express.json();

module.exports = (db) => {
    /**
     * GET /api/tarifas
     * Obtiene todos los registros de tarifas ordenados por fecha de inicio.
     */
    router.get('/tarifas', async (req, res) => {
        try {
            const snapshot = await db.collection('tarifas').orderBy('fechaInicio', 'desc').get();
            if (snapshot.empty) {
                return res.status(200).json([]);
            }

            const tarifas = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                tarifas.push({
                    id: doc.id,
                    ...data,
                    // Convertimos los Timestamps a un formato más legible para el frontend
                    fechaInicio: data.fechaInicio.toDate().toISOString().split('T')[0],
                    fechaTermino: data.fechaTermino.toDate().toISOString().split('T')[0],
                });
            });

            res.status(200).json(tarifas);
        } catch (error) {
            console.error("Error al obtener las tarifas:", error);
            res.status(500).json({ error: 'Error interno del servidor al obtener tarifas.' });
        }
    });

    return router;
};