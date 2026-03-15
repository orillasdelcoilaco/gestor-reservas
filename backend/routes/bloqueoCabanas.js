const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

module.exports = (db) => {

    // GET - lista todos los bloqueos
    router.get('/bloqueos', async (req, res) => {
        try {
            const snapshot = await db.collection('bloqueoCabanas')
                .orderBy('fechaInicio', 'desc')
                .get();

            const bloqueos = snapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    cabana: d.cabana,
                    fechaInicio: d.fechaInicio.toDate().toISOString().split('T')[0],
                    fechaFin: d.fechaFin.toDate().toISOString().split('T')[0],
                    motivo: d.motivo,
                    creadoEn: d.creadoEn?.toDate()?.toISOString() || null,
                };
            });

            res.json({ bloqueos });
        } catch (err) {
            console.error('Error obteniendo bloqueos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST - crear uno o varios bloqueos
    router.post('/bloqueos', async (req, res) => {
        const { cabanas, fechaInicio, fechaFin, motivo } = req.body;

        if (!Array.isArray(cabanas) || !cabanas.length) {
            return res.status(400).json({ error: 'Se requiere al menos una cabaña.' });
        }
        if (!fechaInicio || !fechaFin || !motivo) {
            return res.status(400).json({ error: 'fechaInicio, fechaFin y motivo son requeridos.' });
        }
        if (new Date(fechaInicio) > new Date(fechaFin)) {
            return res.status(400).json({ error: 'fechaInicio no puede ser mayor que fechaFin.' });
        }

        try {
            // Verificar que ninguna cabaña tenga reservas Confirmadas en ese período
            const inicio = new Date(fechaInicio + 'T00:00:00Z');
            const fin = new Date(fechaFin + 'T23:59:59Z');

            const reservasSnap = await db.collection('reservas')
                .where('alojamiento', 'in', cabanas)
                .where('estado', '==', 'Confirmada')
                .where('fechaLlegada', '<', admin.firestore.Timestamp.fromDate(fin))
                .get();

            const conflictos = [];
            reservasSnap.forEach(doc => {
                const r = doc.data();
                const salida = r.fechaSalida.toDate();
                if (salida > inicio) {
                    conflictos.push(r.alojamiento);
                }
            });

            if (conflictos.length > 0) {
                const unicas = [...new Set(conflictos)];
                return res.status(409).json({
                    error: `No se puede bloquear porque hay reservas confirmadas en ese período: ${unicas.join(', ')}.`
                });
            }

            const batch = db.batch();
            const ids = [];

            for (const cabana of cabanas) {
                const ref = db.collection('bloqueoCabanas').doc();
                batch.set(ref, {
                    cabana,
                    fechaInicio: admin.firestore.Timestamp.fromDate(new Date(fechaInicio + 'T00:00:00Z')),
                    fechaFin: admin.firestore.Timestamp.fromDate(new Date(fechaFin + 'T23:59:59Z')),
                    motivo,
                    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
                });
                ids.push(ref.id);
            }

            await batch.commit();
            console.log(`[Bloqueos] Creados ${ids.length} bloqueo(s): ${cabanas.join(', ')} | ${fechaInicio} → ${fechaFin} | Motivo: ${motivo}`);
            res.json({ message: `${cabanas.length} bloqueo(s) creado(s).`, ids });
        } catch (err) {
            console.error('Error creando bloqueos:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE - eliminar un bloqueo
    router.delete('/bloqueos/:id', async (req, res) => {
        try {
            await db.collection('bloqueoCabanas').doc(req.params.id).delete();
            console.log(`[Bloqueos] Eliminado bloqueo ${req.params.id}`);
            res.json({ message: 'Bloqueo eliminado.' });
        } catch (err) {
            console.error('Error eliminando bloqueo:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
