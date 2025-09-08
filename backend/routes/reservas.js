// backend/routes/reservas.js - CÓDIGO ACTUALIZADO Y CENTRALIZADO

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const jsonParser = express.json();
const { updateClientMaster } = require('../services/clienteService');

module.exports = (db) => {
    // --- OBTENER TODAS LAS RESERVAS (GET) ---
    router.get('/reservas', async (req, res) => {
        try {
            const snapshot = await db.collection('reservas').orderBy('fechaLlegada', 'desc').get();
            if (snapshot.empty) return res.status(200).json([]);

            const clientsMap = new Map();
            const clientsSnapshot = await db.collection('clientes').get();
            clientsSnapshot.forEach(doc => {
                clientsMap.set(doc.id, doc.data());
            });

            const todasLasReservas = snapshot.docs.map(doc => {
                const data = doc.data();
                const cliente = clientsMap.get(data.clienteId) || {};
                return {
                    id: doc.id,
                    reservaIdOriginal: data.reservaIdOriginal || 'N/A',
                    clienteId: data.clienteId,
                    nombre: data.clienteNombre || 'Sin Nombre',
                    telefono: cliente.phone || 'Sin Teléfono',
                    llegada: data.fechaLlegada ? data.fechaLlegada.toDate().toLocaleDateString('es-CL') : 'N/A',
                    salida: data.fechaSalida ? data.fechaSalida.toDate().toLocaleDateString('es-CL') : 'N/A',
                    estado: data.estado || 'N/A',
                    alojamiento: data.alojamiento || 'N/A',
                    canal: data.canal || 'N/A',
                    valorCLP: data.valorCLP || 0,
                    totalNoches: data.totalNoches || 0,
                    estadoGestion: data.estadoGestion || 'N/A'
                };
            });
            res.status(200).json(todasLasReservas);
        } catch (error) {
            console.error("Error al obtener las reservas consolidadas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- OBTENER DETALLES DE UNA RESERVA INDIVIDUAL (GET) ---
    router.get('/reservas/detalles/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const doc = await db.collection('reservas').doc(id).get();
            if (!doc.exists) return res.status(404).json({ error: 'La reserva no existe.' });
            
            const data = doc.data();
            const reservaConFechasISO = {
                ...data,
                fechaLlegada: data.fechaLlegada.toDate().toISOString().split('T')[0],
                fechaSalida: data.fechaSalida.toDate().toISOString().split('T')[0],
                fechaReserva: data.fechaReserva ? data.fechaReserva.toDate().toISOString().split('T')[0] : null
            };
            res.status(200).json(reservaConFechasISO);
        } catch (error) {
            console.error("Error al obtener los detalles de la reserva:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ACTUALIZAR UNA RESERVA INDIVIDUAL (PUT) ---
    router.put('/reservas/:id', jsonParser, async (req, res) => {
        try {
            const { id } = req.params;
            const datosActualizados = req.body;
            const reservaRef = db.collection('reservas').doc(id);

            if (datosActualizados.fechaLlegada) {
                datosActualizados.fechaLlegada = admin.firestore.Timestamp.fromDate(new Date(datosActualizados.fechaLlegada + 'T00:00:00Z'));
            }
            if (datosActualizados.fechaSalida) {
                datosActualizados.fechaSalida = admin.firestore.Timestamp.fromDate(new Date(datosActualizados.fechaSalida + 'T00:00:00Z'));
            }

            await reservaRef.update(datosActualizados);
            res.status(200).json({ message: 'Reserva actualizada correctamente.' });
        } catch (error) {
            console.error("Error al actualizar la reserva:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ELIMINAR UNA RESERVA INDIVIDUAL (DELETE) ---
    router.delete('/reservas/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await db.collection('reservas').doc(id).delete();
            res.status(200).json({ message: 'Reserva eliminada exitosamente.' });
        } catch (error) {
            console.error(`Error al eliminar la reserva ${id}:`, error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ACTUALIZAR UN GRUPO DE RESERVAS (PUT) ---
    router.put('/reservas/grupo/:reservaIdOriginal', jsonParser, async (req, res) => {
        try {
            const { reservaIdOriginal } = req.params;
            const { nuevoTotalCLP, clienteNombre, telefono } = req.body;

            const query = db.collection('reservas').where('reservaIdOriginal', '==', reservaIdOriginal);
            const snapshot = await query.get();
            if (snapshot.empty) return res.status(404).json({ error: 'No se encontraron reservas.' });

            const clienteId = snapshot.docs[0].data().clienteId;

            if (clienteNombre || telefono) {
                 const clienteRef = db.collection('clientes').doc(clienteId);
                 const clienteDoc = await clienteRef.get();
                 const clienteData = clienteDoc.exists ? clienteDoc.data() : {};
                 const nameParts = clienteNombre ? clienteNombre.split(' ') : [];
                 const telefonoParaActualizar = telefono || clienteData.phone;
                 await updateClientMaster(db, clienteId, {
                     firstname: nameParts.length > 0 ? nameParts[0] : clienteData.firstname,
                     lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : clienteData.lastname,
                     phone: telefonoParaActualizar
                 });
            }

            if (nuevoTotalCLP !== undefined) {
                const batch = db.batch();
                let totalActualCLP = 0;
                snapshot.forEach(doc => { totalActualCLP += doc.data().valorCLP; });
                snapshot.forEach(doc => {
                    const docRef = db.collection('reservas').doc(doc.id);
                    const proporcion = totalActualCLP > 0 ? doc.data().valorCLP / totalActualCLP : 1 / snapshot.size;
                    const nuevoValorIndividual = Math.round(nuevoTotalCLP * proporcion);
                    batch.update(docRef, { valorCLP: nuevoValorIndividual, valorManual: true });
                });
                await batch.commit();
            }

            res.status(200).json({ message: `Grupo de reserva ${reservaIdOriginal} actualizado.` });
        } catch (error) {
            console.error("Error al actualizar el grupo de reservas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- OBTENER RESERVAS DE UN CLIENTE (GET) ---
    router.get('/reservas/cliente/:clienteId', async (req, res) => {
       try {
            const { clienteId } = req.params;
            const q = db.collection('reservas').where('clienteId', '==', clienteId).orderBy('fechaLlegada', 'desc');
            const snapshot = await q.get();

            if (snapshot.empty) {
                return res.status(200).json([]);
            }
            const historial = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    llegada: data.fechaLlegada.toDate().toLocaleDateString('es-CL'),
                    salida: data.fechaSalida.toDate().toLocaleDateString('es-CL'),
                    alojamiento: data.alojamiento,
                    canal: data.canal,
                    valorCLP: data.valorCLP,
                    estado: data.estado
                };
            });
            res.status(200).json(historial);
        } catch (error) {
            console.error("Error al obtener el historial del cliente:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });
    
    // --- ENDPOINT PARA EL CALENDARIO ---
    router.get('/reservas/calendario', async (req, res) => {
        const { anio, mes } = req.query;
        if (!anio || !mes) {
            return res.status(400).json({ error: 'Se requieren el año y el mes.' });
        }

        try {
            const anioNum = parseInt(anio);
            const mesNum = parseInt(mes) - 1;

            const primerDia = new Date(Date.UTC(anioNum, mesNum, 1));
            const ultimoDia = new Date(Date.UTC(anioNum, mesNum + 1, 0, 23, 59, 59));
            
            const startTimestamp = admin.firestore.Timestamp.fromDate(primerDia);
            const endTimestamp = admin.firestore.Timestamp.fromDate(ultimoDia);
            
            const querySnapshot = await db.collection('reservas')
                .where('fechaLlegada', '<=', endTimestamp)
                .get();

            const reservasDelMes = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (data.fechaSalida >= startTimestamp && data.estado !== 'Cancelada') {
                    reservasDelMes.push({
                        id: doc.id,
                        title: data.clienteNombre,
                        start: data.fechaLlegada.toDate().toISOString(),
                        end: data.fechaSalida.toDate().toISOString(),
                        resourceId: data.alojamiento,
                        extendedProps: {
                            canal: data.canal,
                            reservaIdOriginal: data.reservaIdOriginal
                        }
                    });
                }
            });
            
            res.status(200).json(reservasDelMes);

        } catch (error) {
            console.error("Error al obtener datos para el calendario:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- INICIO DE LA MODIFICACIÓN: Nuevo endpoint para disponibilidad ---
    router.get('/reservas/disponibilidad', async (req, res) => {
        const { fechaDesde } = req.query;
        if (!fechaDesde) {
            return res.status(400).json({ error: 'Se requiere una fecha de inicio.' });
        }

        try {
            const startTimestamp = admin.firestore.Timestamp.fromDate(new Date(fechaDesde + 'T00:00:00Z'));

            // Obtener todas las cabañas activas
            const cabanasSnapshot = await db.collection('cabanas').get();
            const cabanasActivas = cabanasSnapshot.docs.map(doc => doc.data().nombre);

            // Obtener todas las reservas futuras desde la fecha indicada
            const reservasFuturasSnapshot = await db.collection('reservas')
                .where('fechaLlegada', '>=', startTimestamp)
                .where('estado', '!=', 'Cancelada')
                .orderBy('fechaLlegada', 'asc')
                .get();
            
            const proximaReservaPorCabana = new Map();

            // Encontrar la primera reserva futura para cada cabaña
            reservasFuturasSnapshot.forEach(doc => {
                const reserva = doc.data();
                if (!proximaReservaPorCabana.has(reserva.alojamiento)) {
                    proximaReservaPorCabana.set(reserva.alojamiento, reserva.fechaLlegada.toDate());
                }
            });

            // Construir el resultado final
            const disponibilidad = cabanasActivas.map(nombreCabana => {
                return {
                    cabana: nombreCabana,
                    proximaReserva: proximaReservaPorCabana.get(nombreCabana)?.toISOString().split('T')[0] || null
                };
            });

            res.status(200).json(disponibilidad);

        } catch (error) {
            console.error("Error al calcular la disponibilidad:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });
    // --- FIN DE LA MODIFICACIÓN ---

    return router;
};