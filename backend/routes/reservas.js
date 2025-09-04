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

            const todasLasReservas = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const cliente = clientsMap.get(data.clienteId) || {};
                const llegada = data.fechaLlegada ? data.fechaLlegada.toDate().toLocaleDateString('es-CL') : 'N/A';
                const salida = data.fechaSalida ? data.fechaSalida.toDate().toLocaleDateString('es-CL') : 'N/A';
                todasLasReservas.push({
                    id: doc.id,
                    reservaIdOriginal: data.reservaIdOriginal || 'N/A',
                    clienteId: data.clienteId,
                    nombre: data.clienteNombre || 'Sin Nombre',
                    telefono: cliente.phone || 'Sin Teléfono',
                    llegada: llegada,
                    salida: salida,
                    estado: data.estado || 'N/A',
                    alojamiento: data.alojamiento || 'N/A',
                    canal: data.canal || 'N/A',
                    valorCLP: data.valorCLP || 0,
                    totalNoches: data.totalNoches || 0,
                    valorManual: data.valorManual || false,
                    nombreManual: data.nombreManual || false,
                    telefonoManual: cliente.telefonoManual || false,
                    estadoGestion: data.estadoGestion || 'N/A'
                });
            });
            res.status(200).json(todasLasReservas);
        } catch (error) {
            console.error("Error al obtener las reservas consolidadas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- INICIO DE LA MODIFICACIÓN ---

    // --- OBTENER DETALLES DE UNA RESERVA INDIVIDUAL (GET) ---
    router.get('/reservas/detalles/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const reservaRef = db.collection('reservas').doc(id);
            const doc = await reservaRef.get();

            if (!doc.exists) {
                return res.status(404).json({ error: 'La reserva no existe.' });
            }

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

    // --- ACTUALIZAR UNA RESERVA INDIVIDUAL (PUT) - MEJORADO ---
    router.put('/reservas/:id', jsonParser, async (req, res) => {
        try {
            const { id } = req.params;
            const datosActualizados = req.body;

            const reservaRef = db.collection('reservas').doc(id);
            const doc = await reservaRef.get();
            if (!doc.exists) return res.status(404).json({ error: 'La reserva no existe.' });

            // Convertir fechas de string a Timestamp de Firestore
            if (datosActualizados.fechaLlegada) {
                datosActualizados.fechaLlegada = admin.firestore.Timestamp.fromDate(new Date(datosActualizados.fechaLlegada));
            }
            if (datosActualizados.fechaSalida) {
                datosActualizados.fechaSalida = admin.firestore.Timestamp.fromDate(new Date(datosActualizados.fechaSalida));
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
            if (!id) {
                return res.status(400).json({ error: 'Se requiere el ID de la reserva.' });
            }
            const reservaRef = db.collection('reservas').doc(id);
            await reservaRef.delete();
            res.status(200).json({ message: 'Reserva eliminada exitosamente.' });
        } catch (error) {
            console.error(`Error al eliminar la reserva ${id}:`, error);
            res.status(500).json({ error: 'Error interno del servidor al eliminar la reserva.' });
        }
    });

    // --- FIN DE LA MODIFICACIÓN ---

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

    return router;
};