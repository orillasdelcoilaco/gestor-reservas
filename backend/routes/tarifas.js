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

    /**
     * POST /api/tarifas
     * Crea un nuevo registro de tarifa.
     */
    router.post('/tarifas', jsonParser, async (req, res) => {
        try {
            const {
                nombreCabaña,
                temporada,
                fechaInicio,
                fechaTermino,
                tarifasPorCanal
            } = req.body;

            if (!nombreCabaña || !temporada || !fechaInicio || !fechaTermino || !tarifasPorCanal) {
                return res.status(400).json({ error: 'Faltan datos requeridos para crear la tarifa.' });
            }

            const nuevaTarifa = {
                nombreCabaña,
                temporada,
                fechaInicio: admin.firestore.Timestamp.fromDate(new Date(fechaInicio)),
                fechaTermino: admin.firestore.Timestamp.fromDate(new Date(fechaTermino)),
                tarifasPorCanal
            };

            const docRef = await db.collection('tarifas').add(nuevaTarifa);
            res.status(201).json({ message: 'Tarifa creada exitosamente', id: docRef.id });

        } catch (error) {
            console.error("Error al crear la tarifa:", error);
            res.status(500).json({ error: 'Error interno del servidor al crear la tarifa.' });
        }
    });

    /**
     * PUT /api/tarifas/:id
     * Actualiza un registro de tarifa existente.
     */
    router.put('/tarifas/:id', jsonParser, async (req, res) => {
        try {
            const { id } = req.params;
            const {
                nombreCabaña,
                temporada,
                fechaInicio,
                fechaTermino,
                tarifasPorCanal
            } = req.body;

            if (!id || !nombreCabaña || !temporada || !fechaInicio || !fechaTermino || !tarifasPorCanal) {
                return res.status(400).json({ error: 'Faltan datos requeridos para actualizar la tarifa.' });
            }

            const tarifaRef = db.collection('tarifas').doc(id);
            const datosActualizados = {
                nombreCabaña,
                temporada,
                fechaInicio: admin.firestore.Timestamp.fromDate(new Date(fechaInicio)),
                fechaTermino: admin.firestore.Timestamp.fromDate(new Date(fechaTermino)),
                tarifasPorCanal
            };

            await tarifaRef.update(datosActualizados);
            res.status(200).json({ message: 'Tarifa actualizada exitosamente' });

        } catch (error) {
            console.error("Error al actualizar la tarifa:", error);
            res.status(500).json({ error: 'Error interno del servidor al actualizar la tarifa.' });
        }
    });

    /**
     * DELETE /api/tarifas/:id
     * Elimina un registro de tarifa.
     */
    router.delete('/tarifas/:id', async (req, res) => {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ error: 'Se requiere el ID de la tarifa.' });
            }

            const tarifaRef = db.collection('tarifas').doc(id);
            await tarifaRef.delete();

            res.status(200).json({ message: 'Tarifa eliminada exitosamente' });

        } catch (error) {
            console.error("Error al eliminar la tarifa:", error);
            res.status(500).json({ error: 'Error interno del servidor al eliminar la tarifa.' });
        }
    });

    return router;
};