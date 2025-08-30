const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Middleware para parsear el body de las peticiones a JSON
const jsonParser = express.json();

module.exports = (db) => {
    /**
     * GET /api/cabanas
     * Obtiene todos los registros de cabañas ordenados por nombre.
     */
    router.get('/cabanas', async (req, res) => {
        try {
            const snapshot = await db.collection('cabanas').orderBy('nombre', 'asc').get();
            if (snapshot.empty) {
                return res.status(200).json([]);
            }

            const cabanas = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            res.status(200).json(cabanas);
        } catch (error) {
            console.error("Error al obtener las cabañas:", error);
            res.status(500).json({ error: 'Error interno del servidor al obtener las cabañas.' });
        }
    });

    /**
     * POST /api/cabanas
     * Crea un nuevo registro de cabaña.
     */
    router.post('/cabanas', jsonParser, async (req, res) => {
        try {
            const nuevaCabaña = req.body;

            // Validación simple
            if (!nuevaCabaña || !nuevaCabaña.nombre || !nuevaCabaña.capacidad) {
                return res.status(400).json({ error: 'Faltan datos requeridos (nombre, capacidad).' });
            }

            const docRef = await db.collection('cabanas').add(nuevaCabaña);
            res.status(201).json({ message: 'Cabaña creada exitosamente', id: docRef.id });

        } catch (error) {
            console.error("Error al crear la cabaña:", error);
            res.status(500).json({ error: 'Error interno del servidor al crear la cabaña.' });
        }
    });

    /**
     * PUT /api/cabanas/:id
     * Actualiza un registro de cabaña existente.
     */
    router.put('/cabanas/:id', jsonParser, async (req, res) => {
        try {
            const { id } = req.params;
            const datosActualizados = req.body;

            if (!id || !datosActualizados) {
                return res.status(400).json({ error: 'Faltan el ID o los datos para actualizar.' });
            }

            const cabanaRef = db.collection('cabanas').doc(id);
            await cabanaRef.update(datosActualizados);
            res.status(200).json({ message: 'Cabaña actualizada exitosamente' });

        } catch (error) {
            console.error("Error al actualizar la cabaña:", error);
            res.status(500).json({ error: 'Error interno del servidor al actualizar la cabaña.' });
        }
    });

    /**
     * DELETE /api/cabanas/:id
     * Elimina un registro de cabaña.
     */
    router.delete('/cabanas/:id', async (req, res) => {
        try {
            const { id } = req.params;
            if (!id) {
                return res.status(400).json({ error: 'Se requiere el ID de la cabaña.' });
            }

            const cabanaRef = db.collection('cabanas').doc(id);
            await cabanaRef.delete();

            res.status(200).json({ message: 'Cabaña eliminada exitosamente' });

        } catch (error) {
            console.error("Error al eliminar la cabaña:", error);
            res.status(500).json({ error: 'Error interno del servidor al eliminar la cabaña.' });
        }
    });

    return router;
};