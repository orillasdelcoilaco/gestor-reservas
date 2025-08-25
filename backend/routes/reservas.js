// backend/routes/reservas.js - CÓDIGO FINAL Y CENTRALIZADO

const express = require('express');
const router = express.Router();
const jsonParser = express.json();
// Importamos la función maestra del servicio de clientes
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
                    telefonoManual: cliente.telefonoManual || false
                });
            });
            res.status(200).json(todasLasReservas);
        } catch (error) {
            console.error("Error al obtener las reservas consolidadas:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    // --- ACTUALIZAR UNA RESERVA INDIVIDUAL (PUT) ---
    router.put('/reservas/:id', jsonParser, async (req, res) => {
        try {
            const { id } = req.params;
            const { valorCLP, clienteNombre, telefono } = req.body;

            const reservaRef = db.collection('reservas').doc(id);
            const doc = await reservaRef.get();
            if (!doc.exists) return res.status(404).json({ error: 'La reserva no existe.' });

            const originalData = doc.data();
            const clientId = originalData.clienteId;
            
            // --- INICIO DE LA CORRECCIÓN CLAVE ---
            // Buscamos los datos completos del cliente en Firestore para asegurar que tenemos el teléfono correcto
            const clienteRef = db.collection('clientes').doc(clientId);
            const clienteDoc = await clienteRef.get();
            const clienteData = clienteDoc.exists ? clienteDoc.data() : {};
            // --- FIN DE LA CORRECCIÓN CLAVE ---

            if (clienteNombre || telefono) {
                const nameParts = clienteNombre ? clienteNombre.split(' ') : [];
                
                // Usamos el teléfono del body si viene, si no, usamos el que ya está en la base de datos.
                const telefonoParaActualizar = telefono || clienteData.phone;

                await updateClientMaster(db, clientId, {
                    firstname: nameParts.length > 0 ? nameParts[0] : clienteData.firstname,
                    lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : clienteData.lastname,
                    phone: telefonoParaActualizar
                });
            }

            if (valorCLP !== undefined) {
                await reservaRef.update({
                    valorCLP: valorCLP,
                    valorOriginalCLP: originalData.valorCLP,
                    valorManual: true
                });
            }

            res.status(200).json({ message: 'Reserva actualizada correctamente.' });
        } catch (error) {
            console.error("Error al actualizar la reserva:", error);
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

            // --- INICIO DE LA CORRECCIÓN CLAVE ---
            const clienteRef = db.collection('clientes').doc(clienteId);
            const clienteDoc = await clienteRef.get();
            const clienteData = clienteDoc.exists ? clienteDoc.data() : {};
             // --- FIN DE LA CORRECCIÓN CLAVE ---

            if (clienteNombre || telefono) {
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
                const reservasDelGrupo = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    totalActualCLP += data.valorCLP;
                    reservasDelGrupo.push({ id: doc.id, valorCLP: data.valorCLP });
                });
                reservasDelGrupo.forEach(reserva => {
                    const docRef = db.collection('reservas').doc(reserva.id);
                    const proporcion = totalActualCLP > 0 ? reserva.valorCLP / totalActualCLP : 1 / reservasDelGrupo.length;
                    const nuevoValorIndividual = Math.round(nuevoTotalCLP * proporcion);
                    batch.update(docRef, {
                        valorCLP: nuevoValorIndividual,
                        valorOriginalCLP: reserva.valorCLP,
                        valorManual: true
                    });
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

            const historial = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                historial.push({
                    id: doc.id,
                    llegada: data.fechaLlegada.toDate().toLocaleDateString('es-CL'),
                    salida: data.fechaSalida.toDate().toLocaleDateString('es-CL'),
                    alojamiento: data.alojamiento,
                    canal: data.canal,
                    valorCLP: data.valorCLP,
                    estado: data.estado
                });
            });
            res.status(200).json(historial);
        } catch (error) {
            console.error("Error al obtener el historial del cliente:", error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    });

    return router;
};