const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

module.exports = (db) => {
    /**
     * GET /calendario/datos-iniciales
     * Endpoint optimizado que devuelve tanto las cabañas (recursos) como las reservas (eventos)
     * para el mes actual en una sola llamada.
     */
    router.get('/calendario/datos-iniciales', async (req, res) => {
        try {
            const today = new Date();
            const anioNum = today.getFullYear();
            const mesNum = today.getMonth();

            const primerDia = new Date(Date.UTC(anioNum, mesNum, 1));
            const ultimoDia = new Date(Date.UTC(anioNum, mesNum + 1, 0, 23, 59, 59));

            const startTimestamp = admin.firestore.Timestamp.fromDate(primerDia);
            const endTimestamp = admin.firestore.Timestamp.fromDate(ultimoDia);

            // 1. Obtener las cabañas
            const cabanasSnapshot = await db.collection('cabanas').orderBy('nombre', 'asc').get();
            const recursos = cabanasSnapshot.docs.map(doc => ({ id: doc.data().nombre, title: doc.data().nombre }));

            // 2. Obtener las reservas y bloqueos (queries paralelas)
            const [reservasSnapshot, bloqueosSnapshot] = await Promise.all([
                db.collection('reservas')
                    .where('fechaSalida', '>=', startTimestamp)
                    .where('fechaLlegada', '<=', endTimestamp)
                    .get(),
                db.collection('bloqueoCabanas')
                    .where('fechaFin', '>=', startTimestamp)
                    .get()
            ]);

            const eventos = [];
            reservasSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.estado && data.estado.trim().toLowerCase() === 'confirmada') {
                    const uniqueTitle = [...new Set((data.clienteNombre || '').split('\n'))].join(' ').trim();
                    const fechaSalida = data.fechaSalida.toDate();
                    fechaSalida.setDate(fechaSalida.getDate() + 1);

                    eventos.push({
                        id: doc.id,
                        title: uniqueTitle,
                        start: data.fechaLlegada.toDate().toISOString().split('T')[0],
                        end: fechaSalida.toISOString().split('T')[0],
                        resourceId: data.alojamiento,
                        extendedProps: {
                            canal: data.canal,
                            reservaIdOriginal: data.reservaIdOriginal
                        }
                    });
                }
            });

            bloqueosSnapshot.forEach(doc => {
                const b = doc.data();
                const bloqInicio = b.fechaInicio.toDate();
                const bloqFin = b.fechaFin.toDate();
                if (bloqInicio <= ultimoDia) {
                    const endDate = new Date(bloqFin);
                    endDate.setDate(endDate.getDate() + 1);
                    eventos.push({
                        id: `bloqueo-${doc.id}`,
                        title: `Bloqueada: ${b.motivo || 'Sin motivo'}`,
                        start: bloqInicio.toISOString().split('T')[0],
                        end: endDate.toISOString().split('T')[0],
                        resourceId: b.cabana,
                        extendedProps: {
                            isBloqueo: true,
                            motivo: b.motivo || '',
                            canal: 'Bloqueada'
                        }
                    });
                }
            });

            res.status(200).json({ recursos, eventos });

        } catch (error) {
            console.error("Error al obtener datos iniciales para el calendario:", error);
            res.status(500).json({ error: 'Error interno del servidor al cargar datos del calendario.' });
        }
    });

    return router;
};